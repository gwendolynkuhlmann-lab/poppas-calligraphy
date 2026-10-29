// GET /.netlify/functions/get-inventory
// Returns [{ sku, category, name, price, quantity, inStock, notes }] from the Master Inventory tab.
//
// Caching (low-traffic shop, a few minutes of staleness is fine): the Netlify CDN serves a
// cached copy for up to 3 minutes, browsers for 1 minute, and a warm function instance reuses
// its last read for 1 minute. A sheet edit shows up on the site within about 5 minutes.
// Checkout never relies on this cache — create-checkout re-reads the sheet before charging.
import { readInventory } from '../lib/inventory.mjs';

const MEMO_MS = 60_000;
let memo = null; // { at, items }

export default async () => {
  try {
    if (!memo || Date.now() - memo.at > MEMO_MS) {
      memo = { at: Date.now(), items: await readInventory() };
    }
    return Response.json(memo.items, {
      headers: {
        'Cache-Control': 'public, max-age=60',
        'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=180, stale-while-revalidate=120',
      },
    });
  } catch (err) {
    const reason = err.reason || 'unexpected_error';
    console.error(
      `[get-inventory] Could not read the inventory sheet: reason=${reason}` +
      ` httpStatus=${err.status ?? 'n/a'} googleStatus=${err.googleStatus ?? 'n/a'}` +
      ` message=${JSON.stringify(err.message)}`,
    );
    return Response.json(
      { error: 'Inventory is unavailable right now.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
