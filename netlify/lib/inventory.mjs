// Inventory lives in a Google Sheet:
//   "Easy Edit"        — the only tab people type in (Category, Product Name, Price, Quantity, Notes)
//   "Master Inventory" — formulas mirroring Easy Edit, plus SKU and In Stock?; the site reads this tab
// Data starts at row 5 on both tabs (rows 1–4 are title, instructions and headers).
import { getValues, setValue } from './google-sheets.mjs';

export const MASTER_TAB = 'Master Inventory';
export const EDIT_TAB = 'Easy Edit';
export const FIRST_ROW = 5;

const PLACEHOLDER_NAME = /^\[.*\]$/; // e.g. "[Add product name]" example rows

function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Reads Master Inventory and returns sellable rows. Rows without a SKU or with a
// placeholder name are skipped. price is null when the sheet has no price yet.
export async function readInventory() {
  const rows = await getValues(`'${MASTER_TAB}'!A${FIRST_ROW}:G`);
  const items = [];
  rows.forEach((row, i) => {
    const [sku, category, name, price, quantity, inStock, notes] = row;
    const skuText = String(sku ?? '').trim();
    const nameText = String(name ?? '').trim();
    if (!skuText || !nameText || PLACEHOLDER_NAME.test(nameText)) return;

    const qty = Math.max(0, Math.floor(toNumber(quantity) ?? 0));
    const sheetSaysInStock = inStock === true || String(inStock).toUpperCase() === 'TRUE';
    const priceNumber = toNumber(price);
    items.push({
      sku: skuText,
      category: String(category ?? '').trim(),
      name: nameText,
      price: priceNumber !== null && priceNumber > 0 ? priceNumber : null,
      quantity: qty,
      inStock: sheetSaysInStock && qty > 0,
      notes: String(notes ?? '').trim(),
    });
  });
  return items;
}

// Finds the Easy Edit row a SKU is wired to by reading the Master Inventory formula
// (e.g. ='Easy Edit'!B7), so inserted or reordered rows can't send a write to the wrong item.
export async function findEditRow(sku) {
  const rows = await getValues(`'${MASTER_TAB}'!A${FIRST_ROW}:C`, 'FORMULA');
  const matches = rows.flatMap((row, i) => (String(row[0] ?? '').trim() === sku ? [i] : []));
  if (matches.length === 0) throw new Error(`SKU ${sku} is not on the ${MASTER_TAB} tab`);
  if (matches.length > 1) throw new Error(`SKU ${sku} appears ${matches.length} times on the ${MASTER_TAB} tab`);

  const formula = String(rows[matches[0]][2] ?? '');
  const match = formula.match(/^='?Easy Edit'?!\$?B\$?(\d+)$/);
  if (!match) {
    throw new Error(`Can't tell which ${EDIT_TAB} row SKU ${sku} uses: its Product Name cell is ${JSON.stringify(formula)}, not a link to ${EDIT_TAB}`);
  }
  return Number(match[1]);
}

// Subtracts `count` from the item's Quantity on Easy Edit. Never writes below zero;
// reports how many were oversold so the caller can raise the alarm.
export async function decrementStock(sku, count) {
  const row = await findEditRow(sku);
  const cell = `'${EDIT_TAB}'!D${row}`;
  const [[current] = []] = await getValues(cell);
  const before = current === undefined || current === '' ? 0 : toNumber(current);
  if (before === null) throw new Error(`Quantity for SKU ${sku} (${cell}) is not a number: ${JSON.stringify(current)}`);

  const remaining = before - count;
  const after = Math.max(0, remaining);
  await setValue(cell, after);
  return { row, before, after, oversold: remaining < 0 ? -remaining : 0 };
}
