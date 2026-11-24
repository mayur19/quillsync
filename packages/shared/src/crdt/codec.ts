import type { DeleteRun, InsertRun, OpRun, TargetRange } from './runs.js';

/**
 * Compact binary encoding of op runs (op-log payloads, future binary frames).
 *
 *   magic 0x51 'Q', version 0x01
 *   varint clientCount, then clientCount x (varint byteLength, UTF-8 bytes)
 *   varint runCount, then per run:
 *     u8 tag (0 insert, 1 delete), varint clientIndex, varint seq, varint lamport
 *     insert: u8 hasOrigin, [varint clientIndex, varint seq], varint byteLength, UTF-8 text
 *     delete: varint rangeCount, rangeCount x (varint clientIndex, varint seq, varint len)
 *
 * Varints are unsigned LEB128 limited to Number.MAX_SAFE_INTEGER. Client ids are
 * stored once in a dictionary, so a run costs a handful of bytes plus its text.
 * The decoder validates every length and index and throws CodecError instead of
 * reading out of bounds; it is fuzzed in the test suite.
 */
export const CODEC_MAGIC = 0x51;
export const CODEC_VERSION = 1;
const TAG_INSERT = 0;
const TAG_DELETE = 1;
const MAX_VARINT_BYTES = 8;

export class CodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodecError';
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function writeVarint(out: number[], value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CodecError(`Cannot encode ${value} as an unsigned varint`);
  }
  let rest = value;
  while (rest >= 0x80) {
    out.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  out.push(rest);
}

function writeBytes(out: number[], bytes: Uint8Array): void {
  writeVarint(out, bytes.length);
  for (const byte of bytes) out.push(byte);
}

function collectClients(runs: readonly OpRun[]): string[] {
  const clients = new Set<string>();
  for (const run of runs) {
    clients.add(run.client);
    if (run.k === 'i' && run.origin) clients.add(run.origin.client);
    if (run.k === 'd') for (const range of run.targets) clients.add(range.client);
  }
  return [...clients];
}

export function encodeRuns(runs: readonly OpRun[]): Uint8Array {
  const clients = collectClients(runs);
  const indexOf = new Map(clients.map((client, i) => [client, i]));
  const out: number[] = [CODEC_MAGIC, CODEC_VERSION];
  writeVarint(out, clients.length);
  for (const client of clients) writeBytes(out, encoder.encode(client));
  writeVarint(out, runs.length);
  for (const run of runs) {
    out.push(run.k === 'i' ? TAG_INSERT : TAG_DELETE);
    writeVarint(out, indexOf.get(run.client)!);
    writeVarint(out, run.seq);
    writeVarint(out, run.lamport);
    if (run.k === 'i') {
      out.push(run.origin ? 1 : 0);
      if (run.origin) {
        writeVarint(out, indexOf.get(run.origin.client)!);
        writeVarint(out, run.origin.seq);
      }
      writeBytes(out, encoder.encode(run.text));
    } else {
      writeVarint(out, run.targets.length);
      for (const range of run.targets) {
        writeVarint(out, indexOf.get(range.client)!);
        writeVarint(out, range.seq);
        writeVarint(out, range.len);
      }
    }
  }
  return Uint8Array.from(out);
}

class Reader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  get done(): boolean {
    return this.offset === this.bytes.length;
  }

  byte(): number {
    if (this.offset >= this.bytes.length) throw new CodecError('Unexpected end of input');
    const value = this.bytes[this.offset]!;
    this.offset += 1;
    return value;
  }

  varint(): number {
    let value = 0;
    let scale = 1;
    for (let i = 0; i < MAX_VARINT_BYTES; i += 1) {
      const byte = this.byte();
      value += (byte & 0x7f) * scale;
      if (!Number.isSafeInteger(value)) throw new CodecError('Varint exceeds safe integer range');
      if ((byte & 0x80) === 0) return value;
      scale *= 0x80;
    }
    throw new CodecError('Varint is too long');
  }

  positive(): number {
    const value = this.varint();
    if (value < 1) throw new CodecError('Expected a positive integer');
    return value;
  }

  text(): string {
    const length = this.varint();
    if (length > this.bytes.length - this.offset)
      throw new CodecError('String length out of range');
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    try {
      return decoder.decode(slice);
    } catch {
      throw new CodecError('Invalid UTF-8 sequence');
    }
  }

  count(): number {
    const value = this.varint();
    // Every element needs at least one byte, which bounds allocation on hostile input.
    if (value > this.bytes.length - this.offset) throw new CodecError('Count out of range');
    return value;
  }
}

function client(reader: Reader, clients: readonly string[]): string {
  const index = reader.varint();
  const found = clients[index];
  if (found === undefined) throw new CodecError(`Client index ${index} out of range`);
  return found;
}

function readInsert(
  reader: Reader,
  clients: readonly string[],
  base: Omit<InsertRun, 'k' | 'origin' | 'text'>,
): InsertRun {
  const flag = reader.byte();
  if (flag > 1) throw new CodecError('Invalid origin flag');
  const origin = flag === 1 ? { client: client(reader, clients), seq: reader.positive() } : null;
  const text = reader.text();
  if (text.length === 0) throw new CodecError('Insert run text must not be empty');
  return { k: 'i', ...base, origin, text };
}

function readDelete(
  reader: Reader,
  clients: readonly string[],
  base: Omit<DeleteRun, 'k' | 'targets'>,
): DeleteRun {
  const count = reader.count();
  if (count === 0) throw new CodecError('Delete run must have targets');
  const targets: TargetRange[] = [];
  for (let i = 0; i < count; i += 1) {
    targets.push({
      client: client(reader, clients),
      seq: reader.positive(),
      len: reader.positive(),
    });
  }
  return { k: 'd', ...base, targets };
}

export function decodeRuns(bytes: Uint8Array): OpRun[] {
  const reader = new Reader(bytes);
  if (reader.byte() !== CODEC_MAGIC) throw new CodecError('Bad magic byte');
  const version = reader.byte();
  if (version !== CODEC_VERSION) throw new CodecError(`Unsupported codec version ${version}`);
  const clientCount = reader.count();
  const clients: string[] = [];
  for (let i = 0; i < clientCount; i += 1) clients.push(reader.text());
  const runCount = reader.count();
  const runs: OpRun[] = [];
  for (let i = 0; i < runCount; i += 1) {
    const tag = reader.byte();
    if (tag !== TAG_INSERT && tag !== TAG_DELETE) throw new CodecError(`Unknown run tag ${tag}`);
    const base = {
      client: client(reader, clients),
      seq: reader.positive(),
      lamport: reader.positive(),
    };
    runs.push(
      tag === TAG_INSERT ? readInsert(reader, clients, base) : readDelete(reader, clients, base),
    );
  }
  if (!reader.done) throw new CodecError('Trailing bytes after last run');
  return runs;
}
