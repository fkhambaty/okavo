import { execFile } from "node:child_process";
import { join } from "node:path";
import { ROOT } from "./okavo-env.mjs";

function redact(text) {
  return String(text || "")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(api[_-]?key|secret|token|password)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}

/** Read-only query against the production D1 database `okavo`. */
export function queryD1(sql) {
  return new Promise((resolve, reject) => {
    execFile(
      "npx",
      ["--yes", "wrangler@4", "d1", "execute", "okavo", "--remote", "--json", "--command", sql],
      {
        cwd: join(ROOT, "cloudflare", "worker"),
        env: process.env,
        timeout: 120000,
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(redact(`${stderr || ""}\n${stdout || ""}`.trim()).slice(0, 700) || error.message));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          const block = Array.isArray(parsed) ? parsed[0] : parsed;
          resolve(block?.results ?? []);
        } catch (parseError) {
          reject(new Error(`D1 returned data that was not JSON. ${redact(stdout).slice(0, 200)}`));
        }
      },
    );
  });
}
