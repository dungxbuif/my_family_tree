// Exercised with Bun's TLS client so the Release tests present a real encrypted
// connection to an isolated ingress. The backend is bound to the loopback host.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request as httpsRequest } from "node:https";
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
        "/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:127.0.0.1",
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
        if (!url.pathname.startsWith("/api/v1/") && url.pathname !== "/api/mcp")
          return new Response(null, { status: 404 });
        const headers = new Headers(request.headers);
        headers.set("x-forwarded-proto", "https");
        headers.set("accept-encoding", "identity");
        if (url.pathname === "/api/mcp" && headers.get("host") === server.url.host)
          headers.set("host", "family.test");
        else if (url.pathname !== "/api/mcp") headers.delete("host");
        return fetch(target.origin + url.pathname + url.search, {
          method: request.method,
          headers,
          body: request.body,
          redirect: "manual",
          keepalive: false,
        });
      },
    });
    const fetchTls = async (path, init = {}) => {
      const url = new URL(path, server.url);
      const body = init.body == null
        ? null
        : Buffer.from(await new Response(init.body).arrayBuffer());
      return new Promise((resolve, reject) => {
        const request = httpsRequest(url, {
          method: init.method,
          headers: Object.fromEntries(new Headers(init.headers)),
          ca,
          rejectUnauthorized: true,
        }, (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => resolve(new Response(Buffer.concat(chunks), {
            status: response.statusCode,
            headers: response.headers,
          })));
        });
        request.on("error", reject);
        request.end(body);
      });
    };
    return {
      url: server.url,
      fetch: fetchTls,
      close: () => server.stop(true),
    };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
