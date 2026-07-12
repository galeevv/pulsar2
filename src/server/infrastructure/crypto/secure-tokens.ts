import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomInt,
  createHash,
  timingSafeEqual,
} from "node:crypto"

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0")
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url")
}

export function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64url")
}

export function hashSecret(
  kind: "otp" | "magic" | "session" | "rate-limit" | "request-context",
  value: string,
  secret: string,
  binding = ""
): string {
  return createHmac("sha256", secret)
    .update(`${kind}\0${binding}\0${value}`, "utf8")
    .digest("base64url")
}

export function verifySecretHash(
  expectedHash: string,
  actualHash: string
): boolean {
  const expected = Buffer.from(expectedHash, "base64url")
  const actual = Buffer.from(actualHash, "base64url")
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function encryptJson(value: unknown, base64Key: string): string {
  const key = decodeEncryptionKey(base64Key)
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const plaintext = Buffer.from(JSON.stringify(value), "utf8")
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return ["v1", iv, tag, ciphertext]
    .map((part) =>
      typeof part === "string" ? part : part.toString("base64url")
    )
    .join(".")
}

export function decryptJson<T>(payload: string, base64Key: string): T {
  const [version, ivPart, tagPart, ciphertextPart] = payload.split(".")
  if (version !== "v1" || !ivPart || !tagPart || !ciphertextPart) {
    throw new Error("Unsupported encrypted payload")
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    decodeEncryptionKey(base64Key),
    Buffer.from(ivPart, "base64url")
  )
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ])
  return JSON.parse(plaintext.toString("utf8")) as T
}

function decodeEncryptionKey(value: string): Buffer {
  const key = Buffer.from(value, "base64")
  if (key.length !== 32) {
    throw new Error("OUTBOX_ENCRYPTION_KEY must decode to 32 bytes")
  }
  return key
}
