import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { redactHeaders, redactJson } from "./redact.js";
import type {
  CreateSessionInput,
  DeleteSessionResult,
  LoggedRequestInput,
  PayloadRecord,
  RequestDetail,
  RequestRecord,
  SaveTurnAnnotationInput,
  SessionRequestStats,
  SessionRecord,
  TurnAnnotation
} from "./types.js";

interface SessionRow {
  id: string;
  started_at: string;
  project_path: string;
  inspect_body: 0 | 1;
  watch_token: string | null;
  claude_session_id: string | null;
}

interface RequestRow {
  id: number;
  session_id: string;
  started_at: string;
  completed_at: string | null;
  method: string;
  host: string;
  path: string;
  status_code: number | null;
  duration_ms: number | null;
  request_bytes: number;
  response_bytes: number;
  content_type: string | null;
  event_count: number;
  error: string | null;
}

interface PayloadRow {
  request_id: number;
  request_headers_json: string | null;
  request_body_json: string | null;
  response_headers_json: string | null;
  response_body_json: string | null;
}

interface TurnAnnotationRow {
  session_id: string;
  turn_key: string;
  bookmarked: 0 | 1;
  tags_json: string;
  note: string;
  updated_at: string;
}

interface SessionRequestStatsRow {
  session_id: string;
  started_at: string;
  project_path: string;
  inspect_body: 0 | 1;
  watch_token: string | null;
  claude_session_id: string | null;
  request_count: number;
  last_request_at: string | null;
}

export class RequestStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
  }

  init(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        project_path TEXT NOT NULL,
        inspect_body INTEGER NOT NULL,
        watch_token TEXT,
        claude_session_id TEXT
      );

      CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        method TEXT NOT NULL,
        host TEXT NOT NULL,
        path TEXT NOT NULL,
        status_code INTEGER,
        duration_ms INTEGER,
        request_bytes INTEGER NOT NULL DEFAULT 0,
        response_bytes INTEGER NOT NULL DEFAULT 0,
        content_type TEXT,
        event_count INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS payloads (
        request_id INTEGER PRIMARY KEY,
        request_headers_json TEXT,
        request_body_json TEXT,
        response_headers_json TEXT,
        response_body_json TEXT,
        FOREIGN KEY (request_id) REFERENCES requests(id)
      );

      CREATE TABLE IF NOT EXISTS turn_annotations (
        session_id TEXT NOT NULL,
        turn_key TEXT NOT NULL,
        bookmarked INTEGER NOT NULL DEFAULT 0,
        tags_json TEXT NOT NULL DEFAULT '[]',
        note TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (session_id, turn_key),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );
    `);
    this.addColumnIfMissing("sessions", "watch_token", "TEXT");
    this.addColumnIfMissing("sessions", "claude_session_id", "TEXT");
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_watch_token ON sessions(watch_token)");
  }

  createSession(input: CreateSessionInput): SessionRecord {
    const startedAt = new Date().toISOString();

    this.db
      .prepare(
        `INSERT OR IGNORE INTO sessions (
          id,
          started_at,
          project_path,
          inspect_body,
          watch_token,
          claude_session_id
        )
         VALUES (
          @id,
          @startedAt,
          @projectPath,
          @inspectBody,
          @watchToken,
          @claudeSessionId
        )`
      )
      .run({
        id: input.id,
        startedAt,
        projectPath: input.projectPath,
        inspectBody: input.inspectBody ? 1 : 0,
        watchToken: input.watchToken ?? null,
        claudeSessionId: input.claudeSessionId ?? null
      });

    return this.getSession(input.id) ?? {
      id: input.id,
      startedAt,
      projectPath: input.projectPath,
      inspectBody: input.inspectBody,
      watchToken: input.watchToken ?? null,
      claudeSessionId: input.claudeSessionId ?? null
    };
  }

  listSessions(): SessionRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM sessions ORDER BY started_at DESC")
      .all() as SessionRow[];

    return rows.map(mapSession);
  }

  deleteSession(sessionId: string): DeleteSessionResult {
    const existing = this.getSession(sessionId);
    if (!existing) {
      return {
        sessionId,
        deleted: false,
        requestCount: 0,
        payloadCount: 0
      };
    }

    const requestCount = countValue(this.db.prepare("SELECT COUNT(*) AS count FROM requests WHERE session_id = ?").get(sessionId));
    const payloadCount = countValue(
      this.db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM payloads
           WHERE request_id IN (SELECT id FROM requests WHERE session_id = ?)`
        )
        .get(sessionId)
    );

    const transaction = this.db.transaction((id: string) => {
      this.db
        .prepare("DELETE FROM payloads WHERE request_id IN (SELECT id FROM requests WHERE session_id = ?)")
        .run(id);
      this.db.prepare("DELETE FROM turn_annotations WHERE session_id = ?").run(id);
      this.db.prepare("DELETE FROM requests WHERE session_id = ?").run(id);
      this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    });
    transaction(sessionId);

    return {
      sessionId,
      deleted: true,
      requestCount,
      payloadCount
    };
  }

  logRequest(input: LoggedRequestInput): RequestRecord {
    const startedAt = input.startedAt ?? new Date().toISOString();
    const completedAt = input.completedAt ?? null;
    const result = this.db
      .prepare(
        `INSERT INTO requests (
          session_id,
          started_at,
          completed_at,
          method,
          host,
          path,
          status_code,
          duration_ms,
          request_bytes,
          response_bytes,
          content_type,
          event_count,
          error
        ) VALUES (
          @sessionId,
          @startedAt,
          @completedAt,
          @method,
          @host,
          @path,
          @statusCode,
          @durationMs,
          @requestBytes,
          @responseBytes,
          @contentType,
          @eventCount,
          @error
        )`
      )
      .run({
        sessionId: input.sessionId,
        startedAt,
        completedAt,
        method: input.method,
        host: input.host,
        path: input.path,
        statusCode: input.statusCode ?? null,
        durationMs: input.durationMs ?? null,
        requestBytes: input.requestBytes ?? 0,
        responseBytes: input.responseBytes ?? 0,
        contentType: input.contentType ?? null,
        eventCount: input.eventCount ?? 0,
        error: input.error ?? null
      });

    const requestId = Number(result.lastInsertRowid);

    if (hasPayload(input)) {
      this.db
        .prepare(
          `INSERT INTO payloads (
            request_id,
            request_headers_json,
            request_body_json,
            response_headers_json,
            response_body_json
          ) VALUES (
            @requestId,
            @requestHeadersJson,
            @requestBodyJson,
            @responseHeadersJson,
            @responseBodyJson
          )`
        )
        .run({
          requestId,
          requestHeadersJson: stringifyOrNull(input.requestHeaders ? redactHeaders(input.requestHeaders) : null),
          requestBodyJson: stringifyOrNull(input.requestBody === undefined ? null : redactJson(input.requestBody)),
          responseHeadersJson: stringifyOrNull(input.responseHeaders ? redactHeaders(input.responseHeaders) : null),
          responseBodyJson: stringifyOrNull(input.responseBody === undefined ? null : redactJson(input.responseBody))
        });
    }

    const detail = this.getRequestDetail(requestId);
    if (!detail) {
      throw new Error(`Failed to load inserted request ${requestId}`);
    }

    return stripDetail(detail);
  }

  listRequests(sessionId: string): RequestRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM requests WHERE session_id = ? ORDER BY started_at DESC, id DESC")
      .all(sessionId) as RequestRow[];

    return rows.map(mapRequest);
  }

  listRequestDetails(sessionId: string): RequestDetail[] {
    const rows = this.db
      .prepare("SELECT id FROM requests WHERE session_id = ? ORDER BY started_at ASC, id ASC")
      .all(sessionId) as Array<{ id: number }>;

    return rows
      .map((row) => this.getRequestDetail(row.id))
      .filter((detail): detail is RequestDetail => detail !== undefined);
  }

  getPreviousRequestDetail(requestId: number): RequestDetail | undefined {
    const current = this.db
      .prepare("SELECT session_id, started_at, id FROM requests WHERE id = ?")
      .get(requestId) as Pick<RequestRow, "session_id" | "started_at" | "id"> | undefined;

    if (!current) {
      return undefined;
    }

    const previous = this.db
      .prepare(
        `SELECT id
         FROM requests
         WHERE session_id = ?
           AND (started_at < ? OR (started_at = ? AND id < ?))
         ORDER BY started_at DESC, id DESC
         LIMIT 1`
      )
      .get(current.session_id, current.started_at, current.started_at, current.id) as { id: number } | undefined;

    return previous ? this.getRequestDetail(previous.id) : undefined;
  }

  listSessionRequestStats(): SessionRequestStats[] {
    const rows = this.db
      .prepare(
        `SELECT
          s.id AS session_id,
          s.started_at,
          s.project_path,
          s.inspect_body,
          s.watch_token,
          s.claude_session_id,
          COUNT(r.id) AS request_count,
          MAX(r.started_at) AS last_request_at
        FROM sessions s
        LEFT JOIN requests r ON r.session_id = s.id
        GROUP BY s.id
        ORDER BY s.started_at DESC`
      )
      .all() as SessionRequestStatsRow[];

    return rows.map((row) => ({
      sessionId: row.session_id,
      startedAt: row.started_at,
      projectPath: row.project_path,
      inspectBody: row.inspect_body === 1,
      watchTokenPresent: Boolean(row.watch_token),
      claudeSessionId: row.claude_session_id,
      requestCount: row.request_count,
      lastRequestAt: row.last_request_at
    }));
  }

  getSessionByWatchToken(token: string): SessionRecord | undefined {
    const row = this.db.prepare("SELECT * FROM sessions WHERE watch_token = ?").get(token) as SessionRow | undefined;
    return row ? mapSession(row) : undefined;
  }

  getRequestDetail(requestId: number): RequestDetail | undefined {
    const requestRow = this.db.prepare("SELECT * FROM requests WHERE id = ?").get(requestId) as RequestRow | undefined;

    if (!requestRow) {
      return undefined;
    }

    const payloadRow = this.db
      .prepare("SELECT * FROM payloads WHERE request_id = ?")
      .get(requestId) as PayloadRow | undefined;

    return {
      ...mapRequest(requestRow),
      payload: payloadRow ? mapPayload(payloadRow) : null
    };
  }

  getTurnAnnotation(sessionId: string, turnKey: string): TurnAnnotation | undefined {
    const row = this.db
      .prepare("SELECT * FROM turn_annotations WHERE session_id = ? AND turn_key = ?")
      .get(sessionId, turnKey) as TurnAnnotationRow | undefined;

    return row ? mapTurnAnnotation(row) : undefined;
  }

  listTurnAnnotations(sessionId: string): TurnAnnotation[] {
    const rows = this.db
      .prepare("SELECT * FROM turn_annotations WHERE session_id = ? ORDER BY updated_at ASC, turn_key ASC")
      .all(sessionId) as TurnAnnotationRow[];

    return rows.map(mapTurnAnnotation);
  }

  saveTurnAnnotation(input: SaveTurnAnnotationInput): TurnAnnotation {
    const updatedAt = new Date().toISOString();
    const tags = normalizeTags(input.tags);
    this.db
      .prepare(
        `INSERT INTO turn_annotations (
          session_id,
          turn_key,
          bookmarked,
          tags_json,
          note,
          updated_at
        ) VALUES (
          @sessionId,
          @turnKey,
          @bookmarked,
          @tagsJson,
          @note,
          @updatedAt
        )
        ON CONFLICT(session_id, turn_key) DO UPDATE SET
          bookmarked = excluded.bookmarked,
          tags_json = excluded.tags_json,
          note = excluded.note,
          updated_at = excluded.updated_at`
      )
      .run({
        sessionId: input.sessionId,
        turnKey: input.turnKey,
        bookmarked: input.bookmarked ? 1 : 0,
        tagsJson: JSON.stringify(tags),
        note: input.note,
        updatedAt
      });

    const annotation = this.getTurnAnnotation(input.sessionId, input.turnKey);
    if (!annotation) {
      throw new Error(`Failed to save turn annotation ${input.sessionId}/${input.turnKey}`);
    }
    return annotation;
  }

  close(): void {
    this.db.close();
  }

  private getSession(id: string): SessionRecord | undefined {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
    return row ? mapSession(row) : undefined;
  }

  private addColumnIfMissing(tableName: string, columnName: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === columnName)) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }
}

function hasPayload(input: LoggedRequestInput): boolean {
  return (
    input.requestHeaders !== undefined ||
    input.requestBody !== undefined ||
    input.responseHeaders !== undefined ||
    input.responseBody !== undefined
  );
}

function stringifyOrNull(value: unknown): string | null {
  return value === null ? null : JSON.stringify(value, null, 2);
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    startedAt: row.started_at,
    projectPath: row.project_path,
    inspectBody: row.inspect_body === 1,
    watchToken: row.watch_token,
    claudeSessionId: row.claude_session_id
  };
}

function countValue(row: unknown): number {
  return Number((row as { count?: number | bigint } | undefined)?.count ?? 0);
}

function mapRequest(row: RequestRow): RequestRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    method: row.method,
    host: row.host,
    path: row.path,
    statusCode: row.status_code,
    durationMs: row.duration_ms,
    requestBytes: row.request_bytes,
    responseBytes: row.response_bytes,
    contentType: row.content_type,
    eventCount: row.event_count,
    error: row.error
  };
}

function mapPayload(row: PayloadRow): PayloadRecord {
  return {
    requestId: row.request_id,
    requestHeadersJson: row.request_headers_json,
    requestBodyJson: row.request_body_json,
    responseHeadersJson: row.response_headers_json,
    responseBodyJson: row.response_body_json
  };
}

function mapTurnAnnotation(row: TurnAnnotationRow): TurnAnnotation {
  return {
    sessionId: row.session_id,
    turnKey: row.turn_key,
    bookmarked: row.bookmarked === 1,
    tags: parseTags(row.tags_json),
    note: row.note,
    updatedAt: row.updated_at
  };
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags) {
    const value = String(tag).trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeTags(parsed.map(String)) : [];
  } catch {
    return [];
  }
}

function stripDetail(detail: RequestDetail): RequestRecord {
  const { payload: _payload, ...request } = detail;
  return request;
}
