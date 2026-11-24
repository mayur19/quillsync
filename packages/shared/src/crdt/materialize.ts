import { compareStamps, idKey } from './ids.js';
import { CrdtError, type Item } from './types.js';

const ROOT = '';

function byStampDescending(a: Item, b: Item): number {
  return compareStamps(b.lamport, b.id.client, a.lamport, a.id.client);
}

/**
 * Builds document order from an unordered set of items using the timestamp-tree
 * view of RGA: every item is a child of its origin, siblings are ordered by
 * descending (lamport, client), and the document is the pre-order traversal.
 *
 * This is equivalent to integrating the items one by one with the RGA scan, in
 * any causal order, and runs in O(n log n) instead of O(n^2). Batch merges and
 * room rehydration use it; property tests assert both paths agree.
 */
export function materialize(items: Iterable<Item>): Item[] {
  const children = new Map<string, Item[]>();
  let count = 0;
  for (const item of items) {
    const parent = item.origin === null ? ROOT : idKey(item.origin);
    const siblings = children.get(parent);
    if (siblings) siblings.push(item);
    else children.set(parent, [item]);
    count += 1;
  }
  for (const siblings of children.values()) siblings.sort(byStampDescending);

  const ordered: Item[] = [];
  // Iterative pre-order DFS; the stack holds sibling lists and a cursor into each.
  const stack: Array<{ list: Item[]; next: number }> = [];
  const rootChildren = children.get(ROOT);
  if (rootChildren) stack.push({ list: rootChildren, next: 0 });
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    if (frame.next >= frame.list.length) {
      stack.pop();
      continue;
    }
    const item = frame.list[frame.next]!;
    frame.next += 1;
    ordered.push(item);
    const kids = children.get(idKey(item.id));
    if (kids) stack.push({ list: kids, next: 0 });
  }

  if (ordered.length !== count) {
    throw new CrdtError('Item set contains items whose origin is missing', 'CAUSALITY_VIOLATION');
  }
  return ordered;
}
