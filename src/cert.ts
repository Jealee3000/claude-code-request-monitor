import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import selfsigned from "selfsigned";

export interface CertificateInfo {
  caCertPath: string;
  warning: string;
}

export function prepareLocalCertificate(dataDir: string): CertificateInfo {
  const certDir = join(dataDir, "certs");
  const caCertPath = join(certDir, "claude-watch-ca.pem");
  const keyPath = join(certDir, "claude-watch-ca-key.pem");
  mkdirSync(certDir, { recursive: true });

  if (!existsSync(caCertPath) || !existsSync(keyPath)) {
    const generated = selfsigned.generate(
      [
        { name: "commonName", value: "Claude Watch Local CA" },
        { name: "organizationName", value: "Claude Watch" }
      ],
      {
        days: 365,
        keySize: 2048,
        algorithm: "sha256",
        extensions: [
          { name: "basicConstraints", cA: true },
          { name: "keyUsage", keyCertSign: true, digitalSignature: true, keyEncipherment: true }
        ]
      }
    );

    writeFileSync(caCertPath, generated.cert, "utf8");
    writeFileSync(keyPath, generated.private, "utf8");
  }

  return {
    caCertPath,
    warning:
      "Inspect-body mode prepared a local CA, but HTTPS MITM is not enabled in this build. HTTPS traffic is logged as CONNECT metadata unless a future MITM adapter is added."
  };
}
