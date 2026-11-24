import { idKey, type ItemId } from './ids.js';
import { CrdtError, type DocState } from './types.js';

/**
 * A position expressed as the id of the character to its left (null = start of
 * the document). Unlike an integer offset it survives concurrent edits: text
 * inserted elsewhere shifts the resolved offset but not the anchor.
 */
export type Anchor = ItemId | null;

export function anchorAt(doc: DocState, visibleIndex: number): Anchor {
  if (!Number.isInteger(visibleIndex) || visibleIndex < 0) {
    throw new CrdtError('Anchor index must be a non-negative integer', 'OUT_OF_RANGE');
  }
  if (visibleIndex === 0) return null;
  let seen = 0;
  for (const item of doc.items) {
    if (item.deletedBy !== null) continue;
    seen += 1;
    if (seen === visibleIndex) return item.id;
  }
  throw new CrdtError(`Anchor index ${visibleIndex} is past the end`, 'OUT_OF_RANGE');
}

/**
 * Visible offset of an anchor. A tombstoned anchor resolves to the position
 * where its character used to be. Returns null for unknown (or collected) ids,
 * letting callers fall back to a previous offset.
 */
export function resolveAnchor(doc: DocState, anchor: Anchor): number | null {
  if (anchor === null) return 0;
  const key = idKey(anchor);
  if (!doc.index.has(key)) return null;
  let visible = 0;
  for (const item of doc.items) {
    if (item.deletedBy === null) visible += 1;
    if (idKey(item.id) === key) return visible;
  }
  return null;
}
