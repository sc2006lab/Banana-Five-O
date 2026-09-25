// Minimal Stripe REST client (no SDK): Checkout, Billing Portal, and webhook signature verification.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export const stripeConfigured = () => Boolean(config.stripe.secretKey);

function encode(params: Record<string, string | number | undefined>, prefix = ''): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(prefix ? `${prefix}[${k}]` : k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

async function stripe<T>(path: string, body: string): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.stripe.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe ${path} failed: ${json.error?.message ?? res.status}`);
  return json;
}

export async function createCheckoutSession(opts: { accountId: string; email: string; customerId: string | null; plan: 'family' | 'advisor' }) {
  const price = opts.plan === 'family' ? config.stripe.priceFamily : config.stripe.priceAdvisor;
  if (!price) throw new Error(`No Stripe price configured for the ${opts.plan} plan.`);
  const body = [
    encode({
      mode: 'subscription',
      success_url: `${config.appOrigin}/settings/billing?checkout=success`,
      cancel_url: `${config.appOrigin}/settings/billing?checkout=cancelled`,
      client_reference_id: opts.accountId,
      allow_promotion_codes: 'true',
      ...(opts.customerId ? { customer: opts.customerId } : { customer_email: opts.email }),
    }),
    encode({ price, quantity: 1 }, 'line_items[0]'),
    encode({ accountId: opts.accountId, plan: opts.plan }, 'metadata'),
    encode({ accountId: opts.accountId, plan: opts.plan }, 'subscription_data[metadata]'),
  ].join('&');
  return stripe<{ id: string; url: string }>('checkout/sessions', body);
}

export async function createPortalSession(customerId: string) {
  return stripe<{ url: string }>('billing_portal/sessions', encode({ customer: customerId, return_url: `${config.appOrigin}/settings/billing` }));
}

/** Verify a Stripe-Signature header (v1 scheme, 5-minute tolerance). */
export function verifyWebhook(rawBody: Buffer, header: string | undefined, secret: string, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i), p.slice(i + 1)];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody.toString('utf8')}`).digest('hex');
  const candidates = header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3));
  return candidates.some((c) => c.length === expected.length && timingSafeEqual(Buffer.from(c), Buffer.from(expected)));
}
