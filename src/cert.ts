import { mkdirSync } from "node:fs";
import { join } from "node:path";

export interface CertificateInfo {
  caCertPath: string;
  certDir: string;
}

export function prepareLocalCertificate(dataDir: string): CertificateInfo {
  const certDir = join(dataDir, "mitm");
  const caCertPath = join(certDir, "certs", "ca.pem");
  mkdirSync(certDir, { recursive: true });

  return {
    caCertPath,
    certDir
  };
}
