export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  module?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  module?: string;
  requestId?: string;
  data?: Record<string, unknown>;
}

const LOG_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEY_PATTERN = /(password|pass|token|secret|apikey|api_key|authorization|cookie|credential)/i;

export function redactSensitiveData(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = '[REDACTED]';
      } else {
        output[key] = redactSensitiveData(entryValue, depth + 1);
      }
    }
    return output;
  }

  return value;
}

export function maskPhoneNumber(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length <= 4) {
    return '****';
  }
  const visiblePrefix = trimmed.slice(0, 3);
  const visibleSuffix = trimmed.slice(-2);
  return `${visiblePrefix}${'*'.repeat(Math.max(2, trimmed.length - 5))}${visibleSuffix}`;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  child(extraContext: LogContext): Logger;
}

export function createLogger(
  baseContext: LogContext = {},
  minLevel: LogLevel = 'info',
  sink: (entry: LogEntry) => void = defaultLogSink,
): Logger {
  const emit = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    if (LOG_PRIORITY[level] < LOG_PRIORITY[minLevel]) {
      return;
    }

    const {module, requestId, ...restContext} = baseContext;
    const mergedData = {...restContext, ...data};
    const sanitizedData =
      Object.keys(mergedData).length > 0
        ? (redactSensitiveData(mergedData) as Record<string, unknown>)
        : undefined;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(module ? {module} : {}),
      ...(requestId ? {requestId} : {}),
      ...(sanitizedData ? {data: sanitizedData} : {}),
    };

    sink(entry);
  };

  return {
    debug: (message, data) => emit('debug', message, data),
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, data) => emit('error', message, data),
    child: (extraContext) => createLogger({...baseContext, ...extraContext}, minLevel, sink),
  };
}

function defaultLogSink(entry: LogEntry): void {
  const serialized = JSON.stringify(entry);
  if (entry.level === 'error') {
    console.error(serialized);
  } else if (entry.level === 'warn') {
    console.warn(serialized);
  } else {
    console.info(serialized);
  }
}

export const appLogger = createLogger({module: 'she-valley-core'}, 'info');
