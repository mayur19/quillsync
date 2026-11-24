import { z } from 'zod';
import { CLIENT_ID_PATTERN } from '../crdt/ids.js';
import type { OpRun } from '../crdt/runs.js';

/** Limits applied to every inbound frame (see threat model: oversized payloads). */
export const PROTOCOL_LIMITS = {
  maxRunsPerMessage: 500,
  maxRunText: 20_000,
  maxTargetsPerRun: 2_000,
  maxVectorEntries: 2_000,
} as const;

const positiveInt = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const clientIdSchema = z.string().regex(CLIENT_ID_PATTERN, 'Invalid client id');

export const itemIdSchema = z.object({ client: clientIdSchema, seq: positiveInt }).strict();

export const stateVectorSchema = z
  .record(clientIdSchema, z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER))
  .refine((v) => Object.keys(v).length <= PROTOCOL_LIMITS.maxVectorEntries, 'Vector too large');

export const insertRunSchema = z
  .object({
    k: z.literal('i'),
    client: clientIdSchema,
    seq: positiveInt,
    lamport: positiveInt,
    origin: itemIdSchema.nullable(),
    text: z.string().min(1).max(PROTOCOL_LIMITS.maxRunText),
  })
  .strict();

export const deleteRunSchema = z
  .object({
    k: z.literal('d'),
    client: clientIdSchema,
    seq: positiveInt,
    lamport: positiveInt,
    targets: z
      .array(z.object({ client: clientIdSchema, seq: positiveInt, len: positiveInt }).strict())
      .min(1)
      .max(PROTOCOL_LIMITS.maxTargetsPerRun)
      .readonly(),
  })
  .strict();

export const opRunSchema = z.discriminatedUnion('k', [insertRunSchema, deleteRunSchema]);
export const runsSchema = z.array(opRunSchema).max(PROTOCOL_LIMITS.maxRunsPerMessage);

export const anchorSchema = itemIdSchema.nullable();

export const clientMessageSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('hello'), clientId: clientIdSchema, vector: stateVectorSchema })
    .strict(),
  z.object({ type: z.literal('ops'), runs: runsSchema.min(1) }).strict(),
  z.object({ type: z.literal('presence'), anchor: anchorSchema, focused: z.boolean() }).strict(),
  z.object({ type: z.literal('ping') }).strict(),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const peerSchema = z.object({
  clientId: clientIdSchema,
  userId: z.string(),
  displayName: z.string(),
  color: z.string(),
  anchor: anchorSchema,
  focused: z.boolean(),
});
export type Peer = z.infer<typeof peerSchema>;

export const ERROR_CODES = [
  'BAD_MESSAGE',
  'NOT_READY',
  'FORBIDDEN',
  'INVALID_OP',
  'CAUSALITY_VIOLATION',
  'CLIENT_MISMATCH',
  'INTERNAL',
] as const;

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('welcome'),
    vector: stateVectorSchema,
    runs: z.array(opRunSchema).readonly(),
    peers: z.array(peerSchema),
    canEdit: z.boolean(),
  }),
  z.object({ type: z.literal('ops'), runs: z.array(opRunSchema).readonly(), from: clientIdSchema }),
  z.object({ type: z.literal('ack'), vector: stateVectorSchema }),
  z.object({ type: z.literal('presence'), peer: peerSchema }),
  z.object({ type: z.literal('peer-left'), clientId: clientIdSchema }),
  z.object({ type: z.literal('error'), code: z.enum(ERROR_CODES), message: z.string() }),
  z.object({ type: z.literal('pong') }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

/** Compile-time check that the zod run schema matches the CRDT run type. */
export type WireRun = z.infer<typeof opRunSchema>;
const _runCompat: (run: WireRun) => OpRun = (run) => run;
void _runCompat;

/** Deterministic presence colour for a client id (hue from a string hash). */
export function colorForClient(clientId: string): string {
  let hash = 0;
  for (const char of clientId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 70% 45%)`;
}
