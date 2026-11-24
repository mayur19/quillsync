export interface NavItem {
  readonly label: string;
  readonly path: string;
  readonly status: 'live' | 'planned';
  readonly ticket?: string;
  readonly description?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Documents', path: '/app/docs', status: 'live' },
  {
    label: 'Search',
    path: '/app/search',
    status: 'planned',
    ticket: 'QS-101',
    description:
      'Full-text search across every document you can read, ranked with highlighted snippets.',
  },
  {
    label: 'Comments',
    path: '/app/comments',
    status: 'planned',
    ticket: 'QS-080',
    description: 'Threads anchored to text ranges that survive concurrent edits.',
  },
  {
    label: 'Version history',
    path: '/app/versions',
    status: 'planned',
    ticket: 'QS-071',
    description: 'Named versions, diffs and restore as forward operations.',
  },
  {
    label: 'Notifications',
    path: '/app/notifications',
    status: 'planned',
    ticket: 'QS-084',
    description: 'Mentions and replies, with read state.',
  },
  {
    label: 'Folders & sharing',
    path: '/app/folders',
    status: 'planned',
    ticket: 'QS-090',
    description: 'Folder tree, per-document permissions and expiring share links.',
  },
  {
    label: 'Members',
    path: '/app/members',
    status: 'planned',
    ticket: 'QS-017',
    description: 'Invite people, change roles and remove access.',
  },
];
