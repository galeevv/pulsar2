import { randomUUID } from "node:crypto"

export const CORRELATION_HEADER = "x-correlation-id"

export function correlationId(value?: string | null): string {
  if (value && /^[A-Za-z0-9._:-]{8,128}$/.test(value)) return value
  return randomUUID()
}
