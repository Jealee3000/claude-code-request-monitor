export function renderViewerClientScript(repoRoot: string): string {
  const initialRepoRoot = JSON.stringify(repoRoot);
  return `    const repoRoot = ${initialRepoRoot};
    const state = {
      sessions: [],
      sessionExport: null,
      sessionCompare: null,
      claudeSessions: [],
      diagnostics: null,
      requests: [],
      requestSearchResults: null,
      timeline: [],
      detail: null,
      contextDiff: null,
      contextWaterfall: null,
      responsePreview: null,
      turnDetail: null,
      turnAnnotation: null,
      turnCompare: null,
      turnExport: null,
      systemPrompt: null,
      turnReplay: null,
      agentInsight: null,
      selectedSession: null,
      selectedRequest: null,
      tab: 'overview',
      leftTab: 'monitor',
      requestMode: 'turns',
      refreshingRequests: false
    };
    const sessionsEl = document.getElementById('sessions');
    const claudeSessionsEl = document.getElementById('claude-sessions');
    const diagnosticsEl = document.getElementById('diagnostics');
    const requestsEl = document.getElementById('requests');
    const detailEl = document.getElementById('detail');
    const searchEl = document.getElementById('search');
    const requestSearchEl = document.getElementById('request-search');
    const requestToolFilterEl = document.getElementById('request-tool-filter');
    const requestSkillFilterEl = document.getElementById('request-skill-filter');
    let requestSearchTimer = null;

    searchEl.addEventListener('input', renderDetail);
    requestSearchEl.addEventListener('input', scheduleSearchRequests);
    requestToolFilterEl.addEventListener('input', scheduleSearchRequests);
    requestSkillFilterEl.addEventListener('input', scheduleSearchRequests);
    document.getElementById('refresh-requests').addEventListener('click', () => refreshRequests().catch(showRequestError));
    document.querySelectorAll('[data-left-tab]').forEach((button) => {
      button.addEventListener('click', () => setLeftTab(button.dataset.leftTab));
    });
    document.querySelectorAll('[data-request-mode]').forEach((button) => {
      button.addEventListener('click', () => setRequestMode(button.dataset.requestMode));
    });
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.classList.contains('copy-command')) {
        copyCommand(target.dataset.command || '').catch((error) => {
          target.textContent = error.message;
        });
      }
      if (target instanceof HTMLElement && target.classList.contains('copy-export-markdown')) {
        copyMarkdownExport().catch((error) => {
          target.textContent = error.message;
        });
      }
      if (target instanceof HTMLElement && target.classList.contains('copy-session-export')) {
        copySessionMarkdownExport(target.dataset.sessionId || '', target).catch((error) => {
          target.textContent = error.message;
        });
      }
      if (target instanceof HTMLElement && target.classList.contains('delete-session')) {
        confirmDeleteSession(target.dataset.sessionId || '').catch((error) => {
          target.textContent = error.message;
        });
      }
      if (target instanceof HTMLElement && target.classList.contains('save-turn-annotation')) {
        saveTurnAnnotation(target).catch((error) => {
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
      state.sessionExport = null;
      state.sessionCompare = null;
      state.selectedRequest = null;
      state.requestSearchResults = null;
      state.detail = null;
      state.contextDiff = null;
      state.contextWaterfall = null;
      state.responsePreview = null;
      state.turnDetail = null;
      state.turnAnnotation = null;
      state.turnCompare = null;
      state.turnExport = null;
      state.systemPrompt = null;
      state.turnReplay = null;
      state.agentInsight = null;
      state.sessionCompare = await fetchJson('/api/sessions/' + encodeURIComponent(id) + '/compare');
      await refreshRequests({ resetSelection: true });
      renderSessions();
      renderDetail();
    }

    async function refreshRequests(options = {}) {
      if (!state.selectedSession || state.refreshingRequests) return;
      state.refreshingRequests = true;
      try {
        const previousRequest = state.selectedRequest;
        state.requests = await fetchJson('/api/sessions/' + encodeURIComponent(state.selectedSession) + '/requests');
        if (hasRequestSearch()) {
          await searchRequests();
        } else {
          state.requestSearchResults = null;
        }
        await loadTimeline();
        if (options.resetSelection) {
          state.selectedRequest = null;
        } else if (previousRequest && !state.requests.some((request) => request.id === previousRequest)) {
          state.selectedRequest = null;
          state.detail = null;
          state.contextDiff = null;
          state.contextWaterfall = null;
          state.responsePreview = null;
          state.turnDetail = null;
          state.turnAnnotation = null;
          state.turnCompare = null;
          state.turnExport = null;
          state.systemPrompt = null;
          state.turnReplay = null;
          state.agentInsight = null;
          renderDetail();
        }
        renderRequests();
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

    function scheduleSearchRequests() {
      if (requestSearchTimer) clearTimeout(requestSearchTimer);
      requestSearchTimer = setTimeout(() => {
        searchRequests().catch(showRequestError);
      }, 180);
    }

    async function searchRequests() {
      if (!state.selectedSession) return;
      if (!hasRequestSearch()) {
        state.requestSearchResults = null;
        renderRequests();
        return;
      }
      const params = new URLSearchParams();
      if (requestSearchEl.value.trim()) params.set('q', requestSearchEl.value.trim());
      if (requestToolFilterEl.value.trim()) params.set('tool', requestToolFilterEl.value.trim());
      if (requestSkillFilterEl.value.trim()) params.set('skill', requestSkillFilterEl.value.trim());
      state.requestSearchResults = await fetchJson('/api/sessions/' + encodeURIComponent(state.selectedSession) + '/search?' + params.toString());
      renderRequests();
    }

    function hasRequestSearch() {
      return Boolean(
        requestSearchEl.value.trim() ||
        requestToolFilterEl.value.trim() ||
        requestSkillFilterEl.value.trim()
      );
    }

    function setRequestMode(mode) {
      state.requestMode = mode === 'requests' ? 'requests' : 'turns';
      syncRequestMode();
      renderRequests();
    }

    function syncRequestMode() {
      document.querySelectorAll('[data-request-mode]').forEach((button) => {
        button.classList.toggle('active', button.dataset.requestMode === state.requestMode);
      });
    }

    async function selectRequest(id, nextTab) {
      state.selectedRequest = id;
      const encodedId = encodeURIComponent(id);
      const [detail, contextDiff, contextWaterfall, responsePreview, turnDetail, turnAnnotation, turnCompare, turnExport, systemPrompt, turnReplay, agentInsight] = await Promise.all([
        fetchJson('/api/requests/' + encodedId),
        fetchJson('/api/requests/' + encodedId + '/context-diff'),
        fetchJson('/api/requests/' + encodedId + '/context-waterfall'),
        fetchJson('/api/requests/' + encodedId + '/response-preview'),
        fetchJson('/api/requests/' + encodedId + '/turn-detail'),
        fetchJson('/api/requests/' + encodedId + '/turn-annotation'),
        fetchJson('/api/requests/' + encodedId + '/turn-compare'),
        fetchJson('/api/requests/' + encodedId + '/turn-export'),
        fetchJson('/api/requests/' + encodedId + '/system-prompt'),
        fetchJson('/api/requests/' + encodedId + '/turn-replay'),
        fetchJson('/api/requests/' + encodedId + '/agent-insight')
      ]);
      state.detail = detail;
      state.contextDiff = contextDiff;
      state.contextWaterfall = contextWaterfall;
      state.responsePreview = responsePreview;
      state.turnDetail = turnDetail;
      state.turnAnnotation = turnAnnotation;
      state.turnCompare = turnCompare;
      state.turnExport = turnExport;
      state.systemPrompt = systemPrompt;
      state.turnReplay = turnReplay;
      state.agentInsight = agentInsight;
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

    function clearSelectedState() {
      state.selectedRequest = null;
      state.requestSearchResults = null;
      state.detail = null;
      state.contextDiff = null;
      state.contextWaterfall = null;
      state.responsePreview = null;
      state.turnDetail = null;
      state.turnAnnotation = null;
      state.turnCompare = null;
      state.turnExport = null;
      state.systemPrompt = null;
      state.turnReplay = null;
      state.agentInsight = null;
    }

    function renderSessions() {
      if (!state.sessions.length) {
        sessionsEl.className = 'empty';
        sessionsEl.textContent = 'No sessions yet';
        return;
      }
      sessionsEl.className = '';
      sessionsEl.innerHTML = state.sessions.map((session) => '<div class="row ' + (session.id === state.selectedSession ? 'active' : '') + '">' +
        '<div class="primary">' + escapeHtml(session.id) + '</div>' +
        '<div class="secondary">' + escapeHtml(session.projectPath + ' - ' + (session.inspectBody ? 'inspect body' : 'metadata') +
          (session.claudeSessionId ? ' - Claude ' + session.claudeSessionId : '')) + '</div>' +
        '<div class="session-actions">' +
          '<button class="small" type="button" onclick="selectSession(\\'' + escapeAttr(session.id) + '\\')">Select</button>' +
          '<button class="small copy-session-export" type="button" data-session-id="' + escapeHtml(session.id) + '">Copy Session Markdown</button>' +
          '<button class="small delete-session" type="button" data-session-id="' + escapeHtml(session.id) + '">Delete</button>' +
        '</div>' +
      '</div>').join('');
    }

    async function confirmDeleteSession(sessionId) {
      if (!sessionId) return;
      const ok = window.confirm('Delete session ' + sessionId + ' and its captured requests?');
      if (!ok) return;
      await deleteSession(sessionId);
    }

    async function deleteSession(sessionId) {
      await fetchJson('/api/sessions/' + encodeURIComponent(sessionId), { method: 'DELETE' });
      state.sessions = await fetchJson('/api/sessions');
      if (state.selectedSession === sessionId) {
        state.selectedSession = null;
        state.sessionExport = null;
        state.sessionCompare = null;
        state.requests = [];
        state.timeline = [];
        clearSelectedState();
      }
      renderSessions();
      renderRequests();
      renderDetail();
      await loadDiagnostics();
      if (state.sessions[0] && !state.selectedSession) {
        await selectSession(state.sessions[0].id);
      }
    }

    async function copySessionMarkdownExport(sessionId, button) {
      if (!sessionId) return;
      const exportNote = await fetchJson('/api/sessions/' + encodeURIComponent(sessionId) + '/export');
      state.sessionExport = exportNote;
      await navigator.clipboard.writeText(exportNote.markdown);
      if (button) button.textContent = 'Copied Session Markdown';
    }

    async function saveTurnAnnotation(button) {
      if (!state.selectedRequest) return;
      const annotation = await fetchJson('/api/requests/' + encodeURIComponent(state.selectedRequest) + '/turn-annotation', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bookmarked: Boolean(document.getElementById('turn-bookmark')?.checked),
          tags: parseTagInput(document.getElementById('turn-tags')?.value || ''),
          note: document.getElementById('turn-note')?.value || ''
        })
      });
      state.turnAnnotation = annotation;
      if (button) button.textContent = 'Saved';
      renderDetail();
    }

    function parseTagInput(value) {
      const seen = new Set();
      const tags = [];
      String(value).split(',').forEach((tag) => {
        const normalized = tag.trim();
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        tags.push(normalized);
      });
      return tags;
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
      if (state.requestSearchResults) {
        renderSearchResults();
        return;
      }
      if (state.requestMode === 'requests') {
        renderRawRequests();
        return;
      }
      renderTurnList();
    }

    function renderTurnList() {
      if (!state.selectedSession) {
        requestsEl.className = 'empty';
        requestsEl.textContent = 'Select a session';
        return;
      }
      if (!state.timeline.length) {
        requestsEl.className = 'empty';
        requestsEl.textContent = state.requests.length ? 'No agent turns detected yet' : 'No requests captured yet';
        return;
      }
      requestsEl.className = '';
      requestsEl.innerHTML = state.timeline.map((turn) => {
        const requestId = turn.requestIds[turn.requestIds.length - 1];
        return row({
          active: turn.requestIds.includes(state.selectedRequest),
          onclick: 'selectRequest(' + requestId + ', \\'turn\\')',
          primary: turn.latestUserPreview || 'No user text',
          secondary: turn.firstRequestAt + ' - ' + turn.requestCount + ' request(s) - tools: ' +
            (turn.toolNames.join(', ') || 'none') + ' - context: ' + turn.maxContextChars
        });
      }).join('');
    }

    function renderRawRequests() {
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

    function renderSearchResults() {
      const search = state.requestSearchResults;
      if (!search || !search.results.length) {
        requestsEl.className = 'empty';
        requestsEl.textContent = state.selectedSession ? 'No matching agent requests' : 'Select a session';
        return;
      }
      requestsEl.className = '';
      requestsEl.innerHTML =
        '<div class="section-title">Search results: ' + escapeHtml(search.total) + '</div>' +
        search.results.map((result) => row({
          active: result.requestId === state.selectedRequest,
          onclick: 'selectRequest(' + result.requestId + ', \\'insight\\')',
          primary: result.latestUserText || 'No user text',
          secondary: result.startedAt + ' - ' + (result.model || 'unknown model') +
            ' - tools: ' + (result.toolNames.join(', ') || 'none') +
            ' - matched: ' + (result.matchedFields.join(', ') || 'recent')
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
        '</div>' + issues +
        '<div class="panel"><div class="panel-title">Capture checks</div>' + renderSessionChecks(d.sessionChecks) + '</div>';
    }

    function renderSessionChecks(checks) {
      if (!checks || !checks.length) {
        return '<span class="secondary">No watch sessions to inspect.</span>';
      }
      return checks.map((check) => '<div class="row issue ' + escapeHtml(statusSeverity(check.status)) + '">' +
        '<div class="primary">' + escapeHtml(check.sessionId + ' - ' + check.status) + '</div>' +
        '<div class="secondary">' + escapeHtml(check.summary || '') + '</div>' +
        '<div class="secondary">' + escapeHtml(check.projectPath || '') + '</div>' +
        '<div class="secondary">Claude session: ' + escapeHtml(check.claudeSessionId || 'none') + '</div>' +
        '<div class="secondary">inspect-body: ' + escapeHtml(check.inspectBody ? 'on' : 'off') +
          ' - watch token: ' + escapeHtml(check.watchTokenPresent ? 'present' : 'missing') +
          ' - requests: ' + escapeHtml(check.requestCount) +
          ' - latest: ' + escapeHtml(check.lastRequestAt || 'none') + '</div>' +
        '<div class="secondary">Hints</div>' + renderList(check.hints) +
        '</div>').join('');
    }

    function statusSeverity(status) {
      if (status === 'not_routable') return 'bad';
      if (status === 'waiting' || status === 'metadata_only') return 'warn';
      return 'info';
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
        if (state.sessionCompare) {
          detailEl.className = '';
          detailEl.innerHTML = filterHtml(renderSessionCompare());
          return;
        }
        detailEl.className = 'empty';
        detailEl.textContent = 'Select a request';
        return;
      }
      detailEl.className = '';
      const htmlByTab = {
        overview: renderOverview,
        insight: renderAgentInsight,
        compare: renderTurnCompare,
        export: renderTurnExport,
        replay: renderTurnReplay,
        timeline: renderTimeline,
        turn: renderTurnDetail,
        diff: renderContextDiff,
        waterfall: renderContextWaterfall,
        agent: renderAgent,
        system: renderSystemPrompt,
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

    function renderSessionCompare() {
      const compare = state.sessionCompare;
      if (!compare) {
        return '<div class="empty">Select a session to compare monitored runs.</div>';
      }
      const baseline = compare.baseline
        ? '<div class="panel"><div class="panel-title">Baseline session</div>' + renderSessionCompareSide(compare.baseline) + '</div>'
        : '<div class="empty">' + escapeHtml(compare.reason || 'No baseline session') + '</div>';
      const deltas = compare.deltas
        ? '<div class="metric-grid">' +
          metric('Requests delta', signed(compare.deltas.requestCount)) +
          metric('Turns delta', signed(compare.deltas.turnCount)) +
          metric('Context delta', signed(compare.deltas.contextChars)) +
          metric('Tools delta', signed(compare.deltas.toolCount)) +
          metric('Skills delta', signed(compare.deltas.suspectedSkillCount)) +
          metric('Matched prompts', compare.deltas.matchedPromptCount) +
          '</div>'
        : '';
      return '<div class="panel"><div class="panel-title">Session Compare</div><div class="primary">' +
        escapeHtml(compare.headline) +
        '</div></div>' +
        deltas +
        '<div class="panel"><div class="panel-title">Current session</div>' + renderSessionCompareSide(compare.current) + '</div>' +
        baseline +
        '<div class="panel"><div class="panel-title">Matched prompts</div>' + renderMatchedPrompts(compare.matchedPrompts) + '</div>' +
        '<div class="panel"><div class="panel-title">Tools added</div>' + renderList(compare.toolDiff.added) + '</div>' +
        '<div class="panel"><div class="panel-title">Tools removed</div>' + renderList(compare.toolDiff.removed) + '</div>' +
        '<div class="panel"><div class="panel-title">Skills added</div>' + renderList(compare.skillDiff.added) + '</div>' +
        '<div class="panel"><div class="panel-title">Skills removed</div>' + renderList(compare.skillDiff.removed) + '</div>' +
        '<div class="panel"><div class="panel-title">Only current prompts</div>' + renderList(compare.onlyCurrentPrompts) + '</div>' +
        '<div class="panel"><div class="panel-title">Only baseline prompts</div>' + renderList(compare.onlyBaselinePrompts) + '</div>';
    }

    function renderSessionCompareSide(side) {
      return '<div class="secondary">Session: ' + escapeHtml(side.sessionId) + ' - Started: ' + escapeHtml(side.startedAt) + '</div>' +
        '<div class="secondary">Project: ' + escapeHtml(side.projectPath) + '</div>' +
        '<div class="secondary">Requests: ' + escapeHtml(side.requestCount) + ' - Turns: ' + escapeHtml(side.turnCount) + ' - Max context: ' + escapeHtml(side.maxContextChars) + '</div>' +
        '<div class="secondary">Tools: ' + escapeHtml(side.toolNames.join(', ') || 'none') + '</div>' +
        '<div class="secondary">Skills: ' + escapeHtml(side.suspectedSkillNames.join(', ') || 'none') + '</div>';
    }

    function renderMatchedPrompts(prompts) {
      if (!prompts || !prompts.length) return '<span class="secondary">none</span>';
      return prompts.map((prompt) => '<div class="row">' +
        '<div class="primary">' + escapeHtml(prompt.prompt) + '</div>' +
        '<div class="secondary">Current requests: ' + escapeHtml(prompt.currentRequestIds.join(', ')) + ' - Baseline requests: ' + escapeHtml(prompt.baselineRequestIds.join(', ')) + '</div>' +
        '<div class="secondary">Context delta: ' + escapeHtml(signed(prompt.contextDelta)) + ' - Final response changed: ' + escapeHtml(prompt.finalResponseChanged) + '</div>' +
        '<div class="secondary">Tools added: ' + escapeHtml(prompt.toolDiff.added.join(', ') || 'none') + ' - removed: ' + escapeHtml(prompt.toolDiff.removed.join(', ') || 'none') + '</div>' +
        '<div class="secondary">Skills added: ' + escapeHtml(prompt.skillDiff.added.join(', ') || 'none') + ' - removed: ' + escapeHtml(prompt.skillDiff.removed.join(', ') || 'none') + '</div>' +
        '<div class="secondary">Current final response</div><pre class="raw">' + escapeHtml(prompt.currentFinalAssistantPreview || 'none') + '</pre>' +
        '<div class="secondary">Baseline final response</div><pre class="raw">' + escapeHtml(prompt.baselineFinalAssistantPreview || 'none') + '</pre>' +
        '</div>').join('');
    }

    function renderAgentInsight() {
      const insight = state.agentInsight;
      if (!insight) {
        return '<div class="empty">Select an agent request to summarize its behavior.</div>';
      }
      return '<div class="panel"><div class="panel-title">Headline</div><div class="primary">' +
        escapeHtml(insight.headline) +
        '</div><div class="secondary">' + escapeHtml(insight.latestUserText || 'No user prompt detected') + '</div></div>' +
        '<div class="metric-grid">' +
        metric('Requests', insight.requestCount) +
        metric('Model', insight.metrics.model ?? 'unknown') +
        metric('Max context', insight.metrics.maxContextChars) +
        metric('Context delta', signed(insight.metrics.totalContextDelta)) +
        metric('Tools', insight.metrics.toolCount) +
        metric('Skills', insight.metrics.suspectedSkillCount) +
        metric('Tool uses/results', insight.metrics.toolUseCount + ' / ' + insight.metrics.toolResultCount) +
        metric('Tool schema chars', insight.metrics.toolSchemaChars) +
        '</div>' +
        '<div class="panel"><div class="panel-title">Agent Insights</div>' + renderInsightItems(insight.insights) + '</div>' +
        '<div class="panel"><div class="panel-title">Final assistant preview</div><pre class="raw">' +
        escapeHtml(insight.metrics.finalAssistantPreview || 'none') +
        '</pre></div>';
    }

    function renderInsightItems(items) {
      if (!items || !items.length) return '<span class="secondary">none</span>';
      return items.map((item) => '<div class="row issue ' + escapeHtml(item.severity === 'error' ? 'bad' : item.severity === 'warning' ? 'warning' : '') + '">' +
        '<div class="primary">' + escapeHtml(item.title) + '</div>' +
        '<div class="secondary">' + escapeHtml(item.kind + (item.requestId ? ' - request ' + item.requestId : '')) + '</div>' +
        '<div class="secondary">' + escapeHtml(item.detail) + '</div>' +
        '<div class="secondary">' + renderJsonTree(item.values || {}, 'values') + '</div>' +
        '</div>').join('');
    }

    function renderTurnCompare() {
      const compare = state.turnCompare;
      if (!compare) {
        return '<div class="empty">Select an agent request to compare it with the previous turn.</div>';
      }
      if (!compare.comparable) {
        return '<div class="panel"><div class="panel-title">Current turn</div>' + renderCompareSide(compare.current) + '</div>' +
          '<div class="empty">' + escapeHtml(compare.reason || 'No comparable baseline turn') + '</div>';
      }
      return '<div class="panel"><div class="panel-title">Headline</div><div class="primary">' +
        escapeHtml(compare.headline) +
        '</div></div>' +
        '<div class="metric-grid">' +
        metric('Requests delta', signed(compare.deltas.requestCount)) +
        metric('Context delta', signed(compare.deltas.contextChars)) +
        metric('System delta', signed(compare.deltas.systemChars)) +
        metric('Tool schema delta', signed(compare.deltas.toolSchemaChars)) +
        metric('Tools delta', signed(compare.deltas.toolCount)) +
        metric('Skills delta', signed(compare.deltas.suspectedSkillCount)) +
        metric('Tool uses delta', signed(compare.deltas.toolUseCount)) +
        metric('Tool results delta', signed(compare.deltas.toolResultCount)) +
        '</div>' +
        '<div class="panel"><div class="panel-title">Current turn</div>' + renderCompareSide(compare.current) + '</div>' +
        '<div class="panel"><div class="panel-title">Baseline turn</div>' + renderCompareSide(compare.baseline) + '</div>' +
        '<div class="panel"><div class="panel-title">Tools added</div>' + renderList(compare.toolDiff.added) + '</div>' +
        '<div class="panel"><div class="panel-title">Tools removed</div>' + renderList(compare.toolDiff.removed) + '</div>' +
        '<div class="panel"><div class="panel-title">Skills added</div>' + renderList(compare.skillDiff.added) + '</div>' +
        '<div class="panel"><div class="panel-title">Skills removed</div>' + renderList(compare.skillDiff.removed) + '</div>' +
        '<div class="panel"><div class="panel-title">Final response changed</div><div class="primary">' + escapeHtml(compare.finalResponseChanged) + '</div></div>';
    }

    function renderCompareSide(side) {
      if (!side) return '<span class="secondary">none</span>';
      return '<div class="secondary">Requests: ' + escapeHtml(side.requestIds.join(', ')) + ' - ' + escapeHtml(side.firstRequestAt) + '</div>' +
        '<div class="secondary">Prompt: ' + escapeHtml(side.latestUserText || 'none') + '</div>' +
        '<div class="secondary">Context: ' + escapeHtml(side.maxContextChars) + ' - Tools: ' + escapeHtml(side.toolNames.join(', ') || 'none') + ' - Skills: ' + escapeHtml(side.suspectedSkillNames.join(', ') || 'none') + '</div>' +
        '<div class="secondary">Tool uses/results: ' + escapeHtml(side.toolUseCount + ' / ' + side.toolResultCount) + '</div>' +
        '<pre class="raw">' + escapeHtml(side.finalAssistantPreview || 'No assistant text') + '</pre>';
    }

    function renderTurnExport() {
      const exportNote = state.turnExport;
      if (!exportNote) {
        return '<div class="empty">Select an agent request to export a Markdown learning note.</div>';
      }
      return '<div class="panel"><div class="panel-title">Markdown export</div>' +
        '<div class="primary">' + escapeHtml(exportNote.filename) + '</div>' +
        '<div class="session-actions"><button class="small copy-export-markdown" type="button">Copy Markdown</button></div>' +
        '</div>' +
        '<div class="panel"><div class="panel-title">Preview</div><pre class="raw">' +
        escapeHtml(exportNote.markdown) +
        '</pre></div>';
    }

    async function copyMarkdownExport() {
      if (!state.turnExport) return;
      await navigator.clipboard.writeText(state.turnExport.markdown);
    }

    function renderTurnReplay() {
      const replay = state.turnReplay;
      if (!replay) {
        return '<div class="empty">Select an agent request to replay its turn.</div>';
      }
      return '<div class="metric-grid">' +
        metric('Replay events', replay.events.length) +
        metric('Requests', replay.requestCount) +
        metric('Tool uses', replay.summary.toolUseCount) +
        metric('Tool results', replay.summary.toolResultCount) +
        '</div>' +
        '<div class="panel"><div class="panel-title">User prompt</div><pre class="raw">' +
        escapeHtml(replay.latestUserText || 'none') +
        '</pre></div>' +
        '<div class="panel"><div class="panel-title">Replay</div>' + renderReplayEvents(replay.events) + '</div>';
    }

    function renderReplayEvents(events) {
      if (!events || !events.length) return '<span class="secondary">none</span>';
      return events.map((event, index) => '<div class="row">' +
        '<div class="primary">' + escapeHtml(String(index + 1) + '. ' + event.title) + '</div>' +
        '<div class="secondary">' + escapeHtml(event.kind + (event.requestId ? ' - request ' + event.requestId : '')) + '</div>' +
        '<div class="secondary">' + escapeHtml(event.summary || '') + '</div>' +
        '<div class="secondary">Context: ' + escapeHtml(event.contextChars ?? 'n/a') + ' (' + escapeHtml(event.contextDelta === null ? 'n/a' : signed(event.contextDelta)) + ') - Skills: ' + escapeHtml(event.suspectedSkillCount ?? 'n/a') + ' - Tools: ' + escapeHtml(event.toolCount ?? 'n/a') + '</div>' +
        (event.preview ? '<pre class="raw">' + escapeHtml(event.preview) + '</pre>' : '') +
        (event.inputJson ? '<div class="secondary">Input</div><pre class="raw">' + escapeHtml(event.inputJson) + '</pre>' : '') +
        (event.resultChars === undefined ? '' : '<div class="secondary">Result chars: ' + escapeHtml(event.resultChars) + ' - Error: ' + escapeHtml(event.isError) + '</div>') +
        '</div>').join('');
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
        '<div class="panel"><div class="panel-title">Turn Notes</div>' + renderTurnAnnotation() + '</div>' +
        '<div class="panel"><div class="panel-title">Latest user text</div><pre class="raw">' +
        escapeHtml(turn.latestUserText || 'none') +
        '</pre></div>' +
        '<div class="panel"><div class="panel-title">Final assistant text</div><pre class="raw">' +
        escapeHtml(turn.finalAssistantText || 'none') +
        '</pre></div>' +
        '<div class="panel"><div class="panel-title">Tool Loop</div>' + renderToolLoops(turn.toolLoops) + '</div>' +
        '<div class="panel"><div class="panel-title">Turn tool uses</div>' + renderTurnToolUses(turn.toolUses) + '</div>' +
        '<div class="panel"><div class="panel-title">Request steps</div>' + renderTurnSteps(turn.steps) + '</div>';
    }

    function renderTurnAnnotation() {
      const annotation = state.turnAnnotation || { bookmarked: false, tags: [], note: '', updatedAt: null };
      return '<label class="annotation-row">' +
        '<input id="turn-bookmark" type="checkbox" ' + (annotation.bookmarked ? 'checked' : '') + '> Bookmark' +
        '</label>' +
        '<label class="annotation-field"><span>Tags</span>' +
        '<input id="turn-tags" type="text" value="' + escapeHtml((annotation.tags || []).join(', ')) + '" placeholder="context, skill, tool-loop">' +
        '</label>' +
        '<label class="annotation-field"><span>Notes</span>' +
        '<textarea id="turn-note" placeholder="What is worth revisiting in this agent turn?">' + escapeHtml(annotation.note || '') + '</textarea>' +
        '</label>' +
        '<div class="annotation-actions">' +
        '<button class="small save-turn-annotation" type="button">Save</button>' +
        (annotation.updatedAt ? '<span class="secondary">Updated ' + escapeHtml(annotation.updatedAt) + '</span>' : '') +
        '</div>';
    }

    function renderToolLoops(toolLoops) {
      if (!toolLoops || !toolLoops.length) return '<span class="secondary">none</span>';
      return toolLoops.map((loop) => '<div class="row">' +
        '<div class="primary">' + escapeHtml((loop.name || 'unknown tool') + ' - ' + loop.toolUseId) + '</div>' +
        '<div class="secondary">tool_use request ' + escapeHtml(loop.toolUseRequestId) + ' -> result request ' + escapeHtml(loop.resultRequestId) + '</div>' +
        '<div class="secondary">Result chars: ' + escapeHtml(loop.resultChars) + ' - Error: ' + escapeHtml(loop.isError) + ' - Context delta: ' + escapeHtml(loop.contextDeltaAfterResult === null ? 'unknown' : signed(loop.contextDeltaAfterResult)) + '</div>' +
        '<div class="secondary">Input</div><pre class="raw">' + escapeHtml(loop.inputJson || '{}') + '</pre>' +
        '<div class="secondary">Result preview</div><pre class="raw">' + escapeHtml(loop.resultPreview || 'none') + '</pre>' +
        '</div>').join('');
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

    function renderContextWaterfall() {
      const waterfall = state.contextWaterfall;
      if (!waterfall) {
        return '<div class="empty">Select an agent request to inspect its context waterfall.</div>';
      }
      if (waterfall.reason) {
        return '<div class="empty">' + escapeHtml(waterfall.reason) + '</div>';
      }
      return '<div class="metric-grid">' +
        metric('Context chars', waterfall.totalChars) +
        metric('Context delta', waterfall.totalDelta === null ? 'n/a' : signed(waterfall.totalDelta)) +
        metric('Messages', waterfall.summary.messageCount) +
        metric('Tools', waterfall.summary.toolCount) +
        metric('Skills', waterfall.summary.suspectedSkillCount) +
        metric('Tool results', waterfall.summary.toolResultCount) +
        '</div>' +
        '<div class="panel"><div class="panel-title">Context Waterfall</div>' + renderWaterfallSegments(waterfall.segments, 'primary') + '</div>' +
        '<div class="panel"><div class="panel-title">System Breakdown</div>' + renderWaterfallSegments(waterfall.segments, 'system_subsection') + '</div>' +
        '<div class="panel"><div class="panel-title">Messages Breakdown</div>' + renderWaterfallSegments(waterfall.segments, 'messages_subsection') + '</div>';
    }

    function renderWaterfallSegments(segments, group) {
      const filtered = (segments || []).filter((segment) => segment.group === group);
      if (!filtered.length) return '<span class="secondary">none</span>';
      return filtered.map((segment) => {
        const width = Math.max(1, Math.min(100, Number(segment.percent) || 0));
        const delta = segment.deltaChars === null ? 'first request' : signed(segment.deltaChars);
        return '<div class="waterfall-row">' +
          '<div class="waterfall-heading">' +
            '<span class="primary">' + escapeHtml(segment.label) + '</span>' +
            '<span class="secondary">' + escapeHtml(segment.chars + ' chars - ' + segment.percent + '% - ' + delta + ' - items ' + segment.itemCount) + '</span>' +
          '</div>' +
          '<div class="waterfall-track"><div class="waterfall-bar" style="width: ' + width + '%"></div></div>' +
          (segment.preview ? '<pre class="raw">' + escapeHtml(segment.preview) + '</pre>' : '') +
          '</div>';
      }).join('');
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

    function renderSystemPrompt() {
      const system = state.systemPrompt;
      if (!system) {
        return '<div class="empty">No captured system prompt or tool schema for this request.</div>';
      }
      return '<div class="metric-grid">' +
        metric('Model', system.model ?? 'unknown') +
        metric('System chars', system.systemChars) +
        metric('System blocks', system.systemBlockCount) +
        metric('Suspected skills', system.suspectedSkillCount) +
        metric('Tools', system.toolCount) +
        metric('Tool schema chars', system.totalToolSchemaChars) +
        '</div>' +
        '<div class="panel"><div class="panel-title">Skill Explorer</div>' + renderSystemSkills(system.suspectedSkills) + '</div>' +
        '<div class="panel"><div class="panel-title">Tool Schemas</div>' + renderSystemTools(system.tools) + '</div>' +
        '<div class="panel"><div class="panel-title">System Blocks</div>' + renderSystemBlocks(system.systemBlocks) + '</div>';
    }

    function renderSystemSkills(skills) {
      if (!skills || !skills.length) return '<span class="secondary">none</span>';
      return skills.map((skill) => '<div class="row">' +
        '<div class="primary">' + escapeHtml(skill.name) + '</div>' +
        '<div class="secondary">' + escapeHtml(skill.description) + '</div>' +
        '<div class="secondary">Chars: ' + escapeHtml(skill.chars) + '</div>' +
        '<pre class="raw">' + escapeHtml(skill.preview || '') + '</pre>' +
        '</div>').join('');
    }

    function renderSystemTools(tools) {
      if (!tools || !tools.length) return '<span class="secondary">none</span>';
      return tools.map((tool) => '<div class="row">' +
        '<div class="primary">' + escapeHtml(tool.name) + '</div>' +
        '<div class="secondary">' + escapeHtml(tool.descriptionPreview || 'No description') + '</div>' +
        '<div class="secondary">Schema chars: ' + escapeHtml(tool.schemaChars) + ' - Input schema chars: ' + escapeHtml(tool.inputSchemaChars) + '</div>' +
        '</div>').join('');
    }

    function renderSystemBlocks(blocks) {
      if (!blocks || !blocks.length) return '<span class="secondary">none</span>';
      return blocks.map((block) => '<div class="row">' +
        '<div class="primary">#' + escapeHtml(block.index + 1) + ' ' + escapeHtml(block.type) + '</div>' +
        '<div class="secondary">Chars: ' + escapeHtml(block.chars) + '</div>' +
        '<pre class="raw">' + escapeHtml(block.preview || '') + '</pre>' +
        '</div>').join('');
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

    async function fetchJson(url, options = {}) {
      const response = await fetch(url, options);
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
    }, 2000);`;
}
