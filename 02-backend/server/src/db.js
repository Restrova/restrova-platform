import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.env.DATABASE_PATH || "./data/restaurant.db");
if (process.env.NODE_ENV === "production" && !process.env.DATABASE_PATH) {
  throw new Error("DATABASE_PATH is required in production and must point to durable storage.");
}
fs.mkdirSync(path.dirname(file), { recursive: true });
export const db = new Database(file);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS owners (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS organizations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'CNY', timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai', language TEXT NOT NULL DEFAULT 'ar', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS restaurants (id INTEGER PRIMARY KEY, name TEXT NOT NULL, owner_id INTEGER NOT NULL REFERENCES owners(id));
CREATE TABLE IF NOT EXISTS branches (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id), restaurant_id INTEGER NOT NULL REFERENCES restaurants(id), name TEXT NOT NULL, code TEXT NOT NULL, city TEXT NOT NULL, address TEXT, phone TEXT, pos_system TEXT, operating_day_start TEXT NOT NULL DEFAULT '10:00', operating_day_end TEXT NOT NULL DEFAULT '02:00', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(organization_id,code));
CREATE TABLE IF NOT EXISTS organization_users (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id), owner_id INTEGER NOT NULL REFERENCES owners(id), role TEXT NOT NULL CHECK(role IN ('owner','branch_manager','viewer')), branch_id INTEGER REFERENCES branches(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(organization_id,owner_id));
CREATE TABLE IF NOT EXISTS menu_items (id INTEGER PRIMARY KEY, restaurant_id INTEGER NOT NULL REFERENCES restaurants(id), name TEXT NOT NULL, price REAL NOT NULL, cost REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS inventory (id INTEGER PRIMARY KEY, restaurant_id INTEGER NOT NULL REFERENCES restaurants(id), item_name TEXT NOT NULL, quantity REAL NOT NULL, threshold REAL NOT NULL);
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, restaurant_id INTEGER NOT NULL REFERENCES restaurants(id), items TEXT NOT NULL, total_price REAL NOT NULL, cost REAL NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chat_sessions (id INTEGER PRIMARY KEY, restaurant_id INTEGER NOT NULL REFERENCES restaurants(id), title TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES chat_sessions(id), role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL, timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY, restaurant_id INTEGER NOT NULL, type TEXT NOT NULL, date_range TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS refunds (id INTEGER PRIMARY KEY, restaurant_id INTEGER NOT NULL REFERENCES restaurants(id), order_id INTEGER, amount REAL NOT NULL, reason TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS staff_shifts (id INTEGER PRIMARY KEY, restaurant_id INTEGER NOT NULL REFERENCES restaurants(id), employee_name TEXT NOT NULL, role TEXT NOT NULL, start_at TEXT NOT NULL, end_at TEXT NOT NULL, hourly_rate REAL NOT NULL);
CREATE TABLE IF NOT EXISTS answer_feedback (id INTEGER PRIMARY KEY, restaurant_id INTEGER NOT NULL REFERENCES restaurants(id), session_id INTEGER NOT NULL REFERENCES chat_sessions(id), message_id INTEGER NOT NULL REFERENCES chat_messages(id), question TEXT NOT NULL, original_answer TEXT NOT NULL, rating TEXT NOT NULL CHECK(rating IN ('approved','needs_correction')), corrected_answer TEXT, correct_tools TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(restaurant_id,message_id));
CREATE TABLE IF NOT EXISTS knowledge_documents (id INTEGER PRIMARY KEY, restaurant_id INTEGER NOT NULL REFERENCES restaurants(id), title TEXT NOT NULL, source TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS knowledge_chunks (id INTEGER PRIMARY KEY, restaurant_id INTEGER NOT NULL REFERENCES restaurants(id), document_id INTEGER NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE, chunk_index INTEGER NOT NULL, content TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pending_ai_actions (id INTEGER PRIMARY KEY, restaurant_id INTEGER NOT NULL REFERENCES restaurants(id), branch_id INTEGER REFERENCES branches(id), owner_id INTEGER NOT NULL REFERENCES owners(id), tool_name TEXT NOT NULL, arguments TEXT NOT NULL, action_hash TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','executed','cancelled')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, executed_at TEXT);
`);

function ensureColumn(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

ensureColumn("owners", "name", "TEXT");
ensureColumn("restaurants", "organization_id", "INTEGER REFERENCES organizations(id)");
ensureColumn("restaurants", "currency", "TEXT NOT NULL DEFAULT 'CNY'");
ensureColumn("restaurants", "timezone", "TEXT NOT NULL DEFAULT 'Asia/Shanghai'");
ensureColumn("restaurants", "language", "TEXT NOT NULL DEFAULT 'ar'");
ensureColumn("restaurants", "business_type", "TEXT NOT NULL DEFAULT 'yemeni'");
ensureColumn("orders", "branch_id", "INTEGER REFERENCES branches(id)");
ensureColumn("orders", "discount", "REAL NOT NULL DEFAULT 0");
ensureColumn("orders", "commission", "REAL NOT NULL DEFAULT 0");
ensureColumn("orders", "other_cost", "REAL NOT NULL DEFAULT 0");
ensureColumn("orders", "source_key", "TEXT");
ensureColumn("inventory", "branch_id", "INTEGER REFERENCES branches(id)");
ensureColumn("refunds", "branch_id", "INTEGER REFERENCES branches(id)");
ensureColumn("refunds", "source_key", "TEXT");
ensureColumn("staff_shifts", "branch_id", "INTEGER REFERENCES branches(id)");
ensureColumn("chat_sessions", "branch_id", "INTEGER REFERENCES branches(id)");
ensureColumn("reports", "branch_id", "INTEGER REFERENCES branches(id)");
ensureColumn("answer_feedback", "owner_id", "INTEGER REFERENCES owners(id)");
ensureColumn("knowledge_documents", "branch_id", "INTEGER REFERENCES branches(id)");
ensureColumn("knowledge_chunks", "branch_id", "INTEGER REFERENCES branches(id)");

db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_source_key ON orders(restaurant_id,branch_id,source_key) WHERE source_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_source_key ON refunds(restaurant_id,branch_id,source_key) WHERE source_key IS NOT NULL;
`);

function ensureAccessRecords() {
  const restaurants = db.prepare("SELECT id,name,owner_id,organization_id FROM restaurants").all();
  const insertOrg = db.prepare("INSERT INTO organizations(name,currency,timezone,language) VALUES (?,?,?,?)");
  const updateRestaurant = db.prepare("UPDATE restaurants SET organization_id=?,currency='CNY',timezone='Asia/Shanghai',language='ar',business_type='yemeni' WHERE id=?");
  const insertBranch = db.prepare("INSERT OR IGNORE INTO branches(organization_id,restaurant_id,name,code,city,operating_day_start,operating_day_end) VALUES (?,?,?,?,?,?,?)");
  const insertMembership = db.prepare("INSERT OR IGNORE INTO organization_users(organization_id,owner_id,role,branch_id) VALUES (?,?,?,?)");

  restaurants.forEach((restaurant) => {
    let organizationId = restaurant.organization_id;
    if (!organizationId) {
      organizationId = Number(insertOrg.run(`${restaurant.name} Organization`, "CNY", "Asia/Shanghai", "ar").lastInsertRowid);
      updateRestaurant.run(organizationId, restaurant.id);
    }
    let branch = db.prepare("SELECT id FROM branches WHERE restaurant_id=? ORDER BY id LIMIT 1").get(restaurant.id);
    if (!branch) {
      insertBranch.run(organizationId, restaurant.id, `${restaurant.name} - Guangzhou`, "GZ-01", "Guangzhou", "10:00", "02:00");
      branch = db.prepare("SELECT id FROM branches WHERE restaurant_id=? ORDER BY id LIMIT 1").get(restaurant.id);
    }
    ["orders", "inventory", "refunds", "staff_shifts", "chat_sessions", "reports", "knowledge_documents", "knowledge_chunks"].forEach((table) => {
      db.prepare(`UPDATE ${table} SET branch_id=? WHERE restaurant_id=? AND branch_id IS NULL`).run(branch.id, restaurant.id);
    });
    insertMembership.run(organizationId, restaurant.owner_id, "owner", null);
  });
}

function seed() {
  if (db.prepare("SELECT count(*) n FROM owners").get().n) return;
  const owner = db.prepare("INSERT INTO owners(email,password_hash,name) VALUES (?,?,?)").run("owner@harbor.test", bcrypt.hashSync("demo1234", 10), "Demo Owner").lastInsertRowid;
  const organization = db.prepare("INSERT INTO organizations(name,currency,timezone,language) VALUES (?,?,?,?)").run("Sana'a Hospitality", "CNY", "Asia/Shanghai", "ar").lastInsertRowid;
  const restaurant = db.prepare("INSERT INTO restaurants(name,owner_id,organization_id,currency,timezone,language,business_type) VALUES (?,?,?,?,?,?,?)").run("مطعم صنعاء", owner, organization, "CNY", "Asia/Shanghai", "ar", "yemeni").lastInsertRowid;
  const branch = db.prepare("INSERT INTO branches(organization_id,restaurant_id,name,code,city,operating_day_start,operating_day_end) VALUES (?,?,?,?,?,?,?)").run(organization, restaurant, "مطعم صنعاء - فرع قوانغتشو", "GZ-01", "Guangzhou", "10:00", "02:00").lastInsertRowid;
  db.prepare("INSERT INTO organization_users(organization_id,owner_id,role,branch_id) VALUES (?,?,?,?)").run(organization, owner, "owner", null);
  const menu = [
    ["مندي دجاج", 48, 24], ["مندي لحم", 88, 58], ["حنيذ", 78, 46],
    ["سلتة", 38, 15], ["فحسة", 42, 17], ["Lobster Pasta", 31, 22.5]
  ];
  const insertMenu = db.prepare("INSERT INTO menu_items(restaurant_id,name,price,cost) VALUES (?,?,?,?)");
  menu.forEach((m) => insertMenu.run(restaurant, ...m));
  const insertInventory = db.prepare("INSERT INTO inventory(restaurant_id,branch_id,item_name,quantity,threshold) VALUES (?,?,?,?,?)");
  [["Salmon fillet", 8, 10], ["Burger buns", 42, 15], ["Tomatoes", 12, 10], ["Lobster", 4, 8], ["Coffee beans", 18, 6]].forEach((x) => insertInventory.run(restaurant, branch, ...x));
  const insertOrder = db.prepare("INSERT INTO orders(restaurant_id,branch_id,items,total_price,cost,created_at) VALUES (?,?,?,?,?,?)");
  const now = new Date();
  for (let day = 0; day < 14; day++) {
    for (let i = 0; i < 18 + ((day * 7) % 13); i++) {
      const item = menu[(i + day) % menu.length];
      const qty = 1 + (i % 2);
      const d = new Date(now); d.setDate(now.getDate() - day); d.setHours(11 + (i % 11), (i * 13) % 60, 0, 0);
      insertOrder.run(restaurant, branch, JSON.stringify([{ name: item[0], quantity: qty, price: item[1], cost: item[2] }]), item[1] * qty, item[2] * qty, d.toISOString());
    }
  }
}
if (process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO_SEED === "true") seed();
ensureAccessRecords();
