import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";

const magic = Buffer.from("RESTROVA-BACKUP-1\n");
const headerSize = magic.length + 12;
const tagSize = 16;

function parseKey(key) {
  if (typeof key !== "string" || !/^[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error("BACKUP_KEY_INVALID");
  }
  return Buffer.from(key, "hex");
}

function validateDatabase(file) {
  const database = new Database(file, { readonly: true, fileMustExist: true });
  try {
    if (database.pragma("integrity_check", { simple: true }) !== "ok") {
      throw new Error("BACKUP_INTEGRITY_FAILED");
    }
    if (database.pragma("foreign_key_check").length) throw new Error("BACKUP_FOREIGN_KEYS_FAILED");
  } finally {
    database.close();
  }
}

function requireNewTarget(target) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    if (fs.existsSync(target + suffix)) throw new Error("BACKUP_TARGET_EXISTS");
  }
}

function publish(file, target) {
  const descriptor = fs.openSync(file, "r");
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  // Both files share a filesystem. Link publishes atomically without overwriting.
  requireNewTarget(target);
  fs.linkSync(file, target);
}

export async function createDatabaseBackup({ source, destination, key }) {
  const encryptionKey = parseKey(key);
  const target = path.resolve(destination);
  requireNewTarget(target);
  const directory = fs.mkdtempSync(path.join(path.dirname(target), ".restrova-backup-"));
  let database;
  try {
    const snapshot = path.join(directory, "snapshot.db");
    const encrypted = path.join(directory, "backup.enc");
    database = new Database(path.resolve(source), { readonly: true, fileMustExist: true });
    // Online backup includes committed WAL data and never runs app migrations/seeding.
    await database.backup(snapshot);
    fs.chmodSync(snapshot, 0o600);
    validateDatabase(snapshot);
    const header = Buffer.concat([magic, randomBytes(12)]);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, header.subarray(magic.length));
    cipher.setAAD(header);
    fs.writeFileSync(encrypted, header, { flag: "wx", mode: 0o600 });
    await pipeline(fs.createReadStream(snapshot), cipher, fs.createWriteStream(encrypted, { flags: "a" }));
    fs.appendFileSync(encrypted, cipher.getAuthTag());
    publish(encrypted, target);
    return { status: "backup_created", format: "restrova-backup-v1" };
  } finally {
    database?.close();
    encryptionKey.fill(0);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

export async function restoreDatabaseBackup({ source, destination, key }) {
  const encryptionKey = parseKey(key);
  const target = path.resolve(destination);
  requireNewTarget(target);
  const input = fs.openSync(path.resolve(source), "r");
  let directory;
  try {
    const size = fs.fstatSync(input).size;
    if (size <= headerSize + tagSize) throw new Error("BACKUP_FORMAT_INVALID");
    const header = Buffer.alloc(headerSize);
    const tag = Buffer.alloc(tagSize);
    fs.readSync(input, header, 0, headerSize, 0);
    fs.readSync(input, tag, 0, tagSize, size - tagSize);
    if (!header.subarray(0, magic.length).equals(magic)) throw new Error("BACKUP_FORMAT_INVALID");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, header.subarray(magic.length), {
      authTagLength: tagSize
    });
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    directory = fs.mkdtempSync(path.join(path.dirname(target), ".restrova-restore-"));
    const snapshot = path.join(directory, "snapshot.db");
    await pipeline(
      fs.createReadStream(null, { fd: input, autoClose: false, start: headerSize, end: size - tagSize - 1 }),
      decipher,
      fs.createWriteStream(snapshot, { flags: "wx", mode: 0o600 })
    );
    // No unauthenticated plaintext reaches the destination, even on corrupt input.
    validateDatabase(snapshot);
    publish(snapshot, target);
    return { status: "backup_restored", integrity: "ok" };
  } finally {
    fs.closeSync(input);
    encryptionKey.fill(0);
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
}
