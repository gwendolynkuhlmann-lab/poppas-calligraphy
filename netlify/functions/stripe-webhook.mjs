// POST /.netlify/functions/stripe-webhook   (Stripe → us; subscribe to checkout.session.completed)
// After a paid shop checkout, subtracts each purchased quantity from the item's Quantity
// cell on the Easy Edit tab (Master Inventory is formulas, so it follows automatically).
// It also logs one "ORDER TO SHIP" line per paid order as a record of what to send where.
//
// Failure handling: if any decrement fails we log loudly and return 500, so Stripe retries
// (with backoff, for up to 3 days) and shows the failure in the Dashboard. Each SKU that has
// been decremented is recorded on the PaymentIntent's metadata, so a retry only redoes the
// items that failed and never subtracts the same purchase twice.
import { decrementStock } from '../lib/inventory.mjs';
import { stripeRequest, verifyStripeSignature, SHOP_SOURCE } from '../lib/stripe.mjs';

const DONE_KEY = 'inventory_decremented'; // PaymentIntent metadata: comma-separated SKUs already subtracted

const text = (status, message) => new Response(message, { status });

export default async (req) => {
  if (req.method !== 'POST') return text(405, 'Method not allowed');

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set; refusing webhook. Stock will NOT be updated until this is fixed.');
    return text(500, 'Webhook not configured');
  }

  const payload = await req.text();
  try {
    verifyStripeSignature(payload, req.headers.get('stripe-signature'), secret);
  } catch (err) {
    console.warn('[stripe-webhook] Rejected request:', err.message);
    return text(400, 'Invalid signature');
  }

  const event = JSON.parse(payload);
  if (event.type !== 'checkout.session.completed') return text(200, `Ignored ${event.type}`);

  const session = event.data.object;
  if (session.metadata?.source !== SHOP_SOURCE) {
    // Not from our shop — e.g. a commission Payment Link. Inventory isn't involved.
    return text(200, 'Ignored: not a shop checkout');
  }
  if (session.payment_status !== 'paid') {
    console.error(`[stripe-webhook] Shop checkout ${session.id} completed with payment_status "${session.payment_status}"; stock NOT decremented. Check this order in Stripe.`);
    return text(200, 'Not paid; no stock change');
  }

  try {
    const lineItems = await stripeRequest('GET', `/checkout/sessions/${session.id}/line_items`, {
      limit: 100,
      expand: ['data.price.product'],
    });
    // Logged before touching the sheet, so there's a shipping record even if the stock update fails.
    console.log(describeOrder(session, lineItems.data));

    const failures = await decrementForSession(session, lineItems);
    if (failures.length) {
      console.error(
        '\n' + '!'.repeat(72) +
        `\n[stripe-webhook] INVENTORY DECREMENT FAILED for checkout ${session.id}` +
        `\nCustomer: ${session.customer_details?.email || 'unknown'}  Total: $${((session.amount_total || 0) / 100).toFixed(2)}` +
        failures.map((f) => `\n  - SKU ${f.sku ?? '(none)'} x${f.quantity}: ${f.reason}`).join('') +
        '\nThe sheet still shows this stock as available. Stripe will retry; fix the cause or update Quantity by hand.' +
        '\n' + '!'.repeat(72),
      );
      return text(500, 'Inventory update failed; will retry');
    }
    return text(200, 'Inventory updated');
  } catch (err) {
    console.error(`[stripe-webhook] INVENTORY DECREMENT FAILED for checkout ${session.id}:`, err);
    return text(500, 'Inventory update failed; will retry');
  }
};

// One line per paid order with what to ship and where: buyer name, email, shipping address,
// items and quantities. No keys, tokens or payment details.
function describeOrder(session, lines) {
  const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  // Newer Stripe API versions put the address under collected_information; older ones on the session.
  const shipping = session.collected_information?.shipping_details || session.shipping_details || null;
  const address = shipping?.address;
  const shipTo = address
    ? [address.line1, address.line2, address.city, [address.state, address.postal_code].filter(Boolean).join(' '), address.country]
        .map(oneLine).filter(Boolean).join(', ')
    : 'none collected';
  const items = lines
    .map((line) => `${line.quantity} x ${oneLine(line.description)} (${line.price?.product?.metadata?.sku || 'no SKU'})`)
    .join('; ');
  return `[stripe-webhook] ORDER TO SHIP ${session.id}` +
    ` | name: ${oneLine(shipping?.name || session.customer_details?.name) || 'unknown'}` +
    ` | email: ${oneLine(session.customer_details?.email) || 'unknown'}` +
    ` | ship to: ${shipTo}` +
    ` | items: ${items || 'none'}` +
    ` | total: $${((session.amount_total || 0) / 100).toFixed(2)}`;
}

async function decrementForSession(session, lineItems) {
  const paymentIntentId = session.payment_intent;
  const paymentIntent = await stripeRequest('GET', `/payment_intents/${paymentIntentId}`);
  const done = new Set(String(paymentIntent.metadata?.[DONE_KEY] || '').split(',').filter(Boolean));

  const saveDone = () =>
    stripeRequest('POST', `/payment_intents/${paymentIntentId}`, { metadata: { [DONE_KEY]: [...done].join(',') } });

  const failures = [];
  let unsavedProgress = false;
  for (const line of lineItems.data) {
    const sku = line.price?.product?.metadata?.sku;
    if (!sku) {
      failures.push({ sku: null, quantity: line.quantity, reason: `line item "${line.description}" has no SKU` });
      continue;
    }
    if (done.has(sku)) {
      console.log(`[stripe-webhook] ${session.id}: SKU ${sku} already decremented on an earlier attempt; skipping`);
      continue;
    }

    let result;
    try {
      result = await decrementStock(sku, line.quantity);
    } catch (err) {
      failures.push({ sku, quantity: line.quantity, reason: err.message });
      continue;
    }
    done.add(sku);
    console.log(`[stripe-webhook] ${session.id}: SKU ${sku} (Easy Edit row ${result.row}) ${result.before} -> ${result.after}`);
    if (result.oversold) {
      console.error(`[stripe-webhook] OVERSOLD: checkout ${session.id} bought ${line.quantity} of SKU ${sku} but the sheet only had ${result.before}. ${result.oversold} unit(s) need a refund or a restock.`);
    }
    try {
      await saveDone();
    } catch (err) {
      unsavedProgress = true;
      console.error(`[stripe-webhook] ${session.id}: SKU ${sku} was decremented but recording that in Stripe failed:`, err.message);
    }
  }

  // A retry only happens when something failed; make sure it knows what's already been subtracted.
  if (unsavedProgress && failures.length) {
    try {
      await saveDone();
    } catch (err) {
      console.error(`[stripe-webhook] DOUBLE-DECREMENT RISK for checkout ${session.id}: couldn't record that SKU(s) ${[...done].join(', ')} were already subtracted, and Stripe will retry. Check those Quantity cells after the retry.`, err.message);
    }
  }
  return failures;
}
