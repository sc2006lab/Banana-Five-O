// Eight measures of nearness drawn as a rosette — the ledger glyph from the Tender Survey plate.
import { CRITERIA, CRITERION_LABELS, type Criterion } from '@famplan/shared';
import { useInView } from '../lib/motion';

const SHORT: Record<Criterion, string> = {
  childcare: 'CHILDCARE',
  schools: 'SCHOOLS',
  groceries: 'GROCERIES',
  healthcare: 'HEALTH',
  green_spaces: 'GREEN',
  public_transport: 'TRANSIT',
  commute: 'COMMUTE',
  accessibility: 'ACCESS',
};

export function Rosette({
  values,
  size = 96,
  tone = '#c51a27',
  highlight = false,
  labels = false,
  animate = true,
  className = '',
  title,
}: {
  values: (number | null)[];
  size?: number;
  tone?: string;
  highlight?: boolean;
  labels?: boolean;
  animate?: boolean;
  className?: string;
  title?: string;
}) {
  const [ref, inView] = useInView<SVGSVGElement>();
  const show = !animate || inView;
  const pad = labels ? 64 : 10;
  const R = 50;
  const box = R + pad;
  const petalW = 7.5;
  const desc =
    title ??
    `Rosette: ${CRITERIA.map((c, i) => `${CRITERION_LABELS[c]} ${values[i] === null ? 'no data' : Math.round((values[i] ?? 0) * 100) + '%'}`).join(', ')}`;
  return (
    <svg ref={ref} viewBox={`${-box} ${-box} ${box * 2} ${box * 2}`} width={size} height={size} className={className} role="img" aria-label={desc}>
      <circle r={R} fill="none" stroke="var(--color-line-soft)" strokeWidth={1} />
      {highlight && <circle r={R + 8} fill="none" stroke="var(--color-cinnabar)" strokeWidth={1.4} className="rosette-halo" />}
      {values.map((v, k) => {
        const angle = -90 + k * 45;
        if (v === null) {
          return (
            <g key={k} transform={`rotate(${angle})`}>
              <line x1={6} y1={0} x2={R - 5} y2={0} stroke="var(--color-muted)" strokeWidth={1.4} strokeDasharray="1.5 5" strokeLinecap="round" />
              <circle cx={R} cy={0} r={3.4} fill="none" stroke="var(--color-cinnabar)" strokeWidth={1} />
            </g>
          );
        }
        const L = Math.max(v, 0.04) * R;
        return (
          <g key={k} transform={`rotate(${angle})`}>
            <path
              d={`M0,0 L${L * 0.45},${-petalW} L${L},0 L${L * 0.45},${petalW} Z`}
              fill={tone}
              stroke="var(--color-burgundy)"
              strokeWidth={0.8}
              strokeLinejoin="round"
              className="rosette-petal"
              style={{ transform: `scaleX(${show ? 1 : 0})`, transitionDelay: `${k * 70}ms` }}
            />
          </g>
        );
      })}
      <circle r={2.6} fill="var(--color-burgundy)" />
      {labels &&
        CRITERIA.map((c, k) => {
          const a = ((-90 + k * 45) * Math.PI) / 180;
          const x = Math.cos(a) * (R + 12);
          const y = Math.sin(a) * (R + 12);
          const anchor = Math.abs(x) < 4 ? 'middle' : x > 0 ? 'start' : 'end';
          return (
            <text key={c} x={x} y={y} dy="0.35em" textAnchor={anchor} className="fill-muted" style={{ fontSize: 6.4, fontFamily: 'var(--font-mono)', letterSpacing: '0.12em' }}>
              {SHORT[c]}
            </text>
          );
        })}
    </svg>
  );
}
