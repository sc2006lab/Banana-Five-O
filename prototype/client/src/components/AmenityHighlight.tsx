import { AMENITY_LABELS, type NeighbourhoodSummary } from '@famplan/shared';
import { fmtDistance } from '../lib/api';
import { StateBadge } from './ui';

export function AmenityHighlight({ item }: { item: NeighbourhoodSummary['highlights'][number] }) {
  return (
    <span className="chip flex-wrap">
      {AMENITY_LABELS[item.category]}: {item.state === 'UNAVAILABLE' ? '—' : item.count}
      {item.nearestM !== null && <span> · nearest {fmtDistance(item.nearestM)}</span>}
      {item.state !== 'AVAILABLE' && <StateBadge state={item.state} />}
    </span>
  );
}
