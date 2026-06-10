import { renderViewerClientScript } from "./viewer-client.js";
import { VIEWER_STYLES } from "./viewer-styles.js";

export function renderHtml(repoRoot: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Claude Watch</title>
  <style>
${VIEWER_STYLES}
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
        <span>Traffic</span>
        <div class="traffic-controls">
          <div class="mode-switch" role="tablist" aria-label="Traffic view">
            <button class="mode-button active" data-request-mode="turns" type="button">Turns</button>
            <button class="mode-button" data-request-mode="requests" type="button">Requests</button>
          </div>
          <button id="refresh-requests" class="small" type="button">Refresh</button>
        </div>
      </div>
      <div class="request-search">
        <input id="request-search" placeholder="Agent search" autocomplete="off">
        <div class="filter-row">
          <input id="request-tool-filter" placeholder="Tool filter" autocomplete="off">
          <input id="request-skill-filter" placeholder="Skill filter" autocomplete="off">
        </div>
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
          <button class="tab" data-tab="insight" type="button">Insight</button>
          <button class="tab" data-tab="compare" type="button">Compare</button>
          <button class="tab" data-tab="export" type="button">Export</button>
          <button class="tab" data-tab="replay" type="button">Replay</button>
          <button class="tab" data-tab="timeline" type="button">Timeline</button>
          <button class="tab" data-tab="turn" type="button">Turn</button>
          <button class="tab" data-tab="diff" type="button">Diff</button>
          <button class="tab" data-tab="waterfall" type="button">Waterfall</button>
          <button class="tab" data-tab="agent" type="button">Agent</button>
          <button class="tab" data-tab="system" type="button">System</button>
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
${renderViewerClientScript(repoRoot)}
  </script>
</body>
</html>`;
}
