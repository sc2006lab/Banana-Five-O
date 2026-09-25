// Plan & billing: current subscription, usage, and plan changes (Stripe Checkout or clearly labelled demo mode).
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PLANS, PLAN_IDS, planOf, type BillingDto, type PlanId } from '@famplan/shared';
import { api, ApiError, fmtDate } from '../lib/api';
import { useApp } from '../state/AppState';
import { SettingsNav, UsageMeter } from '../components/SettingsNav';
import { Icon, Notice, Spinner } from '../components/ui';

export function BillingPage() {
  const { me, refreshMe, refreshWorkspaces, toast } = useApp();
  const [sp, setSp] = useSearchParams();
  const [billing, setBilling] = useState<BillingDto | null>(null);
  const [demo, setDemo] = useState<PlanId | null>(null);
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api<BillingDto>('/billing').then(setBilling), []);

  useEffect(() => {
    document.title = 'Plan & billing | FamPlan';
    void load().catch((e) => setError((e as Error).message));
  }, [load]);

  // Returning from Stripe, or arriving from a pricing CTA (?plan=family)
  useEffect(() => {
    const checkout = sp.get('checkout');
    if (checkout === 'success') toast('Payment received. Your plan will update in a moment.', 'success');
    if (checkout === 'cancelled') toast('Checkout cancelled. No charge was made.', 'info');
    const wanted = sp.get('plan') as PlanId | null;
    if (checkout || wanted) {
      sp.delete('checkout');
      sp.delete('plan');
      setSp(sp, { replace: true });
      if (wanted && PLAN_IDS.includes(wanted) && wanted !== 'household') void choose(wanted);
      if (checkout === 'success') setTimeout(() => void Promise.all([load(), refreshMe()]), 2500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = async (plan: PlanId) => {
    setError(null);
    setBusy(plan);
    try {
      const r = await api<{ mode: 'redirect' | 'demo'; url?: string }>('/billing/checkout', { method: 'POST', body: { plan } });
      if (r.mode === 'redirect' && r.url) window.location.assign(r.url);
      else setDemo(plan);
    } catch (e) {
      setError((e as ApiError).fields?.plan ?? (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const confirmDemo = async () => {
    if (!demo) return;
    try {
      const r = await api<{ message: string }>('/billing/demo/confirm', { method: 'POST', body: { plan: demo } });
      setDemo(null);
      toast(r.message, 'success');
      await Promise.all([load(), refreshMe(), refreshWorkspaces()]);
    } catch (e) {
      setDemo(null);
      setError((e as ApiError).fields?.plan ?? (e as Error).message);
    }
  };

  if (!billing || !me) return <div className="mx-auto max-w-5xl px-4 py-8 md:px-8"><SettingsNav /><Spinner /></div>;
  const current = planOf(billing.plan);
  const ws = me.workspace;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <h1 className="font-display text-5xl text-burgundy">Settings</h1>
      <p className="mt-1 mb-6 text-muted">Your plan applies to every workspace you own.</p>
      <SettingsNav />

      {billing.provider === 'demo' && (
        <Notice tone="warn" className="mb-6">
          <strong>Demo billing mode.</strong> Stripe isn’t configured on this server, so plan changes apply instantly and <strong>no payment is taken</strong>. Set{' '}
          <code>STRIPE_SECRET_KEY</code> and price IDs to take real payments.
        </Notice>
      )}
      {error && <Notice tone="error" className="mb-6">{error}</Notice>}

      <section className="relative overflow-hidden rounded-xl bg-burgundy p-7 text-white">
        <div className="graticule graticule-dark pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-mono text-[11px] tracking-[0.25em] text-peach/80 uppercase">Current plan</p>
            <h2 className="mt-2 font-display text-5xl text-peach">{current.name}</h2>
            <p className="mt-1 text-white/75">{current.tagline}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-4xl">{current.priceMonthlySgd === 0 ? 'Free' : `S$${current.priceMonthlySgd}`}<span className="text-base text-white/70">{current.priceMonthlySgd ? ' / month' : ''}</span></p>
            {billing.currentPeriodEnd && <p className="text-sm text-white/70">Renews {fmtDate(billing.currentPeriodEnd)}</p>}
            {billing.status === 'past_due' && <p className="mt-1 rounded bg-poor px-2 py-0.5 text-xs font-semibold">Payment past due</p>}
          </div>
        </div>
        <div className="relative mt-7 grid gap-5 rounded-lg bg-white/95 p-5 text-ink sm:grid-cols-3">
          <UsageMeter label="Workspaces you own" used={billing.usage.ownedWorkspaces} limit={billing.usage.ownedWorkspaceLimit} />
          {ws && <UsageMeter label={`People in “${ws.name}”`} used={ws.memberCount} limit={ws.memberLimit} />}
          {ws && <UsageMeter label="Shortlist" used={ws.shortlistCount} limit={ws.shortlistLimit} />}
        </div>
        {billing.provider === 'stripe' && billing.canManage && (
          <button
            className="btn relative mt-5 border border-peach/60 text-peach hover:bg-white/10"
            onClick={async () => {
              try {
                const r = await api<{ url: string }>('/billing/portal', { method: 'POST', body: {} });
                window.location.assign(r.url);
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            }}
          >
            <Icon name="receipt_long" className="!text-[18px]" /> Invoices & payment method
          </button>
        )}
      </section>

      <h2 className="mt-10 text-xl font-semibold text-burgundy">Change plan</h2>
      <div className="stagger mt-4 grid gap-5 lg:grid-cols-3">
        {PLAN_IDS.map((id, k) => {
          const p = PLANS[id];
          const isCurrent = id === billing.plan;
          const upgrade = p.priceMonthlySgd > current.priceMonthlySgd;
          return (
            <article
              key={id}
              style={{ ['--i' as string]: k }}
              className={`flex flex-col rounded-xl border p-6 transition-all duration-300 ${isCurrent ? 'border-cinnabar bg-blush/60' : 'border-burgundy/10 bg-white hover:-translate-y-0.5 hover:shadow-float'}`}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-3xl text-burgundy">{p.name}</h3>
                <span className="font-display text-2xl text-burgundy">{p.priceMonthlySgd ? `S$${p.priceMonthlySgd}` : 'Free'}</span>
              </div>
              <p className="mt-1 text-sm text-muted">{p.tagline}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Icon name="check" className="!text-[18px] text-cinnabar" />
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <p className="mt-5 rounded border border-cinnabar/40 py-2 text-center text-sm font-semibold text-cinnabar">Your current plan</p>
              ) : (
                <button className={`mt-5 w-full ${upgrade ? 'btn-primary' : 'btn-secondary'}`} disabled={busy !== null} onClick={() => choose(id)}>
                  {busy === id ? 'Opening…' : upgrade ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}
                </button>
              )}
            </article>
          );
        })}
      </div>

      {demo && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-burgundy-deep/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="demo-h">
          <div className="page-enter w-full max-w-md rounded-xl bg-white p-6 shadow-float">
            <p className="font-mono text-[11px] tracking-widest text-fair uppercase">Demo checkout · no payment</p>
            <h2 id="demo-h" className="mt-2 font-display text-3xl text-burgundy">
              {PLANS[demo].priceMonthlySgd ? `Activate ${PLANS[demo].name}` : `Return to ${PLANS[demo].name}`}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {PLANS[demo].priceMonthlySgd
                ? `In production this opens Stripe Checkout for S$${PLANS[demo].priceMonthlySgd}/month. In demo mode the plan is switched on without taking a payment.`
                : 'Your workspaces will return to Household limits.'}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setDemo(null)}>Cancel</button>
              <button className="btn-primary" onClick={confirmDemo} autoFocus>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
