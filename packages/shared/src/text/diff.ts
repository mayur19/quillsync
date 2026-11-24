/**
 * Minimal single-region diff between two strings, in code points.
 *
 * A textarea reports only its new value; the editor turns each change into
 * one delete followed by one insert at the first differing position. Common
 * prefix and suffix are found in O(n).
 */
export interface TextEdit {
  readonly index: number;
  readonly deleteCount: number;
  readonly insert: string;
}

export function diffText(previous: string, next: string): TextEdit | null {
  if (previous === next) return null;
  const a = Array.from(previous);
  const b = Array.from(next);
  let prefix = 0;
  const maxPrefix = Math.min(a.length, b.length);
  while (prefix < maxPrefix && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  const maxSuffix = Math.min(a.length, b.length) - prefix;
  while (suffix < maxSuffix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix += 1;
  return {
    index: prefix,
    deleteCount: a.length - prefix - suffix,
    insert: b.slice(prefix, b.length - suffix).join(''),
  };
}

/** Converts a UTF-16 offset (DOM selection) into a code-point offset (CRDT). */
export function utf16ToCodePoint(text: string, utf16Offset: number): number {
  return Array.from(text.slice(0, Math.max(0, utf16Offset))).length;
}

/** Converts a code-point offset (CRDT) into a UTF-16 offset (DOM selection). */
export function codePointToUtf16(text: string, codePointOffset: number): number {
  return Array.from(text).slice(0, Math.max(0, codePointOffset)).join('').length;
}
