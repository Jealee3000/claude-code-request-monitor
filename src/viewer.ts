import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { renderHtml } from "./viewer-html.js";
import { createSessionId } from "./config.js";
import { defaultClaudeHome, listLocalClaudeSessions } from "./claude-sessions.js";
import { buildContextDiff } from "./context-diff.js";
import { buildContextWaterfall } from "./context-waterfall.js";
import { buildDiagnostics } from "./diagnostics.js";
import { buildAgentInsight } from "./agent-insight.js";
import { parseResponsePreviewFromDetail } from "./response-stream.js";
import { buildRequestSearch } from "./request-search.js";
import { buildSystemPromptPreview } from "./system-prompt.js";
import { buildSessionCompare } from "./session-compare.js";
import { buildSessionExport } from "./session-export.js";
import { buildSessionInventory } from "./session-inventory.js";
import { buildSessionParameters } from "./session-parameters.js";
import { buildTokenBudget } from "./token-budget.js";
import { buildToolGraph } from "./tool-graph.js";
import { buildTurnDetail } from "./turn-detail.js";
import { buildTurnCompare } from "./turn-compare.js";
import { buildTurnExport } from "./turn-export.js";
import { buildTurnTimeline } from "./turn-timeline.js";
import { buildTurnReplay } from "./turn-replay.js";
import type { RequestStore } from "./store.js";
import type { RequestDetail, TurnAnnotation } from "./types.js";

export interface ViewerOptions {
  claudeHome?: string;
  repoRoot?: string;
  inspectBody?: boolean;
}

interface CreateWatchSessionBody {
  id?: string;
  projectPath?: string;
  inspectBody?: boolean;
  claudeSessionId?: string | null;
}

interface SaveTurnAnnotationBody {
  bookmarked?: boolean;
  tags?: string[];
  note?: string;
}

export function buildViewerServer(store: RequestStore, options: ViewerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const claudeHome = options.claudeHome ?? defaultClaudeHome();
  const repoRoot = options.repoRoot ?? process.cwd();
  const serverInspectBody = options.inspectBody;

  app.get("/healthz", async () => ({ ok: true }));

  app.get("/api/sessions", async () => store.listSessions());

  app.delete<{ Params: { id: string } }>("/api/sessions/:id", async (request) => {
    return store.deleteSession(request.params.id);
  });

  app.get("/api/diagnostics", async () => buildDiagnostics(store.listSessionRequestStats()));

  app.post<{ Body: CreateWatchSessionBody }>("/api/watch-sessions", async (request, reply) => {
    const projectPath = request.body?.projectPath;
    if (!projectPath) {
      return reply.code(400).send({ error: "projectPath is required" });
    }

    return store.createSession({
      id: request.body.id ?? createSessionId(),
      projectPath,
      inspectBody: serverInspectBody ?? Boolean(request.body.inspectBody),
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

  app.get<{ Params: { id: string } }>("/api/sessions/:id/export", async (request, reply) => {
    const session = store.listSessions().find((item) => item.id === request.params.id);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    return buildSessionExport(
      session,
      store.listRequestDetails(session.id),
      store.listTurnAnnotations(session.id)
    );
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id/inventory", async (request, reply) => {
    const session = store.listSessions().find((item) => item.id === request.params.id);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    return buildSessionInventory(store.listRequestDetails(session.id));
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id/parameters", async (request, reply) => {
    const session = store.listSessions().find((item) => item.id === request.params.id);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    return buildSessionParameters(store.listRequestDetails(session.id));
  });

  app.get<{ Params: { id: string }; Querystring: { baselineSessionId?: string } }>(
    "/api/sessions/:id/compare",
    async (request, reply) => {
      const sessions = store.listSessions();
      const current = sessions.find((item) => item.id === request.params.id);
      if (!current) {
        return reply.code(404).send({ error: "Session not found" });
      }

      const baseline = request.query.baselineSessionId
        ? sessions.find((item) => item.id === request.query.baselineSessionId) ?? null
        : defaultBaselineSession(sessions, current);

      return buildSessionCompare(
        current,
        store.listRequestDetails(current.id),
        baseline,
        baseline ? store.listRequestDetails(baseline.id) : []
      );
    }
  );

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

  app.get<{ Params: { id: string } }>("/api/requests/:id/context-waterfall", async (request, reply) => {
    const requestId = Number(request.params.id);
    const current = Number.isFinite(requestId) ? store.getRequestDetail(requestId) : undefined;
    if (!current) {
      return reply.code(404).send({ error: "Request not found" });
    }
    return buildContextWaterfall(store.getPreviousRequestDetail(requestId), current);
  });

  app.get<{ Params: { id: string } }>("/api/requests/:id/token-budget", async (request, reply) => {
    const requestId = Number(request.params.id);
    const detail = Number.isFinite(requestId) ? store.getRequestDetail(requestId) : undefined;

    if (!detail) {
      return reply.code(404).send({ error: "Request not found" });
    }

    return buildTokenBudget(store.listRequestDetails(detail.sessionId), requestId);
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

  app.get<{ Params: { id: string } }>("/api/requests/:id/turn-annotation", async (request, reply) => {
    const requestId = Number(request.params.id);
    const { detail, turn } = getRequestTurn(store, requestId);

    if (!detail || !turn) {
      return reply.code(404).send({ error: "Request turn not found" });
    }

    return store.getTurnAnnotation(detail.sessionId, turn.key) ?? defaultTurnAnnotation(detail.sessionId, turn.key);
  });

  app.put<{ Params: { id: string }; Body: SaveTurnAnnotationBody }>(
    "/api/requests/:id/turn-annotation",
    async (request, reply) => {
      const requestId = Number(request.params.id);
      const { detail, turn } = getRequestTurn(store, requestId);

      if (!detail || !turn) {
        return reply.code(404).send({ error: "Request turn not found" });
      }

      return store.saveTurnAnnotation({
        sessionId: detail.sessionId,
        turnKey: turn.key,
        bookmarked: Boolean(request.body?.bookmarked),
        tags: Array.isArray(request.body?.tags) ? request.body.tags : [],
        note: typeof request.body?.note === "string" ? request.body.note : ""
      });
    }
  );

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

  app.get<{ Params: { id: string } }>("/api/requests/:id/tool-graph", async (request, reply) => {
    const requestId = Number(request.params.id);
    const detail = Number.isFinite(requestId) ? store.getRequestDetail(requestId) : undefined;

    if (!detail) {
      return reply.code(404).send({ error: "Request not found" });
    }

    return buildToolGraph(store.listRequestDetails(detail.sessionId), requestId);
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

function getRequestTurn(store: RequestStore, requestId: number): { detail: RequestDetail | undefined; turn: ReturnType<typeof buildTurnDetail> | null } {
  const detail = Number.isFinite(requestId) ? store.getRequestDetail(requestId) : undefined;
  if (!detail) {
    return { detail: undefined, turn: null };
  }
  return {
    detail,
    turn: buildTurnDetail(store.listRequestDetails(detail.sessionId), requestId)
  };
}

function defaultTurnAnnotation(sessionId: string, turnKey: string): TurnAnnotation {
  return {
    sessionId,
    turnKey,
    bookmarked: false,
    tags: [],
    note: "",
    updatedAt: null
  };
}

function defaultBaselineSession(sessions: ReturnType<RequestStore["listSessions"]>, current: ReturnType<RequestStore["listSessions"]>[number]) {
  return sessions
    .filter((session) => session.id !== current.id)
    .sort((left, right) => {
      const leftBefore = left.startedAt < current.startedAt ? 0 : 1;
      const rightBefore = right.startedAt < current.startedAt ? 0 : 1;
      return leftBefore - rightBefore || right.startedAt.localeCompare(left.startedAt);
    })[0] ?? null;
}
