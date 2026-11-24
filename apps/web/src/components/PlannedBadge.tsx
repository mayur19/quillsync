export function PlannedBadge({ ticket }: { ticket?: string }) {
  return (
    <span className="badge badge-planned" title={ticket ? `Tracked as ${ticket}` : undefined}>
      Planned
    </span>
  );
}
