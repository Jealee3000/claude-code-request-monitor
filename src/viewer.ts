import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { renderHtml } from "./viewer-html.js";
import { createSessionId } from "./config.js";
import { defaultClaudeHome, listLocalClaudeSessions } from "./claude-sessions.js";
import { buildContextDiff } from "./context-diff.js";
import { buildDiagnostics } from "./diagnostics.js";
import { buildAgentInsight } from "./agent-insight.js";
import { parseResponsePreviewFromDetail } from "./response-stream.js";
import { buildRequestSearch } from "./request-search.js";
import { buildSystemPromptPreview } from "./system-prompt.js";
import { buildTurnDetail } from "./turn-detail.js";
import { buildTurnCompare } from "./turn-compare.js";
import { buildTurnExport } from "./turn-export.js";
import { buildTurnTimeline } from "./turn-timeline.js";
import { buildTurnReplay } from "./turn-replay.js";
import type { RequestStore } from "./store.js";

export interface ViewerOptions {
  claudeHome?: string;
  repoRoot?: string;
}

interface CreateWatchSessionBody {
  id?: string;
  projectPath?: string;
  inspectBody?: boolean;
  claudeSessionId?: string | null;
}

export function buildViewerServer(store: RequestStore, options: ViewerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const claudeHome = options.claudeHome ?? defaultClaudeHome();
  const repoRoot = options.repoRoot ?? process.cwd();

  app.get("/healthz", async () => ({ ok: true }));

  app.get("/api/sessions", async () => store.listSessions());

  app.get("/api/diagnostics", async () => buildDiagnostics(store.listSessionRequestStats()));

  app.post<{ Body: CreateWatchSessionBody }>("/api/watch-sessions", async (request, reply) => {
    const projectPath = request.body?.projectPath;
    if (!projectPath) {
      return reply.code(400).send({ error: "projectPath is required" });
    }

    return store.createSession({
      id: request.body.id ?? createSessionId(),
      projectPath,
      inspectBody: Boolean(request.body.inspectBody),
      claudeSessionId: request.body.claudeSessionId ?? null,
      watchToken: randomBytes(18).toString("base64url")
    });
  });

  app.get("/api/claude-sessions", async () => listLocalClaudeSessions(claudeHome));

  app.get<{ Params: { id: string } }>("/api/sessions/:id/requests", async (request) => {
    return store.listRequests(request.params.id);
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id/turns", async (request) => {
    return buildTurnTimeline(store.listRequestDetails(request.params.id));
  });

  app.get<{ Params: { id: string }; Querystring: { q?: string; tool?: string; skill?: string; limit?: string } }>(
    "/api/sessions/:id/search",
    async (request) => {
      return buildRequestSearch(store.listRequestDetails(request.params.id), {
        query: request.query.q,
        tool: request.query.tool,
        skill: request.query.skill,
        limit: request.query.limit ? Number(request.query.limit) : null
      });
    }
  );

  app.get<{ Params: { id: string } }>("/api/requests/:id/context-diff", async (request, reply) => {
    const requestId = Number(request.params.id);
    const current = Number.isFinite(requestId) ? store.getRequestDetail(requestId) : undefined;
    if (!current) {
      return reply.code(404).send({ error: "Request not found" });
    }
    return buildContextDiff(store.getPreviousRequestDetail(requestId), current);
  });

  app.get<{ Params: { id: string } }>("/api/requests/:id/response-preview", async (request, reply) => {
    const requestId = Number(request.params.id);
    const detail = Number.isFinite(requestId) ? store.getRequestDetail(requestId) : undefined;

    if (!detail) {
      return reply.code(404).send({ error: "Request not found" });
    }

    return parseResponsePreviewFromDetail(detail);
  });

  app.get<{ Params: { id: string } }>("/api/requests/:id/turn-detail", async (request, reply) => {
    const requestId = Number(request.params.id);
    const detail = Number.isFinite(requestId) ? store.getRequestDetail(requestId) : undefined;

    if (!detail) {
      return reply.code(404).send({ error: "Request not found" });
    }

    return buildTurnDetail(store.listRequestDetails(detail.sessionId), requestId);
  });

  app.get<{ Params: { id: string }; Querystring: { baselineRequestId?: string } }>(
    "/api/requests/:id/turn-compare",
    async (request, reply) => {
      const requestId = Number(request.params.id);
      const detail = Number.isFinite(requestId) ? store.getRequestDetail(requestId) : undefined;

      if (!detail) {
        return reply.code(404).send({ error: "Request not found" });
      }

      const baselineRequestId = request.query.baselineRequestId ? Number(request.query.baselineRequestId) : null;
      return buildTurnCompare(
        store.listRequestDetails(detail.sessionId),
        requestId,
        Number.isFinite(baselineRequestId) ? baselineRequestId : null
      );
    }
  );

  app.get<{ Params: { id: string } }>("/api/requests/:id/turn-export", async (request, reply) => {
    const requestId = Number(request.params.id);
    const detail = Number.isFinite(requestId) ? store.getRequestDetail(requestId) : undefined;

    if (!detail) {
      return reply.code(404).send({ error: "Request not found" });
    }

    return buildTurnExport(store.listRequestDetails(detail.sessionId), requestId);
  });

  app.get<{ Params: { id: string } }>("/api/requests/:id/system-prompt", async (request, reply) => {
    const requestId = Number(request.params.id);
    const detail = Number.isFinite(requestId) ? store.getRequestDetail(requestId) : undefined;

    if (!detail) {
      return reply.code(404).send({ error: "Request not found" });
    }

    return buildSystemPromptPreview(detail);
  });

  app.get<{ Params: { id: string } }>("/api/requests/:id/turn-replay", async (request, reply) => {
    const requestId = Number(request.params.id);
    const detail = Number.isFinite(requestId) ? store.getRequestDetail(requestId) : undefined;

    if (!detail) {
      return reply.code(404).send({ error: "Request not found" });
    }

    return buildTurnReplay(store.listRequestDetails(detail.sessionId), requestId);
  });

  app.get<{ Params: { id: string } }>("/api/requests/:id/agent-insight", async (request, reply) => {
    const requestId = Number(request.params.id);
    const detail = Number.isFinite(requestId) ? store.getRequestDetail(requestId) : undefined;

    if (!detail) {
      return reply.code(404).send({ error: "Request not found" });
    }

    return buildAgentInsight(store.listRequestDetails(detail.sessionId), requestId);
  });

  app.get<{ Params: { id: string } }>("/api/requests/:id", async (request, reply) => {
    const requestId = Number(request.params.id);
    const detail = Number.isFinite(requestId) ? store.getRequestDetail(requestId) : undefined;

    if (!detail) {
      return reply.code(404).send({ error: "Request not found" });
    }

    return detail;
  });

  app.get("/", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(renderHtml(repoRoot));
  });

  return app;
}
