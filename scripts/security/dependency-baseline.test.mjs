import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Prevent known vulnerable releases from returning through a direct or transitive
// lockfile change. The registry audit remains authoritative for new advisories.
const baselines = [
  ["qs", "6.16.1", "6.16.0", "GHSA-6pq8-jhm2-2vcw"],
  [
    "vite",
    "7.3.7",
    "7.3.6",
    "GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-587h-7wmj-h5pm, GHSA-9jrq-w75r-8gcw, GHSA-rq7h-c2jc-7f22"
  ],
  ["@vitest/mocker", "4.1.12", "4.1.11", "GHSA-qxg6-89mg-rqv8, GHSA-xp26-3454-mjgp"],
  ["zod", "4.6.6", "4.4.3", "GHSA-mrhx-c7xc-m3w5"],
  ["body-parser", "2.4.0", "2.2.2", "GHSA-27r3-jxmh-p828"],
  ["undici", "8.12.2", "8.1.0", "GHSA-4qv8-2p9j-2685, GHSA-f72v-6w45-q472, GHSA-xjj6-f33q-929c"],
  ["ip-address", "10.7.4", "10.7.3", "GHSA-rxp7-6hxx-x8q5"]
];
function atLeast(version, floor) {
  const actual = version.split(".").map(Number);
  const minimum = floor.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (actual[i] !== minimum[i]) return actual[i] > minimum[i];
  }
  return true;
}
const lock = readFileSync(new URL("../../pnpm-lock.yaml", import.meta.url), "utf8").split("\nsnapshots:")[0];
const versions = new Map();
for (const line of lock.split("\n")) {
  const match = line.match(/^ {2}['"]?(@?[^\s'"]+?)@(\d+\.\d+\.\d+)['"]?:$/);
  if (match) versions.set(match[1], [...(versions.get(match[1]) || []), match[2]]);
}
for (const [name, floor, vulnerable, advisories] of baselines) {
  test(`all locked ${name} consumers exclude ${advisories}`, () => {
    assert.equal(atLeast(vulnerable, floor), false, "known affected fixture must fail");
    assert.equal(atLeast(floor, floor), true, "patched fixture must pass");
    const installed = versions.get(name);
    assert.ok(installed?.length, `No lock evidence for ${name}; review baseline if dependency is removed`);
    for (const version of installed)
      assert.ok(atLeast(version, floor), `${name}@${version} reintroduces ${advisories}`);
  });
}
