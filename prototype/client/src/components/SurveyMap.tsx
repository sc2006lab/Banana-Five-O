// Animated "Tender Survey" map: real URA subzones, scored neighbourhoods, and every early-childhood centre.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInView, usePrefersReducedMotion } from '../lib/motion';

export interface ShowcaseZone {
  id: string;
  name: string;
  planningArea: string;
  family: boolean;
  score: number | null;
  path: string;
  cx: number;
  cy: number;
  petals: (number | null)[] | null;
}
export interface Showcase {
  width: number;
  height: number;
  zones: ShowcaseZone[];
  points: [number, number][];
  best: { id: string; name: string; x: number; y: number; ringsPx: Record<'500' | '1000' | '2000', number> };
  stats: { subzones: number; neighbourhoods: number; facilities: number; earlyCare: number; datasets: number };
}

export const LADDER = ['#f6e4d9', '#f3d3c4', '#edbcaf', '#de9893', '#ba636b', '#7e2b3b'];
const STEPS = [0, 55, 65, 75, 85, 93];
export const toneFor = (score: number) => LADDER[STEPS.reduce((acc, t, i) => (score >= t ? i : acc), 0)];

export function SurveyMap({ data, interactive = true, className = '' }: { data: Showcase; interactive?: boolean; className?: string }) {
  const [ref, inView] = useInView<SVGSVGElement>('0px');
  const reduced = usePrefersReducedMotion();
  const nav = useNavigate();
  const [hover, setHover] = useState<ShowcaseZone | null>(null);
  const on = inView || reduced;
  const minX = useMemo(() => Math.min(...data.zones.map((z) => z.cx)), [data]);
  const spanX = useMemo(() => Math.max(...data.zones.map((z) => z.cx)) - minX || 1, [data, minX]);
  // A west→east sweep: each zone's delay follows its longitude, like a surveyor's pass across the island.
  const delayOf = (x: number, base: number, span: number) => (reduced ? 0 : base + ((x - minX) / spanX) * span);

  return (
    <figure className={`relative ${className}`}>
      <svg
        ref={ref}
        viewBox={`0 0 ${data.width} ${data.height}`}
        className={`survey-map h-auto w-full ${on ? 'is-on' : ''}`}
        role={interactive ? 'group' : 'img'}
        aria-label={`Map of Singapore's ${data.stats.subzones} URA subzones. ${data.stats.neighbourhoods} family neighbourhoods are shaded by suitability score; dots mark ${data.stats.earlyCare} early-childhood centres.`}
        onMouseLeave={() => setHover(null)}
      >
        <g className="sm-ground">
          {data.zones
            .filter((z) => !z.family)
            .map((z) => (
              <path key={z.id} d={z.path} pathLength={1} className="sm-contour" style={{ animationDelay: `${delayOf(z.cx, 0, 900)}ms` }} />
            ))}
        </g>
        <g className="sm-field">
          {data.zones
            .filter((z) => z.family)
            .map((z) => (
              <path
                key={z.id}
                d={z.path}
                className={`sm-zone ${hover?.id === z.id ? 'is-hover' : ''} ${interactive ? 'cursor-pointer' : ''}`}
                fill={toneFor(z.score ?? 0)}
                style={{ animationDelay: `${delayOf(z.cx, 500, 1400)}ms` }}
                onMouseEnter={interactive ? () => setHover(z) : undefined}
                onClick={interactive ? () => nav(`/n/${z.id}`) : undefined}
                role={interactive ? 'link' : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={interactive ? `${z.name}, ${z.planningArea}: view neighbourhood profile` : undefined}
                onFocus={interactive ? () => setHover(z) : undefined}
                onBlur={interactive ? () => setHover(null) : undefined}
                onKeyDown={interactive ? (event) => {
                  if (event.key === 'Enter') nav(`/n/${z.id}`);
                } : undefined}
              />
            ))}
        </g>
        <g className="sm-points" aria-hidden="true">
          {data.points.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={0.95} style={{ animationDelay: `${reduced ? 0 : 1500 + ((i * 7919) % 1949) * 0.55}ms` }} />
          ))}
        </g>
        <g className="sm-rings" transform={`translate(${data.best.x} ${data.best.y})`} aria-hidden="true">
          {(['2000', '1000', '500'] as const).map((k, i) => (
            <circle key={k} r={data.best.ringsPx[k]} className="sm-ring" style={{ animationDelay: `${2600 + i * 180}ms` }} />
          ))}
          <circle r={2.4} className="sm-core" />
        </g>
      </svg>
      {interactive && hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-burgundy px-3 py-2 text-xs text-white shadow-float"
          style={{ left: `${(hover.cx / data.width) * 100}%`, top: `calc(${(hover.cy / data.height) * 100}% - 10px)` }}
        >
          <span className="block font-semibold">{hover.name}</span>
          <span className="block text-white/75">
            {hover.planningArea} · score {hover.score}
          </span>
        </div>
      )}
    </figure>
  );
}
