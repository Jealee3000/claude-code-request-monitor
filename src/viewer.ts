import Fastify, { type FastifyInstance } from "fastify";
import type { RequestStore } from "./store.js";

export function buildViewerServer(store: RequestStore): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/healthz", async () => ({ ok: true }));

  app.get("/api/sessions", async () => store.listSessions());

  app.get<{ Params: { id: string } }>("/api/sessions/:id/requests", async (request) => {
    return store.listRequests(request.params.id);
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
    return reply.type("text/html; charset=utf-8").send(renderHtml());
  });

  return app;
}

function renderHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Claude Watch</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --text: #171b23;
      --muted: #5d6675;
      --line: #d9dee8;
      --accent: #0f766e;
      --warn: #9a3412;
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
      grid-template-columns: 280px 360px minmax(0, 1fr);
      height: calc(100vh - 52px);
      min-height: 520px;
    }
    section {
      min-width: 0;
      border-right: 1px solid var(--line);
      overflow: auto;
      background: var(--panel);
    }
    section:last-child { border-right: 0; background: var(--bg); }
    .section-title {
      position: sticky;
      top: 0;
      z-index: 1;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    button.row {
      width: 100%;
      display: block;
      border: 0;
      border-bottom: 1px solid #edf0f5;
      padding: 11px 12px;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    button.row:hover, button.row.active { background: #eef7f6; }
    .primary { font-size: 13px; font-weight: 650; overflow-wrap: anywhere; }
    .secondary { margin-top: 4px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    .detail { padding: 14px; }
    .toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 12px;
    }
    input {
      width: 100%;
      height: 34px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 0 10px;
      font: inherit;
    }
    .meta {
      display: grid;
      grid-template-columns: 130px minmax(0, 1fr);
      gap: 8px;
      padding: 12px;
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
      font-size: 13px;
    }
    .label { color: var(--muted); }
    pre {
      margin: 12px 0 0;
      padding: 12px;
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
    .empty { padding: 16px; color: var(--muted); font-size: 13px; }
    .pill { color: var(--accent); font-size: 12px; font-weight: 700; }
    .warn { color: var(--warn); }

    @media (max-width: 960px) {
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
      <div class="section-title">Sessions</div>
      <div id="sessions" class="empty">Loading sessions...</div>
    </section>
    <section>
      <div class="section-title">Requests</div>
      <div id="requests" class="empty">Select a session</div>
    </section>
    <section>
      <div class="section-title">Detail</div>
      <div class="detail">
        <div class="toolbar">
          <input id="search" placeholder="Search detail JSON" autocomplete="off">
        </div>
        <div id="detail" class="empty">Select a request</div>
      </div>
    </section>
  </main>
  <script>
    const state = { sessions: [], requests: [], detail: null, selectedSession: null, selectedRequest: null };
    const sessionsEl = document.getElementById("sessions");
    const requestsEl = document.getElementById("requests");
    const detailEl = document.getElementById("detail");
    const searchEl = document.getElementById("search");

    searchEl.addEventListener("input", renderDetail);

    async function loadSessions() {
      state.sessions = await fetchJson("/api/sessions");
      renderSessions();
      if (state.sessions[0]) selectSession(state.sessions[0].id);
    }

    async function selectSession(id) {
      state.selectedSession = id;
      state.selectedRequest = null;
      state.detail = null;
      state.requests = await fetchJson("/api/sessions/" + encodeURIComponent(id) + "/requests");
      renderSessions();
      renderRequests();
      renderDetail();
    }

    async function selectRequest(id) {
      state.selectedRequest = id;
      state.detail = await fetchJson("/api/requests/" + encodeURIComponent(id));
      renderRequests();
      renderDetail();
    }

    function renderSessions() {
      if (!state.sessions.length) {
        sessionsEl.className = "empty";
        sessionsEl.textContent = "No sessions yet";
        return;
      }
      sessionsEl.className = "";
      sessionsEl.innerHTML = state.sessions.map((session) => row({
        active: session.id === state.selectedSession,
        onclick: "selectSession('" + escapeAttr(session.id) + "')",
        primary: session.id,
        secondary: session.projectPath + " · " + (session.inspectBody ? "inspect body" : "metadata")
      })).join("");
    }

    function renderRequests() {
      if (!state.requests.length) {
        requestsEl.className = "empty";
        requestsEl.textContent = state.selectedSession ? "No requests captured yet" : "Select a session";
        return;
      }
      requestsEl.className = "";
      requestsEl.innerHTML = state.requests.map((request) => row({
        active: request.id === state.selectedRequest,
        onclick: "selectRequest(" + request.id + ")",
        primary: request.method + " " + request.host,
        secondary: request.path + " · " + (request.statusCode ?? "pending") + " · " + (request.durationMs ?? 0) + "ms"
      })).join("");
    }

    function renderDetail() {
      if (!state.detail) {
        detailEl.className = "empty";
        detailEl.textContent = "Select a request";
        return;
      }
      detailEl.className = "";
      const query = searchEl.value.trim().toLowerCase();
      const json = JSON.stringify(state.detail, null, 2);
      const visible = query ? json.split("\\n").filter((line) => line.toLowerCase().includes(query)).join("\\n") : json;
      detailEl.innerHTML = '<div class="meta">' +
        kv("Method", state.detail.method) +
        kv("Host", state.detail.host) +
        kv("Path", state.detail.path) +
        kv("Status", state.detail.statusCode ?? "pending") +
        kv("Duration", (state.detail.durationMs ?? 0) + "ms") +
        kv("Payload", state.detail.payload ? "captured with redaction" : "metadata only") +
        '</div><pre>' + escapeHtml(visible || "No matching lines") + '</pre>';
    }

    function row({ active, onclick, primary, secondary }) {
      return '<button class="row ' + (active ? "active" : "") + '" onclick="' + onclick + '">' +
        '<div class="primary">' + escapeHtml(primary) + '</div>' +
        '<div class="secondary">' + escapeHtml(secondary) + '</div>' +
        '</button>';
    }

    function kv(label, value) {
      return '<div class="label">' + escapeHtml(label) + '</div><div>' + escapeHtml(String(value)) + '</div>';
    }

    async function fetchJson(url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]));
    }

    function escapeAttr(value) {
      return String(value).replace(/['\\\\]/g, "\\\\$&");
    }

    loadSessions().catch((error) => {
      sessionsEl.className = "empty warn";
      sessionsEl.textContent = error.message;
    });
  </script>
</body>
</html>`;
}
