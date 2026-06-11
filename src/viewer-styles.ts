export const VIEWER_STYLES = String.raw`    :root {
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
    div.row.active { background: #eaf6f4; }
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
    .traffic-controls {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .mode-switch {
      display: flex;
      gap: 2px;
      padding: 2px;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--subtle);
    }
    .mode-button {
      min-height: 24px;
      border: 0;
      border-radius: 5px;
      padding: 3px 7px;
      background: transparent;
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }
    .mode-button.active {
      background: var(--panel);
      color: var(--text);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
    }
    .request-search {
      position: sticky;
      top: 41px;
      z-index: 2;
      padding: 8px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    .filter-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px; }
    .finding-controls { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; align-items: center; }
    .finding-controls .mode-switch { flex-wrap: wrap; }
    .issue { border-left: 3px solid var(--warn); padding-left: 8px; }
    .issue.info { border-left-color: var(--accent); }
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
    textarea {
      width: 100%;
      min-height: 88px;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px 10px;
      font: inherit;
      font-size: 13px;
      line-height: 1.45;
    }
    .annotation-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 4px 0 10px;
      font-size: 13px;
      font-weight: 650;
    }
    .annotation-row input[type="checkbox"] {
      width: auto;
      height: auto;
      margin: 0;
    }
    .annotation-field {
      display: block;
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }
    .annotation-field input, .annotation-field textarea {
      margin-top: 5px;
      color: var(--text);
      font-weight: 400;
    }
    .annotation-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
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
    .waterfall-row { padding: 8px 0; border-bottom: 1px solid #edf0f5; }
    .waterfall-row:last-child { border-bottom: 0; }
    .waterfall-heading {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 6px;
    }
    .waterfall-track {
      width: 100%;
      height: 10px;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--subtle);
    }
    .waterfall-bar {
      height: 100%;
      border-radius: 999px;
      background: var(--accent);
    }
    .waterfall-row pre.raw { margin-top: 8px; }
    .graph-edge, .graph-node {
      padding: 9px 10px;
      margin-top: 8px;
      border: 1px solid var(--line);
      border-left: 3px solid var(--accent);
      border-radius: 8px;
      background: #fbfcfd;
    }
    .graph-node.tool_use { border-left-color: #1d4ed8; }
    .graph-node.tool_result { border-left-color: var(--warn); }
    .graph-node pre.raw { margin-top: 8px; }
    details.response-raw summary {
      cursor: pointer;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    details.response-raw pre.raw { margin-top: 8px; }
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
    }`;
