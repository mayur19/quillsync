import type { SocketLike } from '../src/collab/sync-client';

export class FakeSocket implements SocketLike {
  readyState = 0;
  sent: unknown[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.({});
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(message: unknown): void {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }
  drop(): void {
    this.readyState = 3;
    this.onclose?.({});
  }
  sentOfType(type: string): Array<Record<string, unknown>> {
    return this.sent.filter((m) => (m as { type: string }).type === type) as Array<
      Record<string, unknown>
    >;
  }
}
