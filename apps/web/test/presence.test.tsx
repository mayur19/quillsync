import { createDoc, localInsert, type Peer } from '@quillsync/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PresenceList } from '../src/components/PresenceList';
import { RemoteCarets } from '../src/components/RemoteCarets';

const peer = (
  clientId: string,
  displayName: string,
  focused = true,
  anchor: Peer['anchor'] = null,
): Peer => ({
  clientId,
  userId: clientId,
  displayName,
  color: 'rgb(1, 2, 3)',
  anchor,
  focused,
});

describe('presence list', () => {
  it('lists other people and hides the current tab', () => {
    render(
      <PresenceList
        peers={[
          peer('self1234', 'Me'),
          peer('grace123', 'Grace'),
          peer('linus123', 'Linus', false),
        ]}
        selfClientId="self1234"
      />,
    );
    expect(screen.getByLabelText('People editing this document')).toBeInTheDocument();
    expect(screen.getByText('Grace')).toBeInTheDocument();
    expect(screen.queryByText('Me')).not.toBeInTheDocument();
    expect(screen.getByText('(editing)', { exact: false })).toBeInTheDocument();
  });

  it('says when you are alone', () => {
    render(<PresenceList peers={[peer('self1234', 'Me')]} selfClientId="self1234" />);
    expect(screen.getByText('Only you are here.')).toBeInTheDocument();
  });
});

describe('remote carets', () => {
  it('places carets at anchored positions for focused peers only', () => {
    const doc = localInsert(createDoc(), 'author12', 0, 'hello').doc;
    const { container } = render(
      <RemoteCarets
        doc={doc}
        text="hello"
        selfClientId="self1234"
        peers={[
          peer('grace123', 'Grace', true, { client: 'author12', seq: 2 }),
          peer('linus123', 'Linus', false, null),
          peer('self1234', 'Me', true, null),
          peer('ghost123', 'Ghost', true, { client: 'missing1', seq: 9 }),
        ]}
      />,
    );
    const carets = screen.getAllByTestId('remote-caret');
    expect(carets).toHaveLength(1);
    expect(carets[0]).toHaveTextContent('Grace');
    expect(container.textContent).toBe('heGracello​');
  });
});
