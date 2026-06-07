const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "proxy-authorization"
]);

const SENSITIVE_FIELD_PATTERN =
  /^(api[-_]?key|authorization|cookie|password|secret|token|access[-_]?token|refresh[-_]?token)$/i;

const OPAQUE_TOKEN_PATTERNS = [
  /\bsk-ant-[A-Za-z0-9_-]{12,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/g
];

const WINDOWS_HOME_PATTERN = /[A-Za-z]:\\Users\\[^\\\s"]+/g;

export function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(headers)) {
    redacted[name] = SENSITIVE_HEADER_NAMES.has(name.toLowerCase()) ? "[REDACTED]" : redactUnknown(value);
  }

  return redacted;
}

export function redactJson<T>(value: T): T {
  return redactUnknown(value) as T;
}

export function redactText(value: string): string {
  let result = value.replace(WINDOWS_HOME_PATTERN, "%USERPROFILE%");

  for (const pattern of OPAQUE_TOKEN_PATTERNS) {
    result = result.replace(pattern, (match) => {
      if (match.startsWith("Bearer ")) {
        return "Bearer [REDACTED]";
      }
      return "[REDACTED]";
    });
  }

  return result;
}

function redactUnknown(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_FIELD_PATTERN.test(key)) {
    return "[REDACTED]";
  }

  if (typeof value === "string") {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }

  if (value && typeof value === "object") {
    const redacted: Record<string, unknown> = {};

    for (const [childKey, childValue] of Object.entries(value)) {
      redacted[childKey] = redactUnknown(childValue, childKey);
    }

    return redacted;
  }

  return value;
}
