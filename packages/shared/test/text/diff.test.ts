import { describe, expect, it } from 'vitest';
import { codePointToUtf16, diffText, utf16ToCodePoint } from '../../src/index.js';

describe('diffText', () => {
  it('detects insertions, deletions and replacements', () => {
    expect(diffText('abc', 'abc')).toBeNull();
    expect(diffText('abc', 'abXc')).toEqual({ index: 2, deleteCount: 0, insert: 'X' });
    expect(diffText('abc', 'ac')).toEqual({ index: 1, deleteCount: 1, insert: '' });
    expect(diffText('hello world', 'hello there')).toEqual({
      index: 6,
      deleteCount: 5,
      insert: 'there',
    });
    expect(diffText('', 'new')).toEqual({ index: 0, deleteCount: 0, insert: 'new' });
  });

  it('handles repeated characters without overlapping prefix and suffix', () => {
    expect(diffText('aaa', 'aaaa')).toEqual({ index: 3, deleteCount: 0, insert: 'a' });
    expect(diffText('aaaa', 'aa')).toEqual({ index: 2, deleteCount: 2, insert: '' });
  });

  it('works in code points', () => {
    expect(diffText('a😀b', 'ab')).toEqual({ index: 1, deleteCount: 1, insert: '' });
  });

  it('converts between UTF-16 and code-point offsets', () => {
    const text = 'a😀b';
    expect(utf16ToCodePoint(text, 3)).toBe(2);
    expect(codePointToUtf16(text, 2)).toBe(3);
    expect(utf16ToCodePoint(text, -4)).toBe(0);
    expect(codePointToUtf16(text, -1)).toBe(0);
  });
});
