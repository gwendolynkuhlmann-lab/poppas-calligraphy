// Minimal Google Sheets client: service-account JWT auth + values get/update.
// Uses only Node built-ins so the functions need no npm install.
import { createSign } from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
let cachedToken = null; // { token, expiresAt } — reused while the function instance is warm

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const email = requireEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  // Netlify's env UI stores the key's line breaks as literal "\n"; turn them back into newlines.
  const privateKey = requireEnv('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Google auth failed (${res.status}): ${data.error_description || data.error || 'unknown error'}`);
  }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

async function sheetsRequest(path, init = {}) {
  const token = await getAccessToken();
  const sheetId = encodeURIComponent(requireEnv('GOOGLE_SHEET_ID'));
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Google Sheets ${init.method || 'GET'} failed (${res.status}): ${data.error?.message || 'unknown error'}`);
  }
  return data;
}

// render: 'UNFORMATTED_VALUE' for raw numbers/booleans, 'FORMULA' to see formulas instead of results.
export async function getValues(range, render = 'UNFORMATTED_VALUE') {
  const data = await sheetsRequest(`/values/${encodeURIComponent(range)}?valueRenderOption=${render}`);
  return data.values || [];
}

export async function setValue(range, value) {
  await sheetsRequest(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ range, values: [[value]] }),
  });
}
