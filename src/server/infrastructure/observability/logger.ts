type LogLevel = "debug" | "info" | "warn" | "error"

type LogFields = Record<string, boolean | number | string | null | undefined>

function write(level: LogLevel, event: string, fields: LogFields = {}): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  }
  const serialized = JSON.stringify(entry)
  if (level === "error") console.error(serialized)
  else if (level === "warn") console.warn(serialized)
  else console.log(serialized)
}

export const logger = {
  debug: (event: string, fields?: LogFields) => write("debug", event, fields),
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
}
