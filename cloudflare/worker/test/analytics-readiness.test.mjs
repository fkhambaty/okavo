import assert from "node:assert/strict";
import test from "node:test";
import { analyticsReadiness } from "../../../apps/catalog/api/analytics-readiness.mjs";
import { analyticsIngestStatus, opsAuthStatus, r2Enabled, secretConfigured } from "../src/pure.js";

const SAMPLE = "analytics-sample-secret-value";

test("analytics readiness names missing settings and never echoes a secret", () => {
  const missing = analyticsReadiness({});
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing, ["OKAVO_API_URL", "ANALYTICS_INGEST_SECRET"]);
  const ready = analyticsReadiness({ apiUrl: "https://okavo-api.example", ingestSecret: SAMPLE });
  assert.equal(ready.ok, true);
  assert.equal(JSON.stringify(ready).includes(SAMPLE), false);
  assert.equal(JSON.stringify(missing).includes("secret"), false);
});

test("worker ingest and ops checks report misconfiguration without returning the secret", () => {
  assert.equal(secretConfigured("short"), false);
  assert.equal(analyticsIngestStatus({}, SAMPLE), "misconfigured");
  assert.equal(analyticsIngestStatus({ ANALYTICS_INGEST_SECRET: SAMPLE }, "wrong-value-here!!"), "rejected");
  assert.equal(analyticsIngestStatus({ ANALYTICS_INGEST_SECRET: SAMPLE }, SAMPLE), "ok");
  assert.equal(opsAuthStatus({}, "x"), "misconfigured");
  assert.equal(opsAuthStatus({ OPS_CRON_SECRET: SAMPLE }, SAMPLE), "ok");
  assert.equal(r2Enabled({}), false);
  assert.equal(r2Enabled({ FILES: { put() {}, get() {} } }), true);
  const body = JSON.stringify({
    ingest: analyticsIngestStatus({ ANALYTICS_INGEST_SECRET: SAMPLE }, SAMPLE),
    ops: opsAuthStatus({ OPS_CRON_SECRET: SAMPLE }, "nope-nope-nope-nope"),
  });
  assert.equal(body.includes(SAMPLE), false);
});
