import { API, fetchWithTimeout, getAccessToken } from "./api";

// LocalStorage key for the credential ID registered on this device
const STORAGE_KEY = "webauthn_credential_id";

// ── base64url helpers ────────────────────────────────────────────────────────

type ServerCredentialDescriptor = Omit<
  PublicKeyCredentialDescriptor,
  "id"
> & { id: string };

type ServerRegistrationOptions = Omit<
  PublicKeyCredentialCreationOptions,
  "challenge" | "user" | "excludeCredentials"
> & {
  challenge: string;
  user: Omit<PublicKeyCredentialUserEntity, "id"> & { id: string };
  excludeCredentials?: ServerCredentialDescriptor[];
};

type ServerAuthenticationOptions = Omit<
  PublicKeyCredentialRequestOptions,
  "challenge" | "allowCredentials"
> & {
  challenge?: string;
  allowCredentials?: ServerCredentialDescriptor[];
};

export type WebAuthnCredentialRecord = {
  id: number | string;
  created_at?: string;
  last_used_at?: string | null;
};

export type BiometricAuthTokens = { access: string };

function base64urlToBuffer(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ── feature detection ────────────────────────────────────────────────────────

export async function isWebAuthnAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential)
    return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function getStoredCredentialId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function clearStoredCredentialId(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ── credential management (logged-in user) ───────────────────────────────────

// GET the current user's registered credentials: [{ id, created_at, last_used_at }]
export async function listCredentials(): Promise<WebAuthnCredentialRecord[]> {
  const res = await fetchWithTimeout(`${API}/auth/webauthn/credentials/`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getAccessToken() ?? ""}`,
    },
  });
  if (!res.ok) throw new Error("Could not list credentials");
  return (await res.json()) as WebAuthnCredentialRecord[];
}

// DELETE a credential by its server id
export async function deleteCredential(id: number | string): Promise<true> {
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

export async function registerBiometric(): Promise<true> {
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
  const options = (await challengeRes.json()) as ServerRegistrationOptions;

  // 2. Convert binary fields from base64url to ArrayBuffer
  const publicKey: PublicKeyCredentialCreationOptions = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    user: { ...options.user, id: base64urlToBuffer(options.user.id) },
    excludeCredentials: options.excludeCredentials?.map((credential) => ({
      ...credential,
      id: base64urlToBuffer(credential.id),
    })),
  };

  // 3. Invoke Face ID / Touch ID
  const credential = (await navigator.credentials.create({
    publicKey,
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Registration cancelled");
  const response = credential.response as AuthenticatorAttestationResponse;

  // 4. Serialize and send to backend
  const payload = {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: bufferToBase64url(
        response.attestationObject,
      ),
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
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

export async function authenticateWithBiometric(
  email: string,
): Promise<BiometricAuthTokens | null> {
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
  const options = (await challengeRes.json()) as ServerAuthenticationOptions;

  if (!options.challenge) return null; // no credential registered for this user

  // 2. Convert binary fields
  const publicKey: PublicKeyCredentialRequestOptions = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    allowCredentials: options.allowCredentials?.map((credential) => ({
      ...credential,
      id: base64urlToBuffer(credential.id),
    })),
  };

  // 3. Invoke Face ID / Touch ID
  const assertion = (await navigator.credentials.get({
    publicKey,
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error("Authentication cancelled");
  const response = assertion.response as AuthenticatorAssertionResponse;

  // 4. Serialize and verify
  const payload = {
    email,
    id: assertion.id,
    rawId: bufferToBase64url(assertion.rawId),
    type: assertion.type,
    response: {
      authenticatorData: bufferToBase64url(
        response.authenticatorData,
      ),
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle
        ? bufferToBase64url(response.userHandle)
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
  return (await verifyRes.json()) as BiometricAuthTokens;
}
