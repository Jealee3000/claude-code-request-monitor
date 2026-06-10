export interface MonitorConfig {
  host: string;
  viewerPort: number;
  proxyPort: number;
  dataDir: string;
  dbPath: string;
  sessionId: string;
  projectPath: string;
  inspectBody: boolean;
}

export interface SessionRecord {
  id: string;
  startedAt: string;
  projectPath: string;
  inspectBody: boolean;
  watchToken: string | null;
  claudeSessionId: string | null;
}

export interface RequestRecord {
  id: number;
  sessionId: string;
  startedAt: string;
  completedAt: string | null;
  method: string;
  host: string;
  path: string;
  statusCode: number | null;
  durationMs: number | null;
  requestBytes: number;
  responseBytes: number;
  contentType: string | null;
  eventCount: number;
  error: string | null;
}

export interface PayloadRecord {
  requestId: number;
  requestHeadersJson: string | null;
  requestBodyJson: string | null;
  responseHeadersJson: string | null;
  responseBodyJson: string | null;
}

export interface CreateSessionInput {
  id: string;
  projectPath: string;
  inspectBody: boolean;
  watchToken?: string | null;
  claudeSessionId?: string | null;
}

export interface LoggedRequestInput {
  sessionId: string;
  startedAt?: string;
  completedAt?: string | null;
  method: string;
  host: string;
  path: string;
  statusCode?: number | null;
  durationMs?: number | null;
  requestBytes?: number;
  responseBytes?: number;
  contentType?: string | null;
  eventCount?: number;
  error?: string | null;
  requestHeaders?: Record<string, unknown> | null;
  requestBody?: unknown;
  responseHeaders?: Record<string, unknown> | null;
  responseBody?: unknown;
}

export interface RequestDetail extends RequestRecord {
  payload: PayloadRecord | null;
}

export interface SessionRequestStats {
  sessionId: string;
  startedAt: string;
  projectPath: string;
  inspectBody: boolean;
  watchTokenPresent: boolean;
  claudeSessionId: string | null;
  requestCount: number;
  lastRequestAt: string | null;
}

export interface DeleteSessionResult {
  sessionId: string;
  deleted: boolean;
  requestCount: number;
  payloadCount: number;
}
