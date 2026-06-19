import { API, fetchWithTimeout, getAccessToken } from "./api";

// LocalStorage key for the credential ID registered on this device
const STORAGE_KEY = "webauthn_credential_id";

// ── base64url helpers ────────────────────────────────────────────────────────

function base64urlToBuffer(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// Recursively convert ArrayBuffer values in an object to base64url strings
// (needed to serialize a PublicKeyCredential for JSON transport)
function credentialToJSON(val) {
  if (val instanceof ArrayBuffer) return bufferToBase64url(val);
  if (val instanceof Array) return val.map(credentialToJSON);
  if (val && typeof val === "object" && typeof val.toJSON !== "function") {
    const out = {};
    for (const key of Object.keys(val)) out[key] = credentialToJSON(val[key]);
    return out;
  }
  return val;
}

// ── feature detection ────────────────────────────────────────────────────────

export async function isWebAuthnAvailable() {
  if (typeof window === "undefined" || !window.PublicKeyCredential)
    return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function getStoredCredentialId() {
  return localStorage.getItem(STORAGE_KEY);
}

export function clearStoredCredentialId() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── credential management (logged-in user) ───────────────────────────────────

// GET the current user's registered credentials: [{ id, created_at, last_used_at }]
export async function listCredentials() {
  const res = await fetchWithTimeout(`${API}/auth/webauthn/credentials/`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getAccessToken() ?? ""}`,
    },
  });
  if (!res.ok) throw new Error("Could not list credentials");
  return res.json();
}

// DELETE a credential by its server id
export async function deleteCredential(id) {
  const res = await fetchWithTimeout(`${API}/auth/webauthn/credentials/`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken() ?? ""}`,
    },
    body: JSON.stringify({ id }),
  });
  if (!res.ok && res.status !== 404)
    throw new Error("Could not delete credential");
  return true;
}

// ── registration (after first normal login) ──────────────────────────────────

export async function registerBiometric() {
  // 1. Get challenge from backend (requires a valid access token in memory)
  const challengeRes = await fetchWithTimeout(
    `${API}/auth/webauthn/register/challenge/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken() ?? ""}`,
      },
    },
  );
  if (!challengeRes.ok)
    throw new Error("Could not obtain registration challenge");
  const options = await challengeRes.json();

  // 2. Convert binary fields from base64url to ArrayBuffer
  options.challenge = base64urlToBuffer(options.challenge);
  options.user.id = base64urlToBuffer(options.user.id);
  if (options.excludeCredentials) {
    options.excludeCredentials = options.excludeCredentials.map((c) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    }));
  }

  // 3. Invoke Face ID / Touch ID
  const credential = await navigator.credentials.create({ publicKey: options });
  if (!credential) throw new Error("Registration cancelled");

  // 4. Serialize and send to backend
  const payload = {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: bufferToBase64url(
        credential.response.attestationObject,
      ),
      clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
    },
  };

  const verifyRes = await fetchWithTimeout(
    `${API}/auth/webauthn/register/verify/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken() ?? ""}`,
      },
      body: JSON.stringify(payload),
    },
  );
  if (!verifyRes.ok) throw new Error("Registration verification failed");

  // 5. Store credential ID so we can offer Face ID on next visit
  localStorage.setItem(STORAGE_KEY, credential.id);
  return true;
}

// ── authentication ───────────────────────────────────────────────────────────

export async function authenticateWithBiometric(email) {
  // 1. Get challenge (open endpoint, identifies user by email)
  const challengeRes = await fetchWithTimeout(
    `${API}/auth/webauthn/auth/challenge/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    },
  );
  if (!challengeRes.ok)
    throw new Error("Could not obtain authentication challenge");
  const options = await challengeRes.json();

  if (!options.challenge) return null; // no credential registered for this user

  // 2. Convert binary fields
  options.challenge = base64urlToBuffer(options.challenge);
  if (options.allowCredentials) {
    options.allowCredentials = options.allowCredentials.map((c) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    }));
  }

  // 3. Invoke Face ID / Touch ID
  const assertion = await navigator.credentials.get({ publicKey: options });
  if (!assertion) throw new Error("Authentication cancelled");

  // 4. Serialize and verify
  const payload = {
    email,
    id: assertion.id,
    rawId: bufferToBase64url(assertion.rawId),
    type: assertion.type,
    response: {
      authenticatorData: bufferToBase64url(
        assertion.response.authenticatorData,
      ),
      clientDataJSON: bufferToBase64url(assertion.response.clientDataJSON),
      signature: bufferToBase64url(assertion.response.signature),
      userHandle: assertion.response.userHandle
        ? bufferToBase64url(assertion.response.userHandle)
        : null,
    },
  };

  const verifyRes = await fetchWithTimeout(
    `${API}/auth/webauthn/auth/verify/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!verifyRes.ok) return null;
  return verifyRes.json(); // { access } — refresh travels in an httpOnly cookie
}
