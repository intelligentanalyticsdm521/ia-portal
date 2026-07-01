// Self-contained functional probe for the new enforceViewAsReadOnly
// middleware across all three APIs. Mocks the platform pool so the SQL
// lookup returns either "founder hit" or "no hit" depending on the test
// case. Verifies:
//
//   1. No header → middleware is a no-op (next called)
//   2. Header present + founder lookup hits + GET → next called, req tagged
//   3. Header present + founder lookup hits + POST → 403 view_as_read_only
//   4. Header present + founder lookup MISSES + GET → 403 view_as_forbidden
//   5. Header present + no auth → 401 unauthenticated
//
// Run:  node Portal/scripts/test-view-as-middleware.mjs
//
// This does NOT touch real Azure SQL — pure logic test. The real Rolling
// In It / Briarwood walkthrough is done in the browser-verify agent stage.

import { enforceViewAsReadOnly as oliverMw } from "../../../oliver-api/middleware/enforceViewAsReadOnly.js";
import { enforceViewAsReadOnly as arionMw } from "../../arion-api/middleware/enforceViewAsReadOnly.js";

// LUMEN is CommonJS — use createRequire.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { enforceViewAsReadOnly: lumenMw } = require("../../LUMEN-API/src/middleware/enforceViewAsReadOnly.js");

const FOUNDER_TENANT_ID = "8C9527B9-8999-4B31-A306-F3D4CCC39FBD";
const ROLLING_IN_IT_TENANT_ID = "12839687-67FA-4144-A152-1219D1A64901";

function makeMockPool({ founderHit }) {
  return async function getMockPool() {
    return {
      request() {
        const inputs = {};
        return {
          input(name, _type, value) {
            inputs[name] = value;
            return this;
          },
          async query() {
            return {
              recordset: founderHit ? [{ hit: 1 }] : [],
            };
          },
        };
      },
    };
  };
}

function makeReq({ headers = {}, method = "GET", auth, originalUrl = "/test", isLumen = false }) {
  const req = {
    headers: { ...headers },
    method,
    originalUrl,
    url: originalUrl,
  };
  if (isLumen && auth) {
    // LUMEN reads claims via Bearer header decode or req.platform.user.
    // Synthesize a minimal valid JWT with the claims we want to assert.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify(auth)).toString("base64url");
    req.headers.authorization = `Bearer ${header}.${payload}.`;
    req.platform = { user: { email: auth.email, oid: auth.oid, sub: auth.sub } };
  } else if (auth) {
    req.auth = auth;
  }
  return req;
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(s) { this.statusCode = s; return this; },
    json(b) { this.body = b; return this; },
  };
  return res;
}

function run(name, fn) {
  return fn()
    .then(() => console.log(`PASS  ${name}`))
    .catch((e) => {
      console.error(`FAIL  ${name}: ${e.message}`);
      process.exitCode = 1;
    });
}

async function expect(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function runForApi(name, mkMw) {
  const isLumen = name === "lumen-api";
  console.log(`\n=== ${name} ===`);

  await run(`${name} 1. no header → no-op`, async () => {
    const mw = mkMw({ getPool: makeMockPool({ founderHit: true }) });
    const req = makeReq({});
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    await expect(nextCalled, true, "next called");
    await expect(res.statusCode, 200, "status not touched");
    await expect(req.viewAsReadOnly, undefined, "no view-as tag");
  });

  await run(`${name} 2. founder GET → next + tag`, async () => {
    const mw = mkMw({ getPool: makeMockPool({ founderHit: true }) });
    const req = makeReq({
      headers: {
        "x-view-as-mode": "read_only",
        "x-view-as-tenant": ROLLING_IN_IT_TENANT_ID,
      },
      method: "GET",
      auth: { email: "intelligentanalyticsdm@gmail.com", oid: "founder-oid" },
      isLumen,
    });
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    await expect(nextCalled, true, "next called");
    await expect(req.viewAsReadOnly, true, "tagged");
    await expect(req.viewAsTenantId, ROLLING_IN_IT_TENANT_ID, "tenant tagged");
  });

  await run(`${name} 3. founder POST → 403 view_as_read_only`, async () => {
    const mw = mkMw({ getPool: makeMockPool({ founderHit: true }) });
    const req = makeReq({
      headers: { "x-view-as-mode": "read_only" },
      method: "POST",
      auth: { email: "intelligentanalyticsdm@gmail.com", oid: "founder-oid" },
      isLumen,
    });
    const res = makeRes();
    await mw(req, res, () => { throw new Error("next should not be called on POST"); });
    await expect(res.statusCode, 403, "status 403");
    await expect(res.body.error, "view_as_read_only", "error code");
  });

  await run(`${name} 4. non-founder GET → 403 view_as_forbidden`, async () => {
    const mw = mkMw({ getPool: makeMockPool({ founderHit: false }) });
    const req = makeReq({
      headers: { "x-view-as-mode": "read_only" },
      method: "GET",
      auth: { email: "random@example.com", oid: "stranger-oid" },
      isLumen,
    });
    const res = makeRes();
    await mw(req, res, () => { throw new Error("next should not be called for non-founder"); });
    await expect(res.statusCode, 403, "status 403");
    await expect(res.body.error, "view_as_forbidden", "error code");
    await expect(res.body.reason, "not_founder", "reason");
  });

  await run(`${name} 5. no auth + header → 401 unauthenticated`, async () => {
    const mw = mkMw({ getPool: makeMockPool({ founderHit: true }) });
    const req = makeReq({
      headers: { "x-view-as-mode": "read_only" },
      method: "GET",
      auth: undefined,
    });
    const res = makeRes();
    await mw(req, res, () => { throw new Error("next should not be called without auth"); });
    await expect(res.statusCode, 401, "status 401");
    await expect(res.body.error, "view_as_forbidden", "error code");
    await expect(res.body.reason, "unauthenticated", "reason");
  });

  await run(`${name} 6. founder POST to allowlist (/super/end-session) → next`, async () => {
    const mw = mkMw({ getPool: makeMockPool({ founderHit: true }) });
    const req = makeReq({
      headers: { "x-view-as-mode": "read_only" },
      method: "POST",
      originalUrl: "/super/end-session",
      auth: { email: "intelligentanalyticsdm@gmail.com", oid: "founder-oid" },
      isLumen,
    });
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    await expect(nextCalled, true, "allowlist next called");
  });

  await run(`${name} 7. wrong mode value (emergency) → no-op pass-through`, async () => {
    const mw = mkMw({ getPool: makeMockPool({ founderHit: false }) });
    const req = makeReq({
      headers: { "x-view-as-mode": "emergency" },
      method: "POST",
      auth: { email: "doesnt-matter@example.com", oid: "x" },
      isLumen,
    });
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    await expect(nextCalled, true, "next called (wrong mode value)");
  });
}

await runForApi("oliver-api", oliverMw);
await runForApi("arion-api", arionMw);
await runForApi("lumen-api", lumenMw);

console.log("\n--- done ---");
