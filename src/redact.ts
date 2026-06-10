import { readFileSync } from "node:fs";
import type { RedactionRules } from "./types.js";

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

interface CompiledRedactionRules {
  headerNames: Set<string>;
  fieldNames: Set<string>;
  fieldPaths: string[][];
  textPatterns: RegExp[];
}

let activeRules = compileRules({});

export function configureRedactionRules(rules: RedactionRules): void {
  activeRules = compileRules(rules);
}

export function resetRedactionRules(): void {
  activeRules = compileRules({});
}

export function loadRedactionRulesFromFile(filePath: string): RedactionRules {
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  return {
    headerNames: stringList(parsed.headerNames ?? parsed.headers),
    fieldNames: stringList(parsed.fieldNames ?? parsed.fields),
    fieldPaths: stringList(parsed.fieldPaths ?? parsed.paths),
    textPatterns: stringList(parsed.textPatterns)
  };
}

export function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(headers)) {
    redacted[name] = isSensitiveHeader(name) ? "[REDACTED]" : redactUnknown(value);
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

  for (const pattern of activeRules.textPatterns) {
    result = result.replace(pattern, "[REDACTED]");
  }

  return result;
}

function redactUnknown(value: unknown, key?: string, path: string[] = []): unknown {
  if (key && isSensitiveField(key, path)) {
    return "[REDACTED]";
  }

  if (typeof value === "string") {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item, undefined, path.concat("*")));
  }

  if (value && typeof value === "object") {
    const redacted: Record<string, unknown> = {};

    for (const [childKey, childValue] of Object.entries(value)) {
      redacted[childKey] = redactUnknown(childValue, childKey, path.concat(childKey));
    }

    return redacted;
  }

  return value;
}

function isSensitiveHeader(name: string): boolean {
  const normalized = name.toLowerCase();
  return SENSITIVE_HEADER_NAMES.has(normalized) || activeRules.headerNames.has(normalized);
}

function isSensitiveField(key: string, path: string[]): boolean {
  return (
    SENSITIVE_FIELD_PATTERN.test(key) ||
    activeRules.fieldNames.has(key.toLowerCase()) ||
    activeRules.fieldPaths.some((rulePath) => pathMatches(rulePath, path))
  );
}

function pathMatches(rulePath: string[], path: string[]): boolean {
  if (rulePath.length !== path.length) {
    return false;
  }
  return rulePath.every((part, index) => part === "*" || part.toLowerCase() === path[index].toLowerCase());
}

function compileRules(rules: RedactionRules): CompiledRedactionRules {
  return {
    headerNames: new Set((rules.headerNames ?? []).map((name) => name.toLowerCase())),
    fieldNames: new Set((rules.fieldNames ?? []).map((name) => name.toLowerCase())),
    fieldPaths: (rules.fieldPaths ?? []).map((path) => path.split(".").filter(Boolean)),
    textPatterns: (rules.textPatterns ?? []).map(compilePattern)
  };
}

function compilePattern(pattern: string): RegExp {
  const literal = /^\/(.+)\/([dgimsuvy]*)$/.exec(pattern);
  if (literal) {
    const flags = literal[2].includes("g") ? literal[2] : `${literal[2]}g`;
    return new RegExp(literal[1], flags);
  }
  return new RegExp(pattern, "g");
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
