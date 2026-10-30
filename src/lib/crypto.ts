import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

/**
 * AES-256-GCM encryption for secrets we must be able to read back (users' own
 * AI provider keys). Set ENCRYPTION_SECRET to a long random string:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Stored format: v1:<iv>:<auth tag>:<ciphertext>  (all base64)
 */

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET
  if (secret) return createHash("sha256").update(secret).digest()

  if (process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_SECRET is not set. It is required to store API keys securely.")
  }
  // Dev convenience only — derived from another secret so local setup still works.
  console.warn("[crypto] ENCRYPTION_SECRET is not set; using a dev-only fallback key.")
  return createHash("sha256")
    .update("mnemo-dev-fallback:" + (process.env.CLERK_SECRET_KEY ?? "local"))
    .digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":")
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split(":")
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised secret format")
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")
}
