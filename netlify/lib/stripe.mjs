// Minimal Stripe REST client and webhook signature check, using only Node built-ins.
import { createHmac, timingSafeEqual } from 'node:crypto';

// Marks Checkout Sessions created by our shop, so the webhook ignores everything
// else on the account (e.g. Payment Links sent by hand for commissions).
export const SHOP_SOURCE = 'poppas-shop';

// Stripe expects nested form fields: line_items[0][price_data][currency]=usd
function flatten(value, prefix, out) {
  if (value === undefined || value === null) return out;
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}[${key}]` : key, out);
  } else {
    out.push([prefix, String(value)]);
  }
  return out;
}

export async function stripeRequest(method, path, params) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Missing environment variable STRIPE_SECRET_KEY');

  const url = new URL(`https://api.stripe.com/v1${path}`);
  const form = params ? new URLSearchParams(flatten(params, '', [])) : null;
  if (form && method === 'GET') url.search = form.toString();

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form && method !== 'GET' ? form : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe ${method} ${path} failed (${res.status}): ${data.error?.message || 'unknown error'}`);
  return data;
}

// Same check as stripe.webhooks.constructEvent: HMAC-SHA256 of "<timestamp>.<raw body>".
export function verifyStripeSignature(payload, header, secret, toleranceSeconds = 300, now = Date.now()) {
  if (!header) throw new Error('Missing Stripe-Signature header');
  let timestamp = null;
  const signatures = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') timestamp = value;
    if (key === 'v1') signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) throw new Error('Malformed Stripe-Signature header');

  const expected = Buffer.from(createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest('hex'));
  const matches = signatures.some((sig) => {
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!matches) throw new Error('Stripe signature does not match');
  if (Math.abs(now / 1000 - Number(timestamp)) > toleranceSeconds) throw new Error('Stripe signature timestamp is outside the tolerance window');
}
