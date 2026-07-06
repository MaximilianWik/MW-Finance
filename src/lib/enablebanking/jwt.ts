import { importPKCS8, SignJWT, type KeyLike } from "jose";
import { env } from "@/lib/env";

const ISS = "enablebanking.com";
const AUD = "api.enablebanking.com";
const ALG = "RS256";
const TTL_SECONDS = 3600; // 1h (max allowed 86400). Short + cached.

let cachedKey: KeyLike | null = null;
let cachedToken: { jwt: string; exp: number } | null = null;

async function getPrivateKey(): Promise<KeyLike> {
  if (cachedKey) return cachedKey;
  const pem = Buffer.from(env.enableBanking.privateKeyBase64, "base64").toString("utf8");
  if (!pem.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      "Enable Banking key must be PKCS#8 (-----BEGIN PRIVATE KEY-----). " +
        "Convert with: openssl pkcs8 -topk8 -nocrypt -in your.pem -out pkcs8.pem"
    );
  }
  cachedKey = await importPKCS8(pem, ALG);
  return cachedKey;
}

/**
 * Returns a signed RS256 JWT for the Enable Banking API.
 * Cached in-process until ~1 minute before expiry.
 */
export async function getAuthToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.jwt;

  const key = await getPrivateKey();
  const exp = now + TTL_SECONDS;
  const jwt = await new SignJWT({})
    .setProtectedHeader({ typ: "JWT", alg: ALG, kid: env.enableBanking.appId })
    .setIssuer(ISS)
    .setAudience(AUD)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key);

  cachedToken = { jwt, exp };
  return jwt;
}
