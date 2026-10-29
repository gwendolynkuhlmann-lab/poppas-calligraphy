// POST /.netlify/functions/create-checkout   body: { items: [{ sku, quantity }] }
// Creates a Stripe Checkout Session for standard shop items and returns { url }.
// Price, name and available stock come from a fresh read of the sheet — never from the
// browser — so whatever is in the sheet right now is what gets charged.
// Commission originals don't come through here; they use hand-sent Stripe Payment Links.
import { readInventory } from '../lib/inventory.mjs';
import { stripeRequest, SHOP_SOURCE } from '../lib/stripe.mjs';

const SKU_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const MAX_LINE_ITEMS = 20;
const SESSION_MINUTES = 30; // Stripe's minimum; keeps the gap between stock check and payment short

const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export default async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });

  let body;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Invalid request.' });
  }

  const requested = Array.isArray(body?.items) ? body.items : [];
  if (requested.length === 0 || requested.length > MAX_LINE_ITEMS) return reply(400, { error: 'Invalid request.' });

  const wanted = new Map(); // sku -> quantity, merging duplicates
  for (const entry of requested) {
    const sku = String(entry?.sku ?? '').trim();
    const quantity = Number(entry?.quantity ?? 1);
    if (!SKU_PATTERN.test(sku) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return reply(400, { error: 'Invalid item in request.' });
    }
    wanted.set(sku, (wanted.get(sku) || 0) + quantity);
  }

  let inventory;
  try {
    inventory = await readInventory();
  } catch (err) {
    console.error('[create-checkout] Could not read the inventory sheet:', err);
    return reply(502, { error: "We couldn't check stock just now. Please try again in a few minutes." });
  }
  const bySku = new Map(inventory.map((item) => [item.sku, item]));

  const lineItems = [];
  for (const [sku, quantity] of wanted) {
    const item = bySku.get(sku);
    if (!item || item.price === null) {
      return reply(409, { error: "Sorry, that item isn't available to buy right now.", sku });
    }
    if (!item.inStock) return reply(409, { error: `Sorry, ${item.name} is sold out.`, sku });
    if (item.quantity < quantity) return reply(409, { error: `Sorry, only ${item.quantity} left of ${item.name}.`, sku });

    lineItems.push({
      quantity,
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(item.price * 100),
        product_data: { name: item.name, metadata: { sku } },
      },
      // Let shoppers change quantity on the Stripe page, capped at what's on hand.
      ...(item.quantity > 1 && { adjustable_quantity: { enabled: true, minimum: 1, maximum: Math.min(item.quantity, 99) } }),
    });
  }

  const site = process.env.URL || new URL(req.url).origin;
  try {
    const session = await stripeRequest('POST', '/checkout/sessions', {
      mode: 'payment',
      line_items: lineItems,
      // Cards only (includes Apple Pay / Google Pay): payment is final at checkout, so stock
      // is decremented once, with no delayed-payment reversals to handle.
      payment_method_types: ['card'],
      shipping_address_collection: { allowed_countries: ['US'] },
      metadata: { source: SHOP_SOURCE },
      payment_intent_data: { metadata: { source: SHOP_SOURCE } },
      success_url: `${site}/ink-shop.html?checkout=success`,
      cancel_url: `${site}/ink-shop.html?checkout=cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + SESSION_MINUTES * 60,
    });
    return reply(200, { url: session.url });
  } catch (err) {
    console.error('[create-checkout] Stripe session creation failed:', err);
    return reply(502, { error: "We couldn't start checkout just now. Please try again in a few minutes." });
  }
};
