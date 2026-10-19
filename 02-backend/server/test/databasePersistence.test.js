import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertProductionDatabasePersistence } from "../src/config/databasePersistence.js";

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "restrova-persistence-"));
  const root = path.join(directory, "durable volume");
  fs.mkdirSync(root);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(root, "nested", "restaurant.db");
  const environment = { NODE_ENV: "production", DATABASE_PATH: file, DATABASE_VOLUME_PATH: root };
  const mount = (type = "ext4", options = "rw") =>
    `123 100 8:1 / ${root.replaceAll(" ", "\\040")} ${options},relatime - ${type} /dev/volume ${options}\n`;
  return { directory, root, file, environment, mount };
}

test("production permits an explicit mounted writable volume, including paths with spaces", (t) => {
  const f = fixture(t);
  assert.doesNotThrow(() =>
    assertProductionDatabasePersistence(f.file, { environment: f.environment, readMounts: f.mount })
  );
  assert.equal(fs.existsSync(path.dirname(f.file)), false, "validation must not create directories");
});

test("production rejects absent, relative, root and unmounted persistence configuration", (t) => {
  const f = fixture(t);
  for (const override of [
    { DATABASE_PATH: undefined },
    { DATABASE_PATH: "./restaurant.db" },
    { DATABASE_VOLUME_PATH: undefined },
    { DATABASE_VOLUME_PATH: "relative" },
    { DATABASE_VOLUME_PATH: "/" }
  ]) {
    assert.throws(
      () =>
        assertProductionDatabasePersistence(f.file, {
          environment: { ...f.environment, ...override },
          readMounts: f.mount
        }),
      /Production database requires/
    );
  }
  assert.throws(() =>
    assertProductionDatabasePersistence(f.file, { environment: f.environment, readMounts: () => "" })
  );
  for (const type of ["tmpfs", "ramfs", "squashfs"]) {
    assert.throws(() =>
      assertProductionDatabasePersistence(f.file, { environment: f.environment, readMounts: () => f.mount(type) })
    );
  }
  assert.throws(() =>
    assertProductionDatabasePersistence(f.file, { environment: f.environment, readMounts: () => f.mount("ext4", "ro") })
  );
});

test("production rejects database escapes through traversal, prefixes and symlinks", (t) => {
  const f = fixture(t);
  const outside = path.join(f.directory, "outside");
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(f.root, "escape"));
  fs.symlinkSync(path.join(outside, "missing.db"), path.join(f.root, "broken-link.db"));
  for (const file of [
    path.join(outside, "db"),
    `${f.root}-other/db`,
    path.join(f.root, "escape", "db"),
    path.join(f.root, "broken-link.db")
  ]) {
    assert.throws(() =>
      assertProductionDatabasePersistence(file, {
        environment: { ...f.environment, DATABASE_PATH: file },
        readMounts: f.mount
      })
    );
  }
});

test("development/test databases remain usable without production mounts", () => {
  for (const NODE_ENV of ["development", "test"]) {
    assert.doesNotThrow(() => assertProductionDatabasePersistence("./local.db", { environment: { NODE_ENV } }));
  }
});

test("a nested mount cannot shadow the declared durable volume", (t) => {
  const f = fixture(t);
  const nested = path.dirname(f.file);
  fs.mkdirSync(nested);
  for (const type of ["tmpfs", "overlay", "ext4"]) {
    const readMounts = () => f.mount() + `124 123 0:12 / ${nested.replaceAll(" ", "\\040")} rw - ${type} shadow rw\n`;
    assert.throws(() => assertProductionDatabasePersistence(f.file, { environment: f.environment, readMounts }));
  }
});
