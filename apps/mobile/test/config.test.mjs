import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".expo") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(ts|tsx|json|mjs)$/.test(name)) files.push(full);
  }
  return files;
}

test("app ids, scheme, and eas profiles name Okavo without credentials", () => {
  const app = JSON.parse(readFileSync(path.join(root, "app.json"), "utf8")).expo;
  const eas = JSON.parse(readFileSync(path.join(root, "eas.json"), "utf8"));
  assert.equal(app.ios.bundleIdentifier, "org.okavo.app");
  assert.equal(app.android.package, "org.okavo.app");
  assert.equal(app.scheme, "okavo");
  assert.equal(eas.build.production.android.buildType, "app-bundle");
  assert.equal(JSON.stringify(eas).includes("keystore"), false);
});

test("mobile source does not invent a Razorpay checkout", () => {
  const source = walk(root)
    .filter((file) => !file.includes(`${path.sep}test${path.sep}`))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  assert.equal(/rzp_/.test(source), false);
  assert.equal(/checkout\.razorpay\.com/.test(source), false);
  assert.equal(/RAZORPAY_KEY/.test(source), false);
  assert.match(source, /PAYMENTS_DISABLED_COPY/);
});
