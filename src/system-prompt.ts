import type { RequestDetail } from "./types.js";

export interface SystemPromptBlock {
  index: number;
  type: string;
  chars: number;
  preview: string;
}

export interface SuspectedSkill {
  name: string;
  description: string;
  chars: number;
  preview: string;
}

export interface ToolSchemaSummary {
  name: string;
  descriptionPreview: string | null;
  schemaChars: number;
  inputSchemaChars: number;
}

export interface SystemPromptPreview {
  requestId: number;
  model: string | null;
  systemChars: number;
  systemBlockCount: number;
  systemBlocks: SystemPromptBlock[];
  suspectedSkillCount: number;
  suspectedSkills: SuspectedSkill[];
  toolCount: number;
  totalToolSchemaChars: number;
  tools: ToolSchemaSummary[];
}

interface SystemBlockInput {
  type: string;
  text: string;
}

export function buildSystemPromptPreview(detail: RequestDetail): SystemPromptPreview | null {
  const body = parseRequestBody(detail);
  if (!isRecord(body)) {
    return null;
  }

  const systemBlocks = normalizeSystemBlocks(body.system);
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const hasAgentShape =
    typeof body.model === "string" ||
    systemBlocks.length > 0 ||
    tools.length > 0 ||
    Array.isArray(body.messages) ||
    body.tool_choice !== undefined;

  if (!hasAgentShape) {
    return null;
  }

  const systemText = systemBlocks.map((block) => block.text).join("\n\n");
  const toolSummaries = tools.map(summarizeTool);

  return {
    requestId: detail.id,
    model: typeof body.model === "string" ? body.model : null,
    systemChars: systemText.length,
    systemBlockCount: systemBlocks.length,
    systemBlocks: systemBlocks.map((block, index) => ({
      index,
      type: block.type,
      chars: block.text.length,
      preview: truncate(block.text, 400)
    })),
    suspectedSkillCount: extractSuspectedSkills(systemText).length,
    suspectedSkills: extractSuspectedSkills(systemText),
    toolCount: tools.length,
    totalToolSchemaChars: JSON.stringify(tools).length,
    tools: toolSummaries
  };
}

function parseRequestBody(detail: RequestDetail): unknown {
  const value = detail.payload?.requestBodyJson;
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeSystemBlocks(value: unknown): SystemBlockInput[] {
  if (typeof value === "string") {
    return [{ type: "text", text: value }];
  }
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((block): SystemBlockInput | null => {
      if (typeof block === "string") {
        return { type: "text", text: block };
      }
      if (!isRecord(block)) {
        return null;
      }
      const text = contentText(block);
      if (!text) {
        return null;
      }
      return {
        type: typeof block.type === "string" ? block.type : "text",
        text
      };
    })
    .filter((block): block is SystemBlockInput => block !== null);
}

function extractSuspectedSkills(text: string): SuspectedSkill[] {
  const skills: SuspectedSkill[] = [];
  const pattern = /(?:^|\n)name:\s*([^\n]+)\n(?:[\s\S]{0,1200}?)description:\s*([^\n]+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const start = Math.max(0, match.index - 120);
    const end = Math.min(text.length, pattern.lastIndex + 280);
    const preview = text.slice(start, end).trim();
    skills.push({
      name: match[1].trim(),
      description: match[2].trim(),
      chars: preview.length,
      preview: truncate(preview, 500)
    });
  }

  return skills;
}

function summarizeTool(tool: unknown): ToolSchemaSummary {
  if (!isRecord(tool)) {
    return {
      name: "unnamed",
      descriptionPreview: null,
      schemaChars: JSON.stringify(tool).length,
      inputSchemaChars: 0
    };
  }

  const inputSchema = tool.input_schema ?? tool.inputSchema ?? null;
  return {
    name: typeof tool.name === "string" ? tool.name : "unnamed",
    descriptionPreview: typeof tool.description === "string" ? truncate(tool.description, 240) : null,
    schemaChars: JSON.stringify(tool).length,
    inputSchemaChars: inputSchema === null ? 0 : JSON.stringify(inputSchema).length
  };
}

function contentText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(contentText).filter(Boolean).join("\n");
  }
  if (isRecord(value)) {
    if (typeof value.text === "string") {
      return value.text;
    }
    if (value.content !== undefined) {
      return contentText(value.content);
    }
  }
  return "";
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
