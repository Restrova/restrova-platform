import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("request logs exclude query/path secrets and reject untrusted correlation IDs", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { requestLogger } from './src/observability/logger.js';
    import { errorHandler } from './src/middleware/errorHandler.js';
    const req = { headers: {'x-request-id': 'private.secret/value'}, method: 'GET', originalUrl: '/private-path-secret?token=query-secret' };
    let finish;
    const res = { statusCode: 404, setHeader(k,v) { console.log(JSON.stringify({header:k,value:v})); }, on(_event,f) {finish=f;}, status() {return this;}, json() {} };
    requestLogger(req,res,()=>{}); finish();
    errorHandler(new Error('internal-secret'),req,res,()=>{});
  `
    ],
    { cwd: new URL("../", import.meta.url), env: { ...process.env, NODE_ENV: "development" }, encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  const output = result.stdout + result.stderr;
  for (const secret of ["private.secret", "private-path-secret", "query-secret", "internal-secret"])
    assert.equal(output.includes(secret), false);
  const header = JSON.parse(result.stdout.split("\n")[0]);
  assert.match(header.value, /^[0-9a-f-]{36}$/);
  assert.match(output, /"route":"unmatched"/);
});
