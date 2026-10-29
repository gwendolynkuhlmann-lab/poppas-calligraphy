// Minimal Google Sheets client: service-account JWT auth + values get/update.
// Uses only Node built-ins so the functions need no npm install.
import { createSign } from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
let cachedToken = null; // { token, expiresAt } — reused while the function instance is warm

// Carries a short, non-sensitive reason code (e.g. "sheets_http_403") and the HTTP status
// from Google. Messages never include the private key, the signed JWT or the access token.
export class GoogleApiError extends Error {
  constructor(message, { reason, status = null, googleStatus = null } = {}) {
    super(message);
    this.name = 'GoogleApiError';
    this.reason = reason;
    this.status = status;
    this.googleStatus = googleStatus;
  }
}

const reasonPart = (value) => String(value || 'unknown').toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 40);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new GoogleApiError(`Missing environment variable ${name}`, { reason: `missing_env_${name}` });
  return value;
}

async function googleFetch(url, init, what) {
  try {
    return await fetch(url, init);
  } catch (err) {
    throw new GoogleApiError(`${what}: network error reaching Google (${err.cause?.code || err.name})`, { reason: 'google_network_error' });
  }
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
  let signature;
  try {
    signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');
  } catch (err) {
    // Only the error code: Node's message is generic, but never risk echoing key material.
    throw new GoogleApiError(
      `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY could not be used to sign (${err.code || err.name}); check it is the full PEM key including BEGIN/END lines`,
      { reason: 'private_key_unreadable' },
    );
  }

  const res = await googleFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  }, 'Google auth');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GoogleApiError(
      `Google auth failed (HTTP ${res.status}): ${data.error || 'unknown error'}${data.error_description ? ` — ${data.error_description}` : ''}`,
      { reason: `google_auth_${reasonPart(data.error)}`, status: res.status },
    );
  }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

async function sheetsRequest(path, init = {}) {
  const token = await getAccessToken();
  const sheetId = encodeURIComponent(requireEnv('GOOGLE_SHEET_ID'));
  const res = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  }, 'Google Sheets');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GoogleApiError(
      `Google Sheets ${init.method || 'GET'} failed (HTTP ${res.status}${data.error?.status ? ` ${data.error.status}` : ''}): ${data.error?.message || 'unknown error'}`,
      { reason: `sheets_http_${res.status}`, status: res.status, googleStatus: data.error?.status || null },
    );
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
