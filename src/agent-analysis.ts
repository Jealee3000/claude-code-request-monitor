export interface AgentRequestSummary {
  model: string | null;
  stream: boolean | null;
  maxTokens: number | null;
  temperature: number | null;
  topP: number | null;
  toolChoice: string | null;
  thinking: string | null;
  messageCount: number;
  messageRoles: Record<string, number>;
  systemChars: number;
  estimatedContextChars: number;
  toolCount: number;
  toolNames: string[];
  toolSchemaChars: number;
  toolUseCount: number;
  toolResultCount: number;
  suspectedSkillCount: number;
  riskFlags: string[];
}

export function analyzeAgentRequest(value: unknown): AgentRequestSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const messages = Array.isArray(value.messages) ? value.messages : [];
  const tools = Array.isArray(value.tools) ? value.tools : [];
  const hasAgentShape =
    typeof value.model === "string" ||
    messages.length > 0 ||
    tools.length > 0 ||
    value.system !== undefined ||
    value.tool_choice !== undefined;

  if (!hasAgentShape) {
    return null;
  }

  const systemChars = contentChars(value.system);
  const messageRoles = countMessageRoles(messages);
  const toolNames = tools.map((tool) => (isRecord(tool) && typeof tool.name === "string" ? tool.name : "unnamed"));
  const toolSchemaChars = JSON.stringify(tools).length;
  const estimatedContextChars = systemChars + contentChars(messages) + toolSchemaChars;
  const toolUseCount = countContentBlocks(messages, "tool_use");
  const toolResultCount = countContentBlocks(messages, "tool_result");
  const suspectedSkillCount = countSuspectedSkills(value.system) + countSuspectedSkills(messages);
  const riskFlags = buildRiskFlags({
    estimatedContextChars,
    toolCount: tools.length,
    toolSchemaChars,
    suspectedSkillCount
  });

  return {
    model: typeof value.model === "string" ? value.model : null,
    stream: typeof value.stream === "boolean" ? value.stream : null,
    maxTokens: numberOrNull(value.max_tokens),
    temperature: numberOrNull(value.temperature),
    topP: numberOrNull(value.top_p),
    toolChoice: summarizeToolChoice(value.tool_choice),
    thinking: summarizeThinking(value.thinking),
    messageCount: messages.length,
    messageRoles,
    systemChars,
    estimatedContextChars,
    toolCount: tools.length,
    toolNames,
    toolSchemaChars,
    toolUseCount,
    toolResultCount,
    suspectedSkillCount,
    riskFlags
  };
}

function countMessageRoles(messages: unknown[]): Record<string, number> {
  const roles: Record<string, number> = {};

  for (const message of messages) {
    const role = isRecord(message) && typeof message.role === "string" ? message.role : "unknown";
    roles[role] = (roles[role] ?? 0) + 1;
  }

  return roles;
}

function countContentBlocks(messages: unknown[], type: string): number {
  let count = 0;

  for (const message of messages) {
    if (!isRecord(message)) {
      continue;
    }
    const content = message.content;
    const blocks = Array.isArray(content) ? content : [content];
    count += blocks.filter((block) => isRecord(block) && block.type === type).length;
  }

  return count;
}

function contentChars(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === "string") {
    return value.length;
  }
  return JSON.stringify(value).length;
}

function countSuspectedSkills(value: unknown): number {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const nameMatches = text.match(/name:\s*/g)?.length ?? 0;
  const descriptionMatches = text.match(/description:\s*/g)?.length ?? 0;
  return Math.min(nameMatches, descriptionMatches);
}

function buildRiskFlags(input: {
  estimatedContextChars: number;
  toolCount: number;
  toolSchemaChars: number;
  suspectedSkillCount: number;
}): string[] {
  const flags: string[] = [];

  if (input.estimatedContextChars > 120_000) {
    flags.push("large-context");
  }
  if (input.toolCount > 40) {
    flags.push("many-tools");
  }
  if (input.toolSchemaChars > 80_000) {
    flags.push("large-tool-schema");
  }
  if (input.suspectedSkillCount > 8) {
    flags.push("many-skills");
  }

  return flags;
}

function summarizeToolChoice(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (isRecord(value) && typeof value.type === "string") {
    return typeof value.name === "string" ? `${value.type}:${value.name}` : value.type;
  }
  return null;
}

function summarizeThinking(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const type = typeof value.type === "string" ? value.type : "configured";
  const budget = numberOrNull(value.budget_tokens);
  return budget === null ? type : `${type}:${budget}`;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
