// Marketing landing page — the "Tender Survey" plate brought to life with live data.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CRITERIA, CRITERION_ICONS, CRITERION_LABELS } from '@famplan/shared';
import { api } from '../lib/api';
import { CountUp, Reveal, useTweened, usePrefersReducedMotion } from '../lib/motion';
import { Rosette } from '../components/Rosette';
import { LADDER, SurveyMap, toneFor, type Showcase, type ShowcaseZone } from '../components/SurveyMap';
import { Icon } from '../components/ui';

const SOURCES = [
  'URA Master Plan 2019 subzones',
  'ECDA pre-schools',
  'ECDA child care services',
  'MOE schools',
  'MOH CHAS clinics',
  'NParks parks & playgrounds',
  'LTA MRT stations',
  'LTA bus stops',
  'OpenStreetMap supermarkets',
  'OneMap geocoding & routing',
];

const CRITERION_COPY: Record<(typeof CRITERIA)[number], string> = {
  childcare: 'Childcare and kindergartens within your chosen straight-line radius.',
  schools: 'Primary and secondary schools nearby.',
  groceries: 'Distance to the nearest supermarket.',
  healthcare: 'Distance to the nearest CHAS clinic.',
  green_spaces: 'Parks and playgrounds within reach.',
  public_transport: 'Straight-line distance to the nearest MRT or LRT station.',
  commute: 'Estimated trip to work or grandparents.',
  accessibility: 'Nearby bus stops as a transport-access proxy; step-free access is not verified.',
};

function Eyebrow({ children, className = '' }: { children: string; className?: string }) {
  return <p className={`font-mono text-[11px] tracking-[0.28em] text-muted uppercase ${className}`}>{children}</p>;
}

function Hero({ data, error }: { data: Showcase | null; error: string | null }) {
  return (
    <section className="relative overflow-hidden border-b border-line-soft bg-paper">
      <div className="graticule pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-[1440px] items-center gap-10 px-4 pt-14 pb-16 md:px-10 lg:grid-cols-12 lg:pt-20 lg:pb-24">
        <div className="lg:col-span-5">
          <Reveal>
            <Eyebrow>Family neighbourhood planning · Singapore</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-5 font-display text-[44px] leading-[1.02] tracking-tight text-burgundy sm:text-6xl xl:text-7xl">
              Find the neighbourhood that fits the family you’re <em className="text-cinnabar">becoming.</em>
            </h1>
          </Reveal>
          <Reveal delay={180}>
            <p className="mt-6 max-w-lg text-lg leading-8 text-muted">
              FamPlan uses available public data on childcare, schools, supermarkets, clinics, parks and transport to compare neighbourhoods against
              <em> your</em> priorities, and shows exactly how.
            </p>
          </Reveal>
          <Reveal delay={260} className="mt-8 flex flex-wrap gap-3">
            <Link to="/explore" className="btn-primary px-6 py-3 text-base">
              Explore neighbourhoods
              <Icon name="arrow_forward" className="!text-[20px]" />
            </Link>
            <Link to="/register" className="btn-secondary px-6 py-3 text-base">
              Create a free account
            </Link>
          </Reveal>
          <Reveal delay={340}>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-6">
              {[
                [data?.stats.neighbourhoods, 'family neighbourhoods'],
                [data?.stats.facilities, 'facilities surveyed'],
                [data?.stats.datasets, 'datasets available'],
              ].map(([n, label]) => (
                <div key={label as string}>
                  <dt className="sr-only">{label}</dt>
                  <dd>
                    <span className="block font-display text-4xl text-burgundy">
                      {typeof n === 'number' ? <CountUp to={n} /> : '—'}
                    </span>
                    <span className="mt-1 block font-mono text-[11px] tracking-wider text-muted uppercase">{label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
        <div className="lg:col-span-7">
          <div className="relative">
            {data ? (
              <SurveyMap data={data} />
            ) : (
              error ? <div role="status" className="card p-8 text-muted">{error} You can still set your family preferences and try Explore.</div> : <div className="skeleton aspect-[1000/629] w-full rounded-lg" aria-label="Loading map" />
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2" aria-label="Legend: warmth of fit">
                <span className="font-mono text-[10px] tracking-widest text-muted uppercase">Warmth of fit</span>
                <span className="flex">
                  {LADDER.map((c) => (
                    <span key={c} className="h-2.5 w-7" style={{ background: c }} />
                  ))}
                </span>
              </div>
              <p className="font-mono text-[10px] tracking-widest text-muted uppercase">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-burgundy align-middle" /> Early-childhood centre ·{' '}
                <span className="text-cinnabar">◎ 500 · 1000 · 2000 m</span>
              </p>
            </div>
            <p className="mt-1 hidden text-xs text-muted lg:block">Hover a neighbourhood to see its score. Click to open its profile.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SourcesMarquee() {
  const reduced = usePrefersReducedMotion();
  const row = [...SOURCES, ...SOURCES];
  return (
    <section className="overflow-hidden border-b border-line-soft bg-burgundy py-4 text-peach" aria-label="Data sources">
      <div className={`flex w-max gap-10 whitespace-nowrap ${reduced ? '' : 'marquee'}`}>
        {row.map((s, i) => (
          <span key={i} className="flex items-center gap-10 font-mono text-xs tracking-[0.22em] uppercase" aria-hidden={i >= SOURCES.length}>
            {s}
            <span className="text-cinnabar">✦</span>
          </span>
        ))}
      </div>
    </section>
  );
}

function EightMeasures({ data }: { data: Showcase | null }) {
  const picks: ShowcaseZone[] = data
    ? [...data.zones.filter((z) => z.family && z.petals)].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).filter((_, i) => i % 29 === 0).slice(0, 5)
    : [];
  const [i, setI] = useState(0);
  const z = picks[i];
  const score = useTweened(z?.score ?? 0);
  return (
    <section className="bg-surface-warm">
      <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-4 py-24 md:px-10 lg:grid-cols-2">
        <Reveal className="order-2 flex flex-col items-center lg:order-1">
          <div className="relative">
            {z ? (
              <Rosette key="hero-rosette" values={z.petals!} size={420} labels tone={toneFor(z.score ?? 0)} className="max-w-full" />
            ) : (
              <div className="skeleton h-[420px] w-[420px] max-w-full rounded-full" />
            )}
          </div>
          {z && (
            <div className="mt-2 text-center" aria-live="polite">
              <p className="font-display text-3xl text-burgundy">{z.name}</p>
              <p className="font-mono text-xs tracking-widest text-muted uppercase">
                {z.planningArea} · score <span className="text-cinnabar">{score}</span>
              </p>
              <div className="mt-3 flex justify-center gap-1.5" role="group" aria-label="Example neighbourhoods">
                {picks.map((p, k) => (
                  <button
                    key={p.id}
                    aria-pressed={k === i}
                    aria-label={p.name}
                    onClick={() => setI(k)}
                    className={`h-1.5 rounded-full transition-all duration-500 ${k === i ? 'w-8 bg-cinnabar' : 'w-3 bg-line'}`}
                  />
                ))}
              </div>
            </div>
          )}
        </Reveal>
        <div className="order-1 lg:order-2">
          <Reveal>
            <Eyebrow>The ledger</Eyebrow>
            <h2 className="mt-4 font-display text-5xl leading-[1.05] text-burgundy">
              Eight measures of <em>nearness</em>, weighed your way.
            </h2>
            <p className="mt-5 max-w-md text-muted">
              Each petal is one criterion, normalised from 0 to 1 using published rules. Turn any of them up or down from 0 to 5, and every score on
              FamPlan recalculates, with the maths shown.
            </p>
          </Reveal>
          <ul className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {CRITERIA.map((c, k) => (
              <Reveal as="li" key={c} delay={k * 60} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-peach text-burgundy">
                  <Icon name={CRITERION_ICONS[c]} className="!text-[18px]" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-burgundy">{CRITERION_LABELS[c]}</span>
                  <span className="block text-sm text-muted">{CRITERION_COPY[c]}</span>
                </span>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: '01',
      icon: 'diversity_1',
      title: 'Tell us your stage',
      body: 'Expecting, infant care, preschool, primary or secondary. No names or birth dates, just the stage.',
    },
    {
      n: '02',
      icon: 'travel_explore',
      title: 'We survey the city',
      body: 'Public datasets are checked automatically. If a source fails, the last validated data stays available, with freshness and coverage warnings.',
    },
    {
      n: '03',
      icon: 'balance',
      title: 'Compare with confidence',
      body: 'Side-by-side scores, commute estimates and notes. Every number shows its source and date.',
    },
  ];
  return (
    <section className="border-y border-line-soft bg-paper">
      <div className="mx-auto max-w-[1200px] px-4 py-24 md:px-10">
        <Reveal className="max-w-2xl">
          <Eyebrow>Method</Eyebrow>
          <h2 className="mt-4 font-display text-5xl leading-[1.05] text-burgundy">A survey, not a sales pitch.</h2>
        </Reveal>
        <ol className="mt-14 grid gap-6 md:grid-cols-3">
          {steps.map((s, k) => (
            <Reveal as="li" key={s.n} delay={k * 120} className="group card relative overflow-hidden p-7 transition-shadow duration-500 hover:shadow-float">
              <span className="absolute -top-3 -right-1 font-display text-[120px] leading-none text-peach/60 transition-transform duration-700 group-hover:-translate-y-1" aria-hidden="true">
                {s.n}
              </span>
              <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-burgundy text-peach">
                <Icon name={s.icon} />
              </span>
              <h3 className="relative mt-6 text-xl font-semibold text-burgundy">{s.title}</h3>
              <p className="relative mt-2 text-muted">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Honesty() {
  const items = [
    ['database', 'Every number is sourced', 'Provider, dataset version and retrieval date sit beside each count and distance.'],
    ['functions', 'Scores you can re-derive', 'Raw value, normalised value, weight and contribution for all eight criteria.'],
    ['history', 'Stale data is flagged', 'Anything older than 31 days is marked until a newer validated dataset replaces it.'],
    ['shield_person', 'Only what we need', 'Family stages, never children’s names, birth dates or medical details.'],
  ];
  return (
    <section className="bg-surface-warm">
      <div className="mx-auto max-w-[1200px] px-4 py-24 md:px-10">
        <div className="grid gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <Eyebrow>Principles</Eyebrow>
            <h2 className="mt-4 font-display text-5xl leading-[1.05] text-burgundy">Honest by construction.</h2>
          </Reveal>
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:col-span-8">
            {items.map(([icon, title, body], k) => (
              <Reveal key={title} delay={k * 90} className="border-t border-line pt-5">
                <Icon name={icon} className="text-cinnabar" />
                <h3 className="mt-3 text-lg font-semibold text-burgundy">{title}</h3>
                <p className="mt-1 text-muted">{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-burgundy text-white">
      <div className="graticule graticule-dark pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto flex max-w-[1200px] flex-col items-start gap-8 px-4 py-24 md:flex-row md:items-end md:justify-between md:px-10">
        <Reveal>
          <h2 className="max-w-2xl font-display text-5xl leading-[1.05] text-peach md:text-6xl">
            Plan your next chapter. <em className="text-salmon">Start with your family.</em>
          </h2>
        </Reveal>
        <Reveal delay={120} className="flex flex-wrap gap-3">
          <Link to="/explore" className="btn bg-peach px-6 py-3 text-base text-burgundy hover:bg-salmon">
            Explore now
          </Link>
          <Link to="/register" className="btn border border-peach/60 px-6 py-3 text-base text-peach hover:bg-white/10">
            Create account
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-line-soft bg-paper">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-12 text-sm text-muted md:grid-cols-4 md:px-10">
        <div className="md:col-span-2">
          <p className="flex items-center gap-2 text-xl font-bold text-burgundy">
            <img src="/favicon.svg" alt="" className="h-6 w-6" /> FamPlan
          </p>
          <p className="mt-3 max-w-sm">
            A comparative planning aid for family neighbourhoods. Not a property listing, school-admission predictor or childcare-vacancy service.
          </p>
        </div>
        <nav aria-label="Product">
          <p className="font-mono text-[11px] tracking-widest text-burgundy uppercase">Product</p>
          <ul className="mt-3 space-y-2">
            <li><Link to="/explore" className="hover:text-burgundy">Explore</Link></li>
            <li><Link to="/shortlist" className="hover:text-burgundy">Your shortlist</Link></li>
            <li><Link to="/preferences" className="hover:text-burgundy">Family preferences</Link></li>
          </ul>
        </nav>
        <div>
          <p className="font-mono text-[11px] tracking-widest text-burgundy uppercase">Data</p>
          <p className="mt-3">data.gov.sg (URA, ECDA, MOE, MOH, NParks, LTA), OpenStreetMap contributors (ODbL), OneMap © SLA.</p>
        </div>
      </div>
      <div className="border-t border-line-soft py-4 text-center font-mono text-[10px] tracking-widest text-muted uppercase">
        © 2026 Banana Five-O · NTU SC2006 · proximity is not a promise
      </div>
    </footer>
  );
}

export function LandingPage() {
  const [data, setData] = useState<Showcase | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    document.title = 'FamPlan: find the neighbourhood that fits your family';
    const controller = new AbortController();
    api<Showcase>('/showcase', { signal: controller.signal }).then(setData).catch((e: Error) => {
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => controller.abort();
  }, []);
  return (
    <div className="bg-surface-warm">
      <Hero data={data} error={error} />
      <SourcesMarquee />
      {data && <EightMeasures data={data} />}
      <HowItWorks />
      <Honesty />
      <FinalCta />
      <SiteFooter />
    </div>
  );
}

export { SiteFooter };
