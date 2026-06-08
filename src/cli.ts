import { spawn } from "node:child_process";
import { resolve } from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { parseConfig } from "./config.js";
import { prepareLocalCertificate } from "./cert.js";
import { startProxyServer } from "./proxy.js";
import { RequestStore } from "./store.js";
import { buildViewerServer } from "./viewer.js";

interface RunOptions {
  host: string;
  viewerPort: number;
  proxyPort: number;
  project: string;
  inspectBody: boolean;
  resume?: string;
  continue?: boolean;
  forkSession?: boolean;
  claudeArgs: string[];
}

void yargs(hideBin(process.argv))
  .scriptName("claude-watch")
  .command(
    "server",
    "Start the long-lived Claude Watch service",
    (builder) =>
      builder
        .option("host", { type: "string" })
        .option("viewer-port", { type: "number" })
        .option("proxy-port", { type: "number" })
        .option("data-dir", { type: "string" })
        .option("session-id", { type: "string" })
        .option("project", { type: "string" })
        .option("inspect-body", { type: "boolean" }),
    async (argv) => {
      await startServer(commandArgsAfter("server"));
    }
  )
  .command(
    "run",
    "Register a watch session and start Claude through the running service",
    (builder) =>
      builder
        .option("host", { type: "string", default: "127.0.0.1" })
        .option("viewer-port", { type: "number", default: 43110 })
        .option("proxy-port", { type: "number", default: 43111 })
        .option("project", { type: "string", default: process.cwd() })
        .option("inspect-body", { type: "boolean", default: true })
        .option("resume", { type: "string" })
        .option("continue", { type: "boolean", default: false })
        .option("fork-session", { type: "boolean", default: false })
        .parserConfiguration({ "populate--": true }),
    async (argv) => {
      await runClaude({
        host: String(argv.host),
        viewerPort: Number(argv.viewerPort),
        proxyPort: Number(argv.proxyPort),
        project: resolve(String(argv.project)),
        inspectBody: Boolean(argv.inspectBody),
        resume: argv.resume ? String(argv.resume) : undefined,
        continue: Boolean(argv.continue),
        forkSession: Boolean(argv.forkSession),
        claudeArgs: Array.isArray(argv["--"]) ? argv["--"].map(String) : []
      });
    }
  )
  .demandCommand()
  .help()
  .parseAsync();

async function startServer(argv: string[]): Promise<void> {
  const config = parseConfig(argv);
  const store = new RequestStore(config.dbPath);
  store.init();
  store.createSession({
    id: config.sessionId,
    projectPath: config.projectPath,
    inspectBody: config.inspectBody
  });

  if (config.inspectBody) {
    const cert = prepareLocalCertificate(config.dataDir);
    console.warn("Inspect-body mode enabled. HTTPS traffic is intercepted by the local Claude Watch proxy.");
    console.warn(`Local CA path for child process trust: ${cert.caCertPath}`);
  }

  const proxy = await startProxyServer(config, store);
  const viewer = buildViewerServer(store, { repoRoot: process.cwd() });
  await viewer.listen({ host: config.host, port: config.viewerPort });

  console.log(`Claude Watch viewer: http://${config.host}:${config.viewerPort}`);
  console.log(`Claude Watch proxy:  ${proxy.url}`);
  console.log(`Claude Watch session: ${config.sessionId}`);

  const shutdown = async () => {
    await proxy.close();
    await viewer.close();
    store.close();
  };

  process.once("SIGINT", () => {
    void shutdown().then(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown().then(() => process.exit(0));
  });
}

function commandArgsAfter(command: string): string[] {
  const args = hideBin(process.argv);
  const index = args.indexOf(command);
  return index >= 0 ? args.slice(index + 1) : [];
}

async function runClaude(options: RunOptions): Promise<void> {
  const viewerUrl = `http://${options.host}:${options.viewerPort}`;
  const session = await createWatchSession(viewerUrl, options);
  const proxyUrl = `http://cw:${encodeURIComponent(session.watchToken)}@${options.host}:${options.proxyPort}`;
  const args = buildClaudeArgs(options);
  const caPath = resolve(".claude-watch", "mitm", "certs", "ca.pem");

  console.log(`Claude Watch viewer: ${viewerUrl}`);
  console.log(`Claude Watch session: ${session.id}`);

  const child = spawn("claude", args, {
    cwd: options.project,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      HTTP_PROXY: proxyUrl,
      HTTPS_PROXY: proxyUrl,
      CLAUDE_WATCH_SESSION_ID: session.id,
      ...(options.inspectBody ? { NODE_EXTRA_CA_CERTS: caPath } : {})
    }
  });

  await new Promise<void>((resolvePromise, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      process.exitCode = code ?? 1;
      resolvePromise();
    });
  });
}

function buildClaudeArgs(options: RunOptions): string[] {
  const args: string[] = [];
  if (options.continue) {
    args.push("--continue");
  }
  if (options.resume) {
    args.push("--resume", options.resume);
  }
  if (options.forkSession) {
    args.push("--fork-session");
  }
  return args.concat(options.claudeArgs);
}

async function createWatchSession(viewerUrl: string, options: RunOptions): Promise<{ id: string; watchToken: string }> {
  const response = await fetch(`${viewerUrl}/api/watch-sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectPath: options.project,
      inspectBody: options.inspectBody,
      claudeSessionId: options.resume ?? null
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to register watch session at ${viewerUrl}: ${await response.text()}`);
  }

  const body = (await response.json()) as { id?: unknown; watchToken?: unknown };
  if (typeof body.id !== "string" || typeof body.watchToken !== "string") {
    throw new Error("Watch service returned an invalid session registration response");
  }

  return { id: body.id, watchToken: body.watchToken };
}
