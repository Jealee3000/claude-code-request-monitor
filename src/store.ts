import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { redactHeaders, redactJson } from "./redact.js";
import type {
  CreateSessionInput,
  LoggedRequestInput,
  PayloadRecord,
  RequestDetail,
  RequestRecord,
  SessionRecord
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

function stripDetail(detail: RequestDetail): RequestRecord {
  const { payload: _payload, ...request } = detail;
  return request;
}
