import type { BackendConfig } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serializeValue(entry)]),
    );
  }

  return value;
}

function serializeObject(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, serializeValue(entry)]),
  );
}

export interface Logger {
  child(bindings: Record<string, unknown>): Logger;
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

class JsonLogger implements Logger {
  constructor(
    private readonly level: LogLevel,
    private readonly bindings: Record<string, unknown> = {},
  ) {}

  child(bindings: Record<string, unknown>) {
    return new JsonLogger(this.level, {
      ...this.bindings,
      ...bindings,
    });
  }

  debug(message: string, fields?: Record<string, unknown>) {
    this.write("debug", message, fields);
  }

  info(message: string, fields?: Record<string, unknown>) {
    this.write("info", message, fields);
  }

  warn(message: string, fields?: Record<string, unknown>) {
    this.write("warn", message, fields);
  }

  error(message: string, fields?: Record<string, unknown>) {
    this.write("error", message, fields);
  }

  private write(
    level: LogLevel,
    message: string,
    fields: Record<string, unknown> = {},
  ) {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.level]) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...serializeObject(this.bindings),
      ...serializeObject(fields),
    };

    const line = JSON.stringify(payload);
    if (level === "error") {
      console.error(line);
      return;
    }
    if (level === "warn") {
      console.warn(line);
      return;
    }
    console.log(line);
  }
}

export function createLogger(config: Pick<BackendConfig, "logLevel">): Logger {
  return new JsonLogger(config.logLevel);
}
