import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_SECONDS = 5 * 60;

function getSecret(): string {
  const secret = process.env.QR_CHECKIN_SECRET;
  if (!secret) {
    throw new Error("Falta QR_CHECKIN_SECRET en .env.local.");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/**
 * Token de check-in de corta vigencia: `personId.expEpochSeconds.firma`.
 * Nunca se codifica el person_id "desnudo" y permanente en el QR — ver
 * docs/security.md.
 */
export function createCheckinToken(personId: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${personId}.${exp}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export interface CheckinTokenResult {
  valid: boolean;
  personId?: string;
  reason?: "formato_invalido" | "firma_invalida" | "expirado";
}

export function verifyCheckinToken(token: string): CheckinTokenResult {
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, reason: "formato_invalido" };

  const [personId, expStr, signature] = parts;
  if (!personId || !expStr || !signature) return { valid: false, reason: "formato_invalido" };

  const expected = sign(`${personId}.${expStr}`);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);

  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, reason: "firma_invalida" };
  }

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: "expirado" };
  }

  return { valid: true, personId };
}
