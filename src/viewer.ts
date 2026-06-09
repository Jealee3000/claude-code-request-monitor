import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { createSessionId } from "./config.js";
import { defaultClaudeHome, listLocalClaudeSessions } from "./claude-sessions.js";
import { buildContextDiff } from "./context-diff.js";
import { buildDiagnostics } from "./diagnostics.js";
import { parseResponsePreviewFromDetail } from "./response-stream.js";
import { buildTurnDetail } from "./turn-detail.js";
import { buildTurnTimeline } from "./turn-timeline.js";
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

function renderHtml(repoRoot: string): string {
  const initialRepoRoot = JSON.stringify(repoRoot);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Claude Watch</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f6f8;
      --panel: #ffffff;
      --subtle: #eef1f5;
      --text: #151922;
      --muted: #687181;
      --line: #d8dee8;
      --accent: #0f766e;
      --warn: #9a3412;
      --bad: #b42318;
      font-family: "Segoe UI", Arial, sans-serif;
    }

    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); }
    header {
      height: 52px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 18px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    h1 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: 0; }
    main {
      display: grid;
      grid-template-columns: 280px 380px minmax(0, 1fr);
      height: calc(100vh - 52px);
      min-height: 560px;
    }
    section {
      min-width: 0;
      overflow: auto;
      border-right: 1px solid var(--line);
      background: var(--panel);
    }
    section:last-child { border-right: 0; background: var(--bg); }
    .section-title, .section-header {
      position: sticky;
      top: 0;
      z-index: 2;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .left-tabs {
      position: sticky;
      top: 0;
      z-index: 3;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 4px;
      padding: 8px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    .left-tab {
      min-height: 32px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }
    .left-tab.active {
      border-color: var(--line);
      background: #eaf6f4;
      color: var(--text);
    }
    .left-tab-panel.hidden { display: none; }
    button.row {
      width: 100%;
      display: block;
      border: 0;
      border-bottom: 1px solid #edf0f5;
      padding: 10px 12px;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    button.row:hover, button.row.active { background: #eaf6f4; }
    div.row {
      width: 100%;
      border-bottom: 1px solid #edf0f5;
      padding: 10px 12px;
      background: transparent;
    }
    button.small {
      min-height: 28px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 4px 8px;
      background: var(--panel);
      color: var(--text);
      font-size: 12px;
      font-weight: 650;
      cursor: pointer;
      white-space: nowrap;
    }
    button.small:hover { background: var(--subtle); }
    .session-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .issue { border-left: 3px solid var(--warn); padding-left: 8px; }
    .issue.bad { border-left-color: var(--bad); }
    .primary { font-size: 13px; font-weight: 650; overflow-wrap: anywhere; }
    .secondary { margin-top: 4px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    .detail { padding: 12px; }
    .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
    input {
      width: 100%;
      height: 34px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 0 10px;
      font: inherit;
      font-size: 13px;
    }
    .tabs {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      gap: 2px;
      overflow-x: auto;
      padding: 8px 0;
      border-bottom: 1px solid var(--line);
      background: var(--bg);
    }
    .tab {
      border: 1px solid transparent;
      border-radius: 6px;
      padding: 7px 10px;
      background: transparent;
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
      cursor: pointer;
      white-space: nowrap;
    }
    .tab.active {
      border-color: var(--line);
      background: var(--panel);
      color: var(--text);
    }
    .meta-grid, .metric-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 8px;
      margin: 10px 0;
    }
    .metric {
      min-width: 0;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }
    .metric-label { color: var(--muted); font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .metric-value { margin-top: 5px; font-size: 14px; font-weight: 650; overflow-wrap: anywhere; }
    .panel {
      margin-top: 10px;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }
    .panel-title { margin-bottom: 8px; font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; }
    .empty { padding: 16px; color: var(--muted); font-size: 13px; }
    .pill { color: var(--accent); font-size: 12px; font-weight: 700; }
    .flag { display: inline-block; margin: 2px 4px 2px 0; padding: 2px 6px; border-radius: 999px; background: #fff4ed; color: var(--warn); font-size: 12px; }
    .warn { color: var(--warn); }
    .bad { color: var(--bad); }
    .json-tree {
      font-family: Consolas, "Cascadia Mono", monospace;
      font-size: 12px;
      line-height: 1.55;
      overflow-wrap: anywhere;
    }
    .json-tree details { margin-left: 14px; }
    .json-tree summary { cursor: pointer; color: #334155; }
    .json-key { color: #0f766e; }
    .json-string { color: #9a3412; }
    .json-number { color: #1d4ed8; }
    .json-bool { color: #7c3aed; }
    .json-null { color: #64748b; }
    pre.raw {
      margin: 0;
      padding: 10px;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #101418;
      color: #eef3f7;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    ul.compact { margin: 6px 0 0; padding-left: 18px; }
    ul.compact li { margin: 3px 0; }

    @media (max-width: 980px) {
      main { grid-template-columns: 1fr; height: auto; }
      section { min-height: 260px; border-right: 0; border-bottom: 1px solid var(--line); }
    }
  </style>
</head>
<body>
  <header>
    <h1>Claude Watch</h1>
    <div class="pill">local only</div>
  </header>
  <main id="claude-watch-root">
    <section>
      <div class="left-tabs" role="tablist" aria-label="Session lists">
        <button class="left-tab active" data-left-tab="monitor" type="button">Monitor</button>
        <button class="left-tab" data-left-tab="claude" type="button">Claude Sessions</button>
        <button class="left-tab" data-left-tab="diagnostics" type="button">Diagnostics</button>
      </div>
      <div id="monitor-session-panel" class="left-tab-panel">
        <div class="section-title">Monitor Sessions</div>
        <div id="sessions" class="empty">Loading sessions...</div>
      </div>
      <div id="claude-session-panel" class="left-tab-panel hidden">
        <div class="section-title">Claude Sessions</div>
        <div id="claude-sessions" class="empty">Loading local Claude sessions...</div>
      </div>
      <div id="diagnostics-panel" class="left-tab-panel hidden">
        <div class="section-title">Diagnostics</div>
        <div id="diagnostics" class="empty">Loading diagnostics...</div>
      </div>
    </section>
    <section>
      <div class="section-header">
        <span>Requests</span>
        <button id="refresh-requests" class="small" type="button">Refresh</button>
      </div>
      <div id="requests" class="empty">Select a session</div>
    </section>
    <section>
      <div class="detail">
        <div class="toolbar">
          <input id="search" placeholder="Search current detail" autocomplete="off">
        </div>
        <div class="tabs" role="tablist">
          <button class="tab active" data-tab="overview" type="button">Overview</button>
          <button class="tab" data-tab="timeline" type="button">Timeline</button>
          <button class="tab" data-tab="turn" type="button">Turn</button>
          <button class="tab" data-tab="diff" type="button">Diff</button>
          <button class="tab" data-tab="agent" type="button">Agent</button>
          <button class="tab" data-tab="headers" type="button">Headers</button>
          <button class="tab" data-tab="payload" type="button">Payload</button>
          <button class="tab" data-tab="response" type="button">Response</button>
          <button class="tab" data-tab="raw" type="button">Raw</button>
        </div>
        <div id="detail" class="empty">Select a request</div>
      </div>
    </section>
  </main>
  <script>
    const repoRoot = ${initialRepoRoot};
    const state = {
      sessions: [],
      claudeSessions: [],
      diagnostics: null,
      requests: [],
      timeline: [],
      detail: null,
      contextDiff: null,
      responsePreview: null,
      turnDetail: null,
      selectedSession: null,
      selectedRequest: null,
      tab: 'overview',
      leftTab: 'monitor',
      refreshingRequests: false
    };
    const sessionsEl = document.getElementById('sessions');
    const claudeSessionsEl = document.getElementById('claude-sessions');
    const diagnosticsEl = document.getElementById('diagnostics');
    const requestsEl = document.getElementById('requests');
    const detailEl = document.getElementById('detail');
    const searchEl = document.getElementById('search');

    searchEl.addEventListener('input', renderDetail);
    document.getElementById('refresh-requests').addEventListener('click', () => refreshRequests().catch(showRequestError));
    document.querySelectorAll('[data-left-tab]').forEach((button) => {
      button.addEventListener('click', () => setLeftTab(button.dataset.leftTab));
    });
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.classList.contains('copy-command')) {
        copyCommand(target.dataset.command || '').catch((error) => {
          target.textContent = error.message;
        });
      }
    });
    document.querySelectorAll('.tab').forEach((button) => {
      button.addEventListener('click', () => setDetailTab(button.dataset.tab));
    });

    async function loadSessions() {
      state.sessions = await fetchJson('/api/sessions');
      renderSessions();
      if (state.sessions[0]) selectSession(state.sessions[0].id);
    }

    async function loadClaudeSessions() {
      state.claudeSessions = await fetchJson('/api/claude-sessions');
      renderClaudeSessions();
    }

    async function loadDiagnostics() {
      state.diagnostics = await fetchJson('/api/diagnostics');
      renderDiagnostics();
    }

    function setLeftTab(tab) {
      state.leftTab = tab === 'claude' || tab === 'diagnostics' ? tab : 'monitor';
      document.querySelectorAll('[data-left-tab]').forEach((button) => {
        button.classList.toggle('active', button.dataset.leftTab === state.leftTab);
      });
      document.getElementById('monitor-session-panel').classList.toggle('hidden', state.leftTab !== 'monitor');
      document.getElementById('claude-session-panel').classList.toggle('hidden', state.leftTab !== 'claude');
      document.getElementById('diagnostics-panel').classList.toggle('hidden', state.leftTab !== 'diagnostics');
    }

    async function selectSession(id) {
      state.selectedSession = id;
      state.selectedRequest = null;
      state.detail = null;
      state.contextDiff = null;
      state.responsePreview = null;
      state.turnDetail = null;
      await refreshRequests({ resetSelection: true });
      await loadTimeline();
      renderSessions();
      renderDetail();
    }

    async function refreshRequests(options = {}) {
      if (!state.selectedSession || state.refreshingRequests) return;
      state.refreshingRequests = true;
      try {
        const previousRequest = state.selectedRequest;
        state.requests = await fetchJson('/api/sessions/' + encodeURIComponent(state.selectedSession) + '/requests');
        if (options.resetSelection) {
          state.selectedRequest = null;
        } else if (previousRequest && !state.requests.some((request) => request.id === previousRequest)) {
          state.selectedRequest = null;
          state.detail = null;
          state.contextDiff = null;
          state.responsePreview = null;
          state.turnDetail = null;
          renderDetail();
        }
        renderRequests();
        await loadTimeline();
      } finally {
        state.refreshingRequests = false;
      }
    }

    async function loadTimeline() {
      if (!state.selectedSession) {
        state.timeline = [];
        return;
      }
      state.timeline = await fetchJson('/api/sessions/' + encodeURIComponent(state.selectedSession) + '/turns');
    }

    async function selectRequest(id, nextTab) {
      state.selectedRequest = id;
      const encodedId = encodeURIComponent(id);
      const [detail, contextDiff, responsePreview, turnDetail] = await Promise.all([
        fetchJson('/api/requests/' + encodedId),
        fetchJson('/api/requests/' + encodedId + '/context-diff'),
        fetchJson('/api/requests/' + encodedId + '/response-preview'),
        fetchJson('/api/requests/' + encodedId + '/turn-detail')
      ]);
      state.detail = detail;
      state.contextDiff = contextDiff;
      state.responsePreview = responsePreview;
      state.turnDetail = turnDetail;
      if (nextTab) {
        state.tab = nextTab;
        syncDetailTabs();
      }
      renderRequests();
      renderDetail();
    }

    function setDetailTab(tab) {
      state.tab = tab || 'overview';
      syncDetailTabs();
      renderDetail();
    }

    function syncDetailTabs() {
      document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === state.tab));
    }

    function renderSessions() {
      if (!state.sessions.length) {
        sessionsEl.className = 'empty';
        sessionsEl.textContent = 'No sessions yet';
        return;
      }
      sessionsEl.className = '';
      sessionsEl.innerHTML = state.sessions.map((session) => row({
        active: session.id === state.selectedSession,
        onclick: 'selectSession(\\'' + escapeAttr(session.id) + '\\')',
        primary: session.id,
        secondary: session.projectPath + ' - ' + (session.inspectBody ? 'inspect body' : 'metadata') +
          (session.claudeSessionId ? ' - Claude ' + session.claudeSessionId : '')
      })).join('');
    }

    function renderClaudeSessions() {
      if (!state.claudeSessions.length) {
        claudeSessionsEl.className = 'empty';
        claudeSessionsEl.textContent = 'No local Claude sessions found';
        return;
      }
      claudeSessionsEl.className = '';
      claudeSessionsEl.innerHTML = state.claudeSessions.map((session) => {
        const ps = powerShellCommand(session);
        const bash = gitBashCommand(session);
        return '<div class="row">' +
          '<div class="primary">' + escapeHtml(session.projectPath) + '</div>' +
          '<div class="secondary">' + escapeHtml(session.sessionId) + '</div>' +
          '<div class="secondary">' + escapeHtml(session.latestPrompt || 'No prompt preview') + '</div>' +
          '<div class="session-actions">' +
          '<button class="small copy-command" type="button" data-command="' + escapeHtml(ps) + '">Copy PowerShell</button>' +
          '<button class="small copy-command" type="button" data-command="' + escapeHtml(bash) + '">Copy Git Bash</button>' +
          '</div>' +
          '</div>';
      }).join('');
    }

    function renderRequests() {
      if (!state.requests.length) {
        requestsEl.className = 'empty';
        requestsEl.textContent = state.selectedSession ? 'No requests captured yet' : 'Select a session';
        return;
      }
      requestsEl.className = '';
      requestsEl.innerHTML = state.requests.map((request) => row({
        active: request.id === state.selectedRequest,
        onclick: 'selectRequest(' + request.id + ')',
        primary: request.method + ' ' + request.host,
        secondary: request.path + ' - ' + (request.statusCode ?? 'pending') + ' - ' + (request.durationMs ?? 0) + 'ms'
      })).join('');
    }

    function renderDiagnostics() {
      if (!state.diagnostics) {
        diagnosticsEl.className = 'empty';
        diagnosticsEl.textContent = 'Loading diagnostics...';
        return;
      }
      diagnosticsEl.className = '';
      const d = state.diagnostics;
      const issues = d.issues && d.issues.length
        ? d.issues.map((issue) => '<div class="panel issue ' + escapeHtml(issue.severity) + '">' +
            '<div class="primary">' + escapeHtml(issue.code) + '</div>' +
            '<div class="secondary">' + escapeHtml(issue.message) + '</div>' +
            (issue.sessionId ? '<div class="secondary">' + escapeHtml(issue.sessionId) + '</div>' : '') +
          '</div>').join('')
        : '<div class="panel"><div class="secondary">No capture issues detected.</div></div>';
      diagnosticsEl.innerHTML = '<div class="metric-grid">' +
        metric('Sessions', d.totalSessions) +
        metric('Active', d.activeSessions) +
        metric('Zero request', d.zeroRequestSessions) +
        metric('Latest request', d.latestRequestAt || 'none') +
        '</div>' + issues;
    }

    function powerShellCommand(session) {
      return 'cd "' + repoRoot + '"; npm.cmd run watch -- run --project "' +
        session.projectPath + '" --resume ' + session.sessionId;
    }

    function gitBashCommand(session) {
      return 'cd "' + toGitBashPath(repoRoot) + '" && npm run watch -- run --project "' +
        toGitBashPath(session.projectPath) + '" --resume ' + session.sessionId;
    }

    function toGitBashPath(path) {
      const normalized = String(path).replace(/\\\\/g, '/');
      const match = /^([A-Za-z]):\\/(.*)$/.exec(normalized);
      return match ? '/' + match[1].toLowerCase() + '/' + match[2] : normalized;
    }

    async function copyCommand(command) {
      await navigator.clipboard.writeText(command);
    }

    function showRequestError(error) {
      requestsEl.className = 'empty bad';
      requestsEl.textContent = error.message;
    }

    function renderDetail() {
      if (!state.detail) {
        detailEl.className = 'empty';
        detailEl.textContent = 'Select a request';
        return;
      }
      detailEl.className = '';
      const htmlByTab = {
        overview: renderOverview,
        timeline: renderTimeline,
        turn: renderTurnDetail,
        diff: renderContextDiff,
        agent: renderAgent,
        headers: renderHeaders,
        payload: renderPayload,
        response: renderResponse,
        raw: renderRaw
      };
      const html = (htmlByTab[state.tab] || renderOverview)();
      detailEl.innerHTML = filterHtml(html);
    }

    function renderOverview() {
      const detail = state.detail;
      return '<div class="meta-grid">' +
        metric('Method', detail.method) +
        metric('Host', detail.host) +
        metric('Path', detail.path) +
        metric('Status', detail.statusCode ?? 'pending') +
        metric('Duration', (detail.durationMs ?? 0) + 'ms') +
        metric('Payload', detail.payload ? 'captured' : 'metadata only') +
        metric('Request bytes', detail.requestBytes) +
        metric('Response bytes', detail.responseBytes) +
        metric('Events', detail.eventCount) +
        '</div>' +
        '<div class="panel"><div class="panel-title">Agent quick read</div>' + renderAgentSummaryCompact() + '</div>';
    }

    function renderTimeline() {
      if (!state.selectedSession) {
        return '<div class="empty">Select a session</div>';
      }
      if (!state.timeline.length) {
        return '<div class="empty">No agent turns detected for this session.</div>';
      }
      return state.timeline.map((turn) => {
        const requestId = turn.requestIds[turn.requestIds.length - 1];
        return '<button class="row" type="button" onclick="selectRequest(' + requestId + ', \\'turn\\')">' +
          '<div class="primary">' + escapeHtml(turn.latestUserPreview || 'No user text') + '</div>' +
          '<div class="secondary">' + escapeHtml(turn.firstRequestAt + ' - ' + turn.requestCount + ' request(s) - ' + (turn.model || 'unknown model')) + '</div>' +
          '<div class="secondary">Tools: ' + escapeHtml(turn.toolNames.join(', ') || 'none') + '</div>' +
          '<div class="secondary">Context chars: ' + escapeHtml(turn.maxContextChars) + ' - tool_use/results: ' + escapeHtml(turn.toolUseCount + ' / ' + turn.toolResultCount) + '</div>' +
          '</button>';
      }).join('');
    }

    function renderTurnDetail() {
      const turn = state.turnDetail;
      if (!turn) {
        return '<div class="empty">Select an agent request to inspect its turn.</div>';
      }
      return '<div class="metric-grid">' +
        metric('Turn requests', turn.requestCount) +
        metric('First request', turn.firstRequestAt) +
        metric('Last request', turn.lastRequestAt) +
        metric('Tool uses', turn.toolUses.length) +
        '</div>' +
        '<div class="panel"><div class="panel-title">Latest user text</div><pre class="raw">' +
        escapeHtml(turn.latestUserText || 'none') +
        '</pre></div>' +
        '<div class="panel"><div class="panel-title">Final assistant text</div><pre class="raw">' +
        escapeHtml(turn.finalAssistantText || 'none') +
        '</pre></div>' +
        '<div class="panel"><div class="panel-title">Turn tool uses</div>' + renderTurnToolUses(turn.toolUses) + '</div>' +
        '<div class="panel"><div class="panel-title">Request steps</div>' + renderTurnSteps(turn.steps) + '</div>';
    }

    function renderTurnToolUses(toolUses) {
      if (!toolUses || !toolUses.length) return '<span class="secondary">none</span>';
      return toolUses.map((tool) => '<div class="row">' +
        '<div class="primary">' + escapeHtml((tool.name || 'unknown tool') + ' - request ' + tool.requestId) + '</div>' +
        '<div class="secondary">' + escapeHtml(tool.id || 'no id') + '</div>' +
        '<pre class="raw">' + escapeHtml(tool.inputJson || '{}') + '</pre>' +
        '</div>').join('');
    }

    function renderTurnSteps(steps) {
      if (!steps || !steps.length) return '<span class="secondary">none</span>';
      return steps.map((step) => '<button class="row" type="button" onclick="selectRequest(' + step.requestId + ', \\'turn\\')">' +
        '<div class="primary">#' + escapeHtml(step.stepIndex) + ' request ' + escapeHtml(step.requestId) + '</div>' +
        '<div class="secondary">' + escapeHtml(step.startedAt + ' - ' + (step.model || 'unknown model') + ' - status ' + (step.statusCode ?? 'pending')) + '</div>' +
        '<div class="secondary">Context: ' + escapeHtml(step.contextChars) + ' (' + escapeHtml(step.contextDelta === null ? 'first' : signed(step.contextDelta)) + ') - messages: ' + escapeHtml(step.messageCount) + '</div>' +
        '<div class="secondary">Tools: ' + escapeHtml(step.toolNames.join(', ') || 'none') + ' - response tool uses: ' + escapeHtml(step.responseToolUseCount) + '</div>' +
        '<div class="secondary">Response: ' + escapeHtml(truncateText(step.responseAssistantText || 'none', 220)) + '</div>' +
        '</button>').join('');
    }

    function renderContextDiff() {
      const diff = state.contextDiff;
      if (!diff) {
        return '<div class="empty">Select a request</div>';
      }
      if (!diff.comparable) {
        return '<div class="empty">' + escapeHtml(diff.reason || 'No comparable request') + '</div>';
      }
      return '<div class="metric-grid">' +
        metric('Messages delta', signed(diff.deltas.messageCount)) +
        metric('Context delta', signed(diff.deltas.estimatedContextChars)) +
        metric('System delta', signed(diff.deltas.systemChars)) +
        metric('Tools delta', signed(diff.deltas.toolCount)) +
        metric('Tool use delta', signed(diff.deltas.toolUseCount)) +
        metric('Tool result delta', signed(diff.deltas.toolResultCount)) +
        '</div>' +
        '<div class="panel"><div class="panel-title">Latest user text</div>' +
        '<div class="secondary">Previous: ' + escapeHtml(diff.previousLatestUserText || 'none') + '</div>' +
        '<div class="secondary">Current: ' + escapeHtml(diff.currentLatestUserText || 'none') + '</div>' +
        '</div>' +
        '<div class="panel"><div class="panel-title">Tools added</div>' + renderList(diff.tools.added) + '</div>' +
        '<div class="panel"><div class="panel-title">Tools removed</div>' + renderList(diff.tools.removed) + '</div>';
    }

    function renderAgent() {
      const requestBody = payloadValue('requestBodyJson');
      const summary = analyzeAgentRequest(requestBody);
      if (!summary) {
        return '<div class="empty">No AI-agent request body detected for this request.</div>';
      }
      return '<div class="metric-grid">' +
        metric('Model', summary.model ?? 'unknown') +
        metric('Stream', summary.stream ?? 'unknown') +
        metric('Max tokens', summary.maxTokens ?? 'unset') +
        metric('Temperature', summary.temperature ?? 'unset') +
        metric('Top P', summary.topP ?? 'unset') +
        metric('Tool choice', summary.toolChoice ?? 'unset') +
        metric('Thinking', summary.thinking ?? 'unset') +
        metric('Messages', summary.messageCount) +
        metric('Tools', summary.toolCount) +
        metric('Tool uses/results', summary.toolUseCount + ' / ' + summary.toolResultCount) +
        metric('System chars', summary.systemChars) +
        metric('Context chars', summary.estimatedContextChars) +
        '</div>' +
        renderFlags(summary.riskFlags) +
        '<div class="panel"><div class="panel-title">Roles</div>' + renderJsonTree(summary.messageRoles, 'roles') + '</div>' +
        '<div class="panel"><div class="panel-title">Tools</div>' + renderList(summary.toolNames) + '</div>' +
        '<div class="panel"><div class="panel-title">Request body</div>' + renderJsonTree(requestBody, 'request') + '</div>';
    }

    function renderHeaders() {
      return '<div class="panel"><div class="panel-title">Request headers</div>' +
        renderJsonTree(payloadValue('requestHeadersJson'), 'requestHeaders') +
        '</div><div class="panel"><div class="panel-title">Response headers</div>' +
        renderJsonTree(payloadValue('responseHeadersJson'), 'responseHeaders') +
        '</div>';
    }

    function renderPayload() {
      return '<div class="panel"><div class="panel-title">Request payload</div>' +
        renderJsonTree(payloadValue('requestBodyJson'), 'payload') +
        '</div>';
    }

    function renderResponse() {
      return renderResponsePreview(state.responsePreview);
    }

    function renderResponsePreview(preview) {
      if (!preview || !preview.stream) {
        return '<div class="panel"><div class="panel-title">Response body</div>' +
          renderJsonTree(payloadValue('responseBodyJson'), 'response') +
          '</div>';
      }

      const thinking = preview.thinkingText
        ? '<div class="panel"><div class="panel-title">Thinking</div><pre class="raw">' + escapeHtml(preview.thinkingText) + '</pre></div>'
        : '';
      return '<div class="metric-grid">' +
        metric('Response Preview', 'stream') +
        metric('Events', preview.events.length) +
        metric('Input tokens', preview.usage.inputTokens ?? 'unknown') +
        metric('Output tokens', preview.usage.outputTokens ?? 'unknown') +
        metric('Tool uses', preview.toolUses.length) +
        '</div>' +
        '<div class="panel"><div class="panel-title">Assistant text</div><pre class="raw">' +
        escapeHtml(preview.assistantText || 'none') +
        '</pre></div>' +
        thinking +
        '<div class="panel"><div class="panel-title">Tool uses</div>' + renderToolUsePreview(preview.toolUses) + '</div>' +
        '<div class="panel"><div class="panel-title">Events</div>' + renderJsonTree(preview.events, 'events') + '</div>' +
        '<div class="panel"><div class="panel-title">Raw stream</div><pre class="raw">' + escapeHtml(preview.rawText || '') + '</pre></div>';
    }

    function renderToolUsePreview(toolUses) {
      if (!toolUses || !toolUses.length) return '<span class="secondary">none</span>';
      return toolUses.map((tool) => {
        return '<div class="row">' +
          '<div class="primary">' + escapeHtml((tool.name || 'unknown tool') + ' #' + tool.index) + '</div>' +
          '<div class="secondary">' + escapeHtml(tool.id || 'no id') + '</div>' +
          '<pre class="raw">' + escapeHtml(tool.inputJson || '{}') + '</pre>' +
          '</div>';
      }).join('');
    }

    function renderRaw() {
      return '<pre class="raw">' + escapeHtml(JSON.stringify(state.detail, null, 2)) + '</pre>';
    }

    function renderAgentSummaryCompact() {
      const summary = analyzeAgentRequest(payloadValue('requestBodyJson'));
      if (!summary) {
        return '<span class="secondary">No captured agent payload.</span>';
      }
      return '<div class="metric-grid">' +
        metric('Model', summary.model ?? 'unknown') +
        metric('Messages', summary.messageCount) +
        metric('Tools', summary.toolCount) +
        metric('Skills', summary.suspectedSkillCount) +
        metric('Context chars', summary.estimatedContextChars) +
        '</div>' + renderFlags(summary.riskFlags);
    }

    function analyzeAgentRequest(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const messages = Array.isArray(value.messages) ? value.messages : [];
      const tools = Array.isArray(value.tools) ? value.tools : [];
      if (!value.model && !messages.length && !tools.length && value.system === undefined && value.tool_choice === undefined) return null;
      const systemChars = contentChars(value.system);
      const toolSchemaChars = JSON.stringify(tools).length;
      const estimatedContextChars = systemChars + contentChars(messages) + toolSchemaChars;
      const roles = {};
      messages.forEach((message) => {
        const role = message && typeof message.role === 'string' ? message.role : 'unknown';
        roles[role] = (roles[role] || 0) + 1;
      });
      const toolUseCount = countBlocks(messages, 'tool_use');
      const toolResultCount = countBlocks(messages, 'tool_result');
      const suspectedSkillCount = suspectedSkills(value.system) + suspectedSkills(messages);
      const riskFlags = [];
      if (estimatedContextChars > 120000) riskFlags.push('large-context');
      if (tools.length > 40) riskFlags.push('many-tools');
      if (toolSchemaChars > 80000) riskFlags.push('large-tool-schema');
      if (suspectedSkillCount > 8) riskFlags.push('many-skills');
      return {
        model: typeof value.model === 'string' ? value.model : null,
        stream: typeof value.stream === 'boolean' ? value.stream : null,
        maxTokens: numberOrNull(value.max_tokens),
        temperature: numberOrNull(value.temperature),
        topP: numberOrNull(value.top_p),
        toolChoice: summarizeToolChoice(value.tool_choice),
        thinking: summarizeThinking(value.thinking),
        messageCount: messages.length,
        messageRoles: roles,
        systemChars,
        estimatedContextChars,
        toolCount: tools.length,
        toolNames: tools.map((tool) => tool && tool.name ? tool.name : 'unnamed'),
        toolUseCount,
        toolResultCount,
        suspectedSkillCount,
        riskFlags
      };
    }

    function countBlocks(messages, type) {
      let count = 0;
      messages.forEach((message) => {
        const blocks = Array.isArray(message && message.content) ? message.content : [message && message.content];
        count += blocks.filter((block) => block && block.type === type).length;
      });
      return count;
    }

    function contentChars(value) {
      if (value === undefined || value === null) return 0;
      if (typeof value === 'string') return value.length;
      return JSON.stringify(value).length;
    }

    function suspectedSkills(value) {
      const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
      const names = (text.match(/name:\\s*/g) || []).length;
      const descriptions = (text.match(/description:\\s*/g) || []).length;
      return Math.min(names, descriptions);
    }

    function summarizeToolChoice(value) {
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object' && typeof value.type === 'string') return value.name ? value.type + ':' + value.name : value.type;
      return null;
    }

    function summarizeThinking(value) {
      if (!value || typeof value !== 'object') return null;
      const type = typeof value.type === 'string' ? value.type : 'configured';
      return typeof value.budget_tokens === 'number' ? type + ':' + value.budget_tokens : type;
    }

    function numberOrNull(value) {
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }

    function payloadValue(field) {
      if (!state.detail || !state.detail.payload || !state.detail.payload[field]) return null;
      return parseMaybeJson(state.detail.payload[field]);
    }

    function parseMaybeJson(value) {
      if (typeof value !== 'string') return value;
      try { return JSON.parse(value); } catch { return value; }
    }

    function renderJsonTree(value, label) {
      return '<div class="json-tree">' + renderNode(value, label, true) + '</div>';
    }

    function renderNode(value, label, open) {
      const labelHtml = label === undefined ? '' : '<span class="json-key">' + escapeHtml(label) + '</span>: ';
      if (Array.isArray(value)) {
        const children = value.map((item, index) => renderNode(item, String(index), false)).join('');
        return '<details ' + (open ? 'open' : '') + '><summary>' + labelHtml + 'Array(' + value.length + ')</summary>' + children + '</details>';
      }
      if (value && typeof value === 'object') {
        const keys = Object.keys(value);
        const children = keys.map((key) => renderNode(value[key], key, false)).join('');
        return '<details ' + (open ? 'open' : '') + '><summary>' + labelHtml + 'Object(' + keys.length + ')</summary>' + children + '</details>';
      }
      return '<div>' + labelHtml + renderPrimitive(value) + '</div>';
    }

    function renderPrimitive(value) {
      if (value === null) return '<span class="json-null">null</span>';
      if (typeof value === 'string') return '<span class="json-string">"' + escapeHtml(value) + '"</span>';
      if (typeof value === 'number') return '<span class="json-number">' + value + '</span>';
      if (typeof value === 'boolean') return '<span class="json-bool">' + value + '</span>';
      return escapeHtml(String(value));
    }

    function renderList(values) {
      if (!values || !values.length) return '<span class="secondary">none</span>';
      return '<ul class="compact">' + values.map((value) => '<li>' + escapeHtml(value) + '</li>').join('') + '</ul>';
    }

    function renderFlags(flags) {
      if (!flags || !flags.length) return '';
      return '<div class="panel"><div class="panel-title">Attention</div>' + flags.map((flag) => '<span class="flag">' + escapeHtml(flag) + '</span>').join('') + '</div>';
    }

    function filterHtml(html) {
      const query = searchEl.value.trim().toLowerCase();
      if (!query) return html;
      const text = stripHtml(html).toLowerCase();
      return text.includes(query) ? html : '<div class="empty">No matching content in this tab.</div>';
    }

    function stripHtml(html) {
      const div = document.createElement('div');
      div.innerHTML = html;
      return div.textContent || '';
    }

    function row({ active, onclick, primary, secondary }) {
      return '<button class="row ' + (active ? 'active' : '') + '" onclick="' + onclick + '">' +
        '<div class="primary">' + escapeHtml(primary) + '</div>' +
        '<div class="secondary">' + escapeHtml(secondary) + '</div>' +
        '</button>';
    }

    function metric(label, value) {
      return '<div class="metric"><div class="metric-label">' + escapeHtml(label) + '</div><div class="metric-value">' + escapeHtml(String(value)) + '</div></div>';
    }

    function signed(value) {
      return value > 0 ? '+' + value : String(value);
    }

    function truncateText(value, max) {
      const text = String(value);
      return text.length <= max ? text : text.slice(0, max - 1) + '...';
    }

    async function fetchJson(url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char]));
    }

    function escapeAttr(value) {
      return String(value).replace(/['\\\\]/g, '\\\\$&');
    }

    loadSessions().catch((error) => {
      sessionsEl.className = 'empty bad';
      sessionsEl.textContent = error.message;
    });
    loadClaudeSessions().catch((error) => {
      claudeSessionsEl.className = 'empty bad';
      claudeSessionsEl.textContent = error.message;
    });
    loadDiagnostics().catch((error) => {
      diagnosticsEl.className = 'empty bad';
      diagnosticsEl.textContent = error.message;
    });
    setInterval(() => {
      refreshRequests().catch(showRequestError);
      loadDiagnostics().catch(() => {});
    }, 2000);
  </script>
</body>
</html>`;
}
