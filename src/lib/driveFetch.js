// ── lib/driveFetch.js ──────────────────────────────────────────────────────
// Authenticated Google Drive asset fetch (private assets, no public sharing).
// If GOOGLE_SERVICE_ACCOUNT_JSON is set, we mint a service-account access token
// and pull bytes via the Drive API (files/{id}?alt=media). Otherwise we fall back
// to a plain public fetch of the URL (degrades gracefully; surfaces a clear error
// if Drive returns the HTML permission page instead of the file).
const axios = require('axios');

let _authClientPromise = null;

function hasServiceAccount() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

// Lazily build (and cache) one Google auth client for the whole process.
async function getAuthClient() {
  if (!hasServiceAccount()) return null;
  if (!_authClientPromise) {
    const { GoogleAuth } = require('google-auth-library');
    const opts = { scopes: ['https://www.googleapis.com/auth/drive.readonly'] };
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim();
      // accept either raw JSON or base64-encoded JSON (Railway-friendly)
      if (!raw.startsWith('{')) { try { raw = Buffer.from(raw, 'base64').toString('utf8'); } catch (e) {} }
      opts.credentials = JSON.parse(raw);
    } // else: GOOGLE_APPLICATION_CREDENTIALS path is read by GoogleAuth automatically
    _authClientPromise = new GoogleAuth(opts).getClient();
  }
  return _authClientPromise;
}

// Pull a Drive file id out of any common URL shape (or a bare id).
function extractDriveId(url) {
  if (!url) return null;
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url)) return url;                 // already a bare id
  const patterns = [
    /[?&]id=([a-zA-Z0-9_-]+)/,                                      // uc?export=download&id=...  /  open?id=...
    /\/file\/d\/([a-zA-Z0-9_-]+)/,                                  // /file/d/ID/view
    /googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/,                  // lh3.googleusercontent.com/d/ID
    /\/d\/([a-zA-Z0-9_-]+)/,                                        // generic /d/ID
  ];
  for (const re of patterns) { const m = url.match(re); if (m) return m[1]; }
  return null;
}

function isDriveUrl(url) {
  return !!url && (url.includes('drive.google.com') || /googleusercontent\.com\/d\//.test(url));
}

// Returns a Buffer of the asset bytes.
async function fetchAsset(url) {
  const client = await getAuthClient();
  const id = isDriveUrl(url) ? extractDriveId(url) : null;

  // Authenticated Drive API path (private assets).
  if (id && client) {
    const t = await client.getAccessToken();
    const token = (t && (t.token || t)) || null;
    if (!token) throw new Error('Failed to obtain Google access token from service account');
    const api = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`;
    const resp = await axios.get(api, {
      responseType: 'arraybuffer', maxRedirects: 5, timeout: 60000,
      headers: { Authorization: `Bearer ${token}` },
    });
    return Buffer.from(resp.data);
  }

  // Public fallback (no service account configured).
  const resp = await axios.get(url, { responseType: 'arraybuffer', maxRedirects: 5, timeout: 60000 });
  const ct = String(resp.headers['content-type'] || '');
  if (ct.includes('text/html')) {
    throw new Error(`Asset URL returned HTML, not a file. Set GOOGLE_SERVICE_ACCOUNT_JSON (+ share the asset folders with the service-account email) for authenticated Drive fetch, or share "anyone with link": ${url}`);
  }
  return Buffer.from(resp.data);
}

module.exports = { fetchAsset, extractDriveId, isDriveUrl, hasServiceAccount };
