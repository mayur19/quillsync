import type { NavItem } from '../components/navigation';
import { PlannedBadge } from '../components/PlannedBadge';

export function PlannedPage({ item }: { item: NavItem }) {
  return (
    <section className="card planned">
      <h1>
        {item.label} <PlannedBadge ticket={item.ticket} />
      </h1>
      <p>{item.description}</p>
      <p className="muted">
        Tracked as <code>{item.ticket}</code> in the backlog. The API surface already exists and
        answers 501 until it ships.
      </p>
    </section>
  );
}
