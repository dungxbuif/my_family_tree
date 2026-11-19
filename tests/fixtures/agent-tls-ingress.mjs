// Exercised with Bun's TLS client so the Release tests present a real encrypted
// connection to an isolated ingress. The backend is bound to the loopback host.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export function agentTlsIngress(backend) {
  const target = new URL(backend);
  if (target.hostname !== "127.0.0.1" && target.hostname !== "localhost")
    throw Error("The agent test ingress requires a loopback backend");
  const folder = mkdtempSync(join(tmpdir(), "agent-tls-"));
  try {
    const keyPath = join(folder, "key.pem"),
      certPath = join(folder, "cert.pem");
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-subj",
        "/CN=127.0.0.1",
        "-addext",
        "subjectAltName=IP:127.0.0.1",
        "-keyout",
        keyPath,
        "-out",
        certPath,
      ],
      { stdio: "ignore" },
    );
    const ca = readFileSync(certPath);
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      tls: { key: readFileSync(keyPath), cert: ca },
      async fetch(request) {
        const url = new URL(request.url);
        if (!url.pathname.startsWith("/api/v1/"))
          return new Response(null, { status: 404 });
        const headers = new Headers(request.headers);
        headers.set("x-forwarded-proto", "https");
        headers.delete("host");
        return fetch(target.origin + url.pathname + url.search, {
          method: request.method,
          headers,
          body: request.body,
          redirect: "manual",
        });
      },
    });
    return {
      fetch: (path, init = {}) =>
        fetch(server.url.origin + path, { ...init, tls: { ca } }),
      close: () => server.stop(true),
    };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
