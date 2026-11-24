export const ROLES = ['owner', 'editor', 'commenter', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'document:read',
  'document:create',
  'document:edit',
  'document:comment',
  'document:manage',
  'member:manage',
  'audit:read',
  'workspace:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Readonly<Record<Role, readonly Permission[]>> = {
  owner: PERMISSIONS,
  editor: ['document:read', 'document:create', 'document:edit', 'document:comment'],
  commenter: ['document:read', 'document:comment'],
  viewer: ['document:read'],
};

export function permissionsFor(role: Role): readonly Permission[] {
  return MATRIX[role];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
