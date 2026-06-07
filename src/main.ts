import { parseConfig } from "./config.js";
import { prepareLocalCertificate } from "./cert.js";
import { startProxyServer } from "./proxy.js";
import { RequestStore } from "./store.js";
import { buildViewerServer } from "./viewer.js";

async function main(): Promise<void> {
  const config = parseConfig();
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
  const viewer = buildViewerServer(store);
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
