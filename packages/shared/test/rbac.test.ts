import { describe, expect, it } from 'vitest';
import { hasPermission, isRole, permissionsFor, PERMISSIONS } from '../src/index.js';

describe('RBAC matrix', () => {
  it('grants owners everything', () => {
    expect(permissionsFor('owner')).toEqual(PERMISSIONS);
  });

  it('separates editing, commenting and reading', () => {
    expect(hasPermission('editor', 'document:edit')).toBe(true);
    expect(hasPermission('editor', 'member:manage')).toBe(false);
    expect(hasPermission('commenter', 'document:comment')).toBe(true);
    expect(hasPermission('commenter', 'document:edit')).toBe(false);
    expect(hasPermission('viewer', 'document:read')).toBe(true);
    expect(hasPermission('viewer', 'document:comment')).toBe(false);
  });

  it('recognises roles', () => {
    expect(isRole('viewer')).toBe(true);
    expect(isRole('admin')).toBe(false);
    expect(isRole(3)).toBe(false);
  });
});
