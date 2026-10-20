import fs from "node:fs";
import path from "node:path";

const fail = () => {
  throw new Error(
    "Production database requires DATABASE_PATH inside a separately mounted durable DATABASE_VOLUME_PATH."
  );
};
const decodeMount = (value) =>
  value.replace(/\\([0-7]{3})/g, (_match, digits) => String.fromCharCode(parseInt(digits, 8)));

// A mount is necessary, but its provider durability and recovery policy still need operator verification.
export function assertProductionDatabasePersistence(
  databasePath,
  {
    environment = process.env,
    realpath = fs.realpathSync,
    readMounts = () => fs.readFileSync("/proc/self/mountinfo", "utf8")
  } = {}
) {
  if (environment.NODE_ENV !== "production") return;
  const volume = environment.DATABASE_VOLUME_PATH;
  if (!environment.DATABASE_PATH || !path.isAbsolute(environment.DATABASE_PATH) || !volume || !path.isAbsolute(volume))
    fail();
  let root, parent, mounts;
  try {
    root = realpath(volume);
    // Inspect the nearest existing ancestor before db.js creates any directories.
    let existing = path.resolve(databasePath);
    const exists = (candidate) => {
      try {
        fs.lstatSync(candidate);
        return true;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        return false;
      }
    };
    while (!exists(existing)) {
      const next = path.dirname(existing);
      if (next === existing) fail();
      existing = next;
    }
    parent = realpath(existing);
    mounts = readMounts();
  } catch {
    fail();
  }
  const inside = (candidate) => {
    const relative = path.relative(root, candidate);
    return (
      relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
    );
  };
  if (root === path.parse(root).root || !inside(path.resolve(databasePath)) || !inside(parent)) fail();
  const records = mounts
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [details, type] = line.split(" - ");
      const fields = details.split(" ");
      return {
        mountpoint: decodeMount(fields[4] || ""),
        writable: fields[5]?.split(",").includes("rw"),
        type: type?.split(" ")[0]
      };
    });
  const mount = records.find((entry) => entry.mountpoint === root);
  if (!mount?.writable || !mount.type || ["tmpfs", "ramfs", "squashfs"].includes(mount.type)) fail();
  // A nested mount can shadow durable storage with tmpfs or a container-local bind.
  // Require the configured volume itself to back the database, not another mount.
  if (
    records.some(
      (entry) =>
        entry.mountpoint !== root &&
        inside(entry.mountpoint) &&
        (parent === entry.mountpoint || parent.startsWith(`${entry.mountpoint}${path.sep}`))
    )
  )
    fail();
}
