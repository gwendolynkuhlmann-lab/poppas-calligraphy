// GET /.netlify/functions/get-inventory[?fresh=1]
// Returns [{ sku, category, name, price, quantity, inStock, notes }] from the Master Inventory tab.
//
// Caching (low-traffic shop, a few minutes of staleness is fine): the Netlify CDN serves a
// cached copy for up to 3 minutes, browsers for 1 minute, and a warm function instance reuses
// its last read for 1 minute. A sheet edit shows up on the site within about 5 minutes.
// The cart page asks for ?fresh=1: no CDN or browser caching, and a read at most 15 seconds
// old (still reused briefly so the page can't be used to hammer the Sheets API).
// Checkout never relies on this cache — create-checkout re-reads the sheet before charging.
import { readInventory } from '../lib/inventory.mjs';

const MEMO_MS = 60_000;
const FRESH_MEMO_MS = 15_000;
let memo = null; // { at, items }

export default async (req) => {
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';
  try {
    if (!memo || Date.now() - memo.at > (fresh ? FRESH_MEMO_MS : MEMO_MS)) {
      memo = { at: Date.now(), items: await readInventory() };
    }
    const headers = fresh
      ? { 'Cache-Control': 'no-store', 'Netlify-Vary': 'query=fresh' }
      : {
          'Cache-Control': 'public, max-age=60',
          'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=180, stale-while-revalidate=120',
          // Keep the CDN's cached copy from ever being served for ?fresh=1.
          'Netlify-Vary': 'query=fresh',
        };
    return Response.json(memo.items, { headers });
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
