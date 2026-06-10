import { extractAgentPayload } from "./agent-payload.js";
import { parseResponsePreviewFromDetail } from "./response-stream.js";
import { buildSystemPromptPreview } from "./system-prompt.js";
import type { RequestDetail } from "./types.js";

export interface RequestSearchOptions {
  query?: string | null;
  tool?: string | null;
  skill?: string | null;
  limit?: number | null;
}

export interface RequestSearchResult {
  requestId: number;
  startedAt: string;
  model: string | null;
  latestUserText: string | null;
  responsePreview: string | null;
  toolNames: string[];
  suspectedSkillNames: string[];
  contextChars: number;
  matchedFields: string[];
}

export interface RequestSearch {
  query: string | null;
  tool: string | null;
  skill: string | null;
  total: number;
  results: RequestSearchResult[];
}

export function buildRequestSearch(details: RequestDetail[], options: RequestSearchOptions): RequestSearch {
  const query = normalizeNeedle(options.query);
  const tool = normalizeNeedle(options.tool);
  const skill = normalizeNeedle(options.skill);
  const limit = Math.max(1, Math.min(options.limit ?? 100, 500));
  const results: RequestSearchResult[] = [];

  for (const detail of details) {
    const payload = extractAgentPayload(detail);
    if (!payload) {
      continue;
    }

    const response = parseResponsePreviewFromDetail(detail);
    const system = buildSystemPromptPreview(detail);
    const toolNames = payload.toolNames;
    const suspectedSkillNames = system?.suspectedSkills.map((item) => item.name) ?? [];
    const toolInputText = response.toolUses.map((tool) => tool.inputJson).join("\n");
    const matchedFields = matchedFieldsFor({
      query,
      tool,
      skill,
      prompt: payload.latestUserText,
      response: response.assistantText,
      toolInputText,
      toolNames,
      suspectedSkillNames
    });

    if ((query || tool || skill) && !matchedFields.length) {
      continue;
    }

    results.push({
      requestId: detail.id,
      startedAt: detail.startedAt,
      model: payload.model,
      latestUserText: payload.latestUserText,
      responsePreview: response.assistantText ? truncate(response.assistantText, 220) : null,
      toolNames,
      suspectedSkillNames,
      contextChars: payload.estimatedContextChars,
      matchedFields
    });
  }

  results.sort((left, right) => right.startedAt.localeCompare(left.startedAt) || right.requestId - left.requestId);

  return {
    query: query || null,
    tool: tool || null,
    skill: skill || null,
    total: results.length,
    results: results.slice(0, limit)
  };
}

function matchedFieldsFor(input: {
  query: string;
  tool: string;
  skill: string;
  prompt: string | null;
  response: string;
  toolInputText: string;
  toolNames: string[];
  suspectedSkillNames: string[];
}): string[] {
  const queryFields: string[] = [];

  if (input.query) {
    if (includes(input.prompt, input.query)) queryFields.push("prompt");
    if (includes(input.response, input.query)) queryFields.push("response");
    if (includes(input.toolInputText, input.query)) queryFields.push("tool-input");
    if (input.toolNames.some((name) => includes(name, input.query))) queryFields.push("tools");
    if (input.suspectedSkillNames.some((name) => includes(name, input.query))) queryFields.push("skills");
    if (!queryFields.length) return [];
  }

  const fields = [...queryFields];

  if (input.tool) {
    if (!input.toolNames.some((name) => includes(name, input.tool))) return [];
    fields.push("tool-filter");
  }

  if (input.skill) {
    if (!input.suspectedSkillNames.some((name) => includes(name, input.skill))) return [];
    fields.push("skill-filter");
  }

  return [...new Set(fields)];
}

function normalizeNeedle(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function includes(value: string | null, needle: string): boolean {
  return String(value ?? "").toLowerCase().includes(needle);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}
