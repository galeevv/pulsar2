import assert from "node:assert/strict"
import test from "node:test"

import {
  decryptJson,
  encryptJson,
  generateOpaqueToken,
  generateOtp,
  hashSecret,
  verifySecretHash,
} from "@/src/server/infrastructure/crypto/secure-tokens"

const tokenSecret = "test-token-secret-with-at-least-32-characters"
const encryptionKey = Buffer.alloc(32, 7).toString("base64")

test("OTP is always a six-digit cryptographically generated value", () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(generateOtp(), /^\d{6}$/)
  }
})

test("opaque tokens and context-bound hashes are not interchangeable", () => {
  const token = generateOpaqueToken()
  assert.ok(token.length >= 43)
  const first = hashSecret("magic", token, tokenSecret, "challenge-a")
  const second = hashSecret("magic", token, tokenSecret, "challenge-b")
  assert.notEqual(first, second)
  assert.ok(verifySecretHash(first, first))
  assert.ok(!verifySecretHash(first, second))
})

test("outbox JSON is authenticated and encrypted at rest", () => {
  const encrypted = encryptJson({ otp: "123456" }, encryptionKey)
  assert.ok(!encrypted.includes("123456"))
  assert.deepEqual(decryptJson(encrypted, encryptionKey), { otp: "123456" })
  assert.throws(() => decryptJson(`${encrypted}x`, encryptionKey))
})
