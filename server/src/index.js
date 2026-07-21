import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";
import { getAiRuntimeStatus, getAssistantReply } from "./ai.js";
import { executeTool } from "./tools.js";
import { dataConnectionStatus, importRestaurantData, previewRestaurantData } from "./dataImport.js";
import { importKnowledgeDocument, knowledgeStatus, searchKnowledgeBase } from "./knowledge.js";

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "3mb" }));
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production.");
}
const secret = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

const roleRank = { viewer: 1, branch_manager: 2, owner: 3 };
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM time.");

function getAuthContext(ownerId, organizationId, restaurantId) {
  const membership = db.prepare(`
    SELECT u.id owner_id,u.email,u.name,ou.role,ou.branch_id,o.id organization_id,o.name organization_name,o.currency,o.timezone,o.language,r.id restaurant_id,r.name restaurant_name
    FROM organization_users ou
    JOIN owners u ON u.id=ou.owner_id
    JOIN organizations o ON o.id=ou.organization_id
    JOIN restaurants r ON r.organization_id=o.id
    WHERE u.id=?
      AND (? IS NULL OR o.id=?)
      AND (? IS NULL OR r.id=?)
    ORDER BY ou.id
    LIMIT 1
  `).get(ownerId, organizationId || null, organizationId || null, restaurantId || null, restaurantId || null);
  if (membership) return membership;
  const legacy = db.prepare("SELECT o.id owner_id,o.email,o.name,r.id restaurant_id,r.name restaurant_name,r.organization_id FROM owners o JOIN restaurants r ON r.owner_id=o.id WHERE o.id=? LIMIT 1").get(ownerId);
  if (!legacy) return null;
  return { ...legacy, role: "owner", branch_id: null, organization_id: legacy.organization_id, organization_name: legacy.restaurant_name, currency: "CNY", timezone: "Asia/Shanghai", language: "ar" };
}

function signContext(context) {
  return jwt.sign({ ownerId: context.owner_id, restaurantId: context.restaurant_id, organizationId: context.organization_id, role: context.role }, secret, { expiresIn: "12h" });
}

function auth(req, res, next) {
  try {
    const token = jwt.verify((req.headers.authorization || "").replace("Bearer ", ""), secret);
    const context = getAuthContext(token.ownerId, token.organizationId, token.restaurantId);
    if (!context) return res.status(401).json({ error: "Authentication required" });
    req.user = context;
    next();
  }
  catch { res.status(401).json({ error: "Authentication required" }); }
}
const requireRole = (role) => (req, res, next) => {
  if (roleRank[req.user.role] < roleRank[role]) return res.status(403).json({ error: "Permission denied" });
  next();
};
const requireOwner = requireRole("owner");
const requireManagerWrite = (req, res, next) => {
  if (!["owner", "branch_manager"].includes(req.user.role)) return res.status(403).json({ error: "Viewer access is read-only" });
  next();
};

function assertBranchAccess(req, branchId) {
  const branch = db.prepare("SELECT * FROM branches WHERE id=? AND organization_id=? AND restaurant_id=?").get(branchId, req.user.organization_id, req.user.restaurant_id);
  if (!branch) return null;
  if (req.user.role === "branch_manager" && req.user.branch_id !== branch.id) return null;
  return branch;
}

function defaultBranchId(user) {
  if (user.role === "branch_manager") return user.branch_id;
  return db.prepare("SELECT id FROM branches WHERE restaurant_id=? ORDER BY id LIMIT 1").get(user.restaurant_id)?.id || null;
}

function branchIdFromRequest(req) {
  const requested = req.body?.branchId || req.query?.branchId;
  const branchId = requested ? Number(requested) : defaultBranchId(req.user);
  if (!branchId || !assertBranchAccess(req, branchId)) return null;
  return branchId;
}

function toolScope(req) {
  return { restaurantId: req.user.restaurant_id, branchId: defaultBranchId(req.user), role: req.user.role, ownerId: req.user.owner_id, currency: req.user.currency, timezone: req.user.timezone };
}

function generateTemporaryPassword() {
  return crypto.randomBytes(12).toString("base64url");
}

function serializeMe(user) {
  const branches = db.prepare(`
    SELECT id,name,code,city,address,phone,pos_system,operating_day_start,operating_day_end
    FROM branches
    WHERE organization_id=? AND restaurant_id=?
      AND (? <> 'branch_manager' OR id=?)
    ORDER BY code
  `).all(user.organization_id, user.restaurant_id, user.role, user.branch_id);
  return {
    user: { id: user.owner_id, email: user.email, name: user.name, role: user.role },
    organization: { id: user.organization_id, name: user.organization_name, currency: user.currency, timezone: user.timezone, language: user.language },
    restaurant: { id: user.restaurant_id, name: user.restaurant_name },
    branches
  };
}
app.get("/api/health", (_, res) => {
  const ai = getAiRuntimeStatus();
  res.json({ status: "ok", ai: ai.mode, version: "prefinal", ...ai });
});
app.post("/api/auth/register", (req, res, next) => {
  try {
    const parsed = z.object({
      name: z.string().trim().min(1).max(120),
      email: z.string().email(),
      password: z.string().min(8).max(200),
      organizationName: z.string().trim().min(1).max(160),
      restaurantName: z.string().trim().min(1).max(160),
      branchName: z.string().trim().min(1).max(160),
      branchCode: z.string().trim().min(1).max(40).default("GZ-01"),
      city: z.string().trim().min(1).max(120).default("Guangzhou"),
      currency: z.string().trim().length(3).default("CNY"),
      timezone: z.string().trim().min(1).max(80).default("Asia/Shanghai"),
      language: z.string().trim().min(2).max(10).default("ar"),
      operatingDayStart: timeSchema.default("10:00"),
      operatingDayEnd: timeSchema.default("02:00")
    }).parse(req.body);
    const result = db.transaction(() => {
      if (db.prepare("SELECT id FROM owners WHERE lower(email)=lower(?)").get(parsed.email)) throw new Error("Email is already registered.");
      const ownerId = Number(db.prepare("INSERT INTO owners(email,password_hash,name) VALUES (?,?,?)").run(parsed.email, bcrypt.hashSync(parsed.password, 10), parsed.name).lastInsertRowid);
      const organizationId = Number(db.prepare("INSERT INTO organizations(name,currency,timezone,language) VALUES (?,?,?,?)").run(parsed.organizationName, parsed.currency.toUpperCase(), parsed.timezone, parsed.language).lastInsertRowid);
      const restaurantId = Number(db.prepare("INSERT INTO restaurants(name,owner_id,organization_id,currency,timezone,language,business_type) VALUES (?,?,?,?,?,?,?)").run(parsed.restaurantName, ownerId, organizationId, parsed.currency.toUpperCase(), parsed.timezone, parsed.language, "yemeni").lastInsertRowid);
      const branchId = Number(db.prepare("INSERT INTO branches(organization_id,restaurant_id,name,code,city,operating_day_start,operating_day_end) VALUES (?,?,?,?,?,?,?)").run(organizationId, restaurantId, parsed.branchName, parsed.branchCode, parsed.city, parsed.operatingDayStart, parsed.operatingDayEnd).lastInsertRowid);
      db.prepare("INSERT INTO organization_users(organization_id,owner_id,role,branch_id) VALUES (?,?,?,?)").run(organizationId, ownerId, "owner", null);
      return getAuthContext(ownerId, organizationId, restaurantId);
    })();
    res.status(201).json({ token: signContext(result), ...serializeMe(result) });
  } catch (error) { next(error); }
});
app.post("/api/auth/login", (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(8), organizationId: z.number().int().positive().optional(), restaurantId: z.number().int().positive().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Valid email and password are required" });
  const owner = db.prepare("SELECT * FROM owners WHERE email=?").get(parsed.data.email);
  if (!owner || !bcrypt.compareSync(parsed.data.password, owner.password_hash)) return res.status(401).json({ error: "Invalid credentials" });
  const context = getAuthContext(owner.id, parsed.data.organizationId, parsed.data.restaurantId);
  if (!context) return res.status(403).json({ error: "No access to that organization or restaurant" });
  res.json({ token: signContext(context), restaurant: { id: context.restaurant_id, name: context.restaurant_name }, ...serializeMe(context) });
});
app.post("/api/auth/logout", (_req, res) => res.json({ ok: true }));
app.get("/api/auth/me", auth, (req, res) => res.json(serializeMe(req.user)));
app.post("/api/organizations", auth, requireRole("owner"), (req, res, next) => {
  try {
    const parsed = z.object({ name: z.string().trim().min(1).max(160), currency: z.string().trim().length(3).default("CNY"), timezone: z.string().trim().min(1).max(80).default("Asia/Shanghai"), language: z.string().trim().min(2).max(10).default("ar") }).parse(req.body);
    const id = Number(db.prepare("INSERT INTO organizations(name,currency,timezone,language) VALUES (?,?,?,?)").run(parsed.name, parsed.currency.toUpperCase(), parsed.timezone, parsed.language).lastInsertRowid);
    db.prepare("INSERT INTO organization_users(organization_id,owner_id,role,branch_id) VALUES (?,?,?,?)").run(id, req.user.owner_id, "owner", null);
    res.status(201).json(db.prepare("SELECT * FROM organizations WHERE id=?").get(id));
  } catch (error) { next(error); }
});
app.get("/api/organizations/current", auth, (req, res) => res.json({ id: req.user.organization_id, name: req.user.organization_name, currency: req.user.currency, timezone: req.user.timezone, language: req.user.language }));
app.post("/api/restaurants", auth, requireRole("owner"), (req, res, next) => {
  try {
    const parsed = z.object({ name: z.string().trim().min(1).max(160), businessType: z.string().trim().min(1).max(80).default("yemeni") }).parse(req.body);
    const id = Number(db.prepare("INSERT INTO restaurants(name,owner_id,organization_id,currency,timezone,language,business_type) VALUES (?,?,?,?,?,?,?)").run(parsed.name, req.user.owner_id, req.user.organization_id, req.user.currency, req.user.timezone, req.user.language, parsed.businessType).lastInsertRowid);
    res.status(201).json(db.prepare("SELECT id,name,currency,timezone,language,business_type FROM restaurants WHERE id=?").get(id));
  } catch (error) { next(error); }
});
app.get("/api/restaurants/current", auth, (req, res) => res.json({ id: req.user.restaurant_id, name: req.user.restaurant_name, currency: req.user.currency, timezone: req.user.timezone, language: req.user.language }));
app.post("/api/branches", auth, requireRole("owner"), (req, res, next) => {
  try {
    const parsed = z.object({
      name: z.string().trim().min(1).max(160),
      code: z.string().trim().min(1).max(40),
      city: z.string().trim().min(1).max(120),
      address: z.string().trim().max(240).optional(),
      phone: z.string().trim().max(80).optional(),
      posSystem: z.string().trim().max(120).optional(),
      operatingDayStart: timeSchema.default("10:00"),
      operatingDayEnd: timeSchema.default("02:00")
    }).parse(req.body);
    const id = Number(db.prepare("INSERT INTO branches(organization_id,restaurant_id,name,code,city,address,phone,pos_system,operating_day_start,operating_day_end) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(req.user.organization_id, req.user.restaurant_id, parsed.name, parsed.code, parsed.city, parsed.address || null, parsed.phone || null, parsed.posSystem || null, parsed.operatingDayStart, parsed.operatingDayEnd).lastInsertRowid);
    res.status(201).json(db.prepare("SELECT * FROM branches WHERE id=?").get(id));
  } catch (error) { next(error); }
});
app.get("/api/branches", auth, (req, res) => {
  res.json(db.prepare(`
    SELECT id,name,code,city,address,phone,pos_system,operating_day_start,operating_day_end
    FROM branches
    WHERE organization_id=? AND restaurant_id=? AND (? <> 'branch_manager' OR id=?)
    ORDER BY code
  `).all(req.user.organization_id, req.user.restaurant_id, req.user.role, req.user.branch_id));
});
app.patch("/api/branches/:id", auth, requireRole("owner"), (req, res, next) => {
  try {
    const branchId = Number(req.params.id);
    if (!assertBranchAccess(req, branchId)) return res.status(404).json({ error: "Branch not found" });
    const parsed = z.object({
      name: z.string().trim().min(1).max(160).optional(),
      code: z.string().trim().min(1).max(40).optional(),
      city: z.string().trim().min(1).max(120).optional(),
      address: z.string().trim().max(240).nullable().optional(),
      phone: z.string().trim().max(80).nullable().optional(),
      posSystem: z.string().trim().max(120).nullable().optional(),
      operatingDayStart: timeSchema.optional(),
      operatingDayEnd: timeSchema.optional()
    }).parse(req.body);
    const current = db.prepare("SELECT * FROM branches WHERE id=?").get(branchId);
    db.prepare("UPDATE branches SET name=?,code=?,city=?,address=?,phone=?,pos_system=?,operating_day_start=?,operating_day_end=? WHERE id=?")
      .run(parsed.name ?? current.name, parsed.code ?? current.code, parsed.city ?? current.city, parsed.address ?? current.address, parsed.phone ?? current.phone, parsed.posSystem ?? current.pos_system, parsed.operatingDayStart ?? current.operating_day_start, parsed.operatingDayEnd ?? current.operating_day_end, branchId);
    res.json(db.prepare("SELECT * FROM branches WHERE id=?").get(branchId));
  } catch (error) { next(error); }
});
app.post("/api/users/invite", auth, requireRole("owner"), (req, res, next) => {
  try {
    const parsed = z.object({ email: z.string().email(), name: z.string().trim().max(120).optional(), role: z.enum(["branch_manager", "viewer"]), branchId: z.number().int().positive().optional() }).parse(req.body);
    if (parsed.role === "branch_manager" && !parsed.branchId) return res.status(400).json({ error: "Branch manager requires a branch." });
    if (parsed.branchId && !assertBranchAccess(req, parsed.branchId)) return res.status(404).json({ error: "Branch not found" });
    const result = db.transaction(() => {
      let user = db.prepare("SELECT id,email,name FROM owners WHERE lower(email)=lower(?)").get(parsed.email);
      const temporaryPassword = generateTemporaryPassword();
      if (!user) {
        const id = Number(db.prepare("INSERT INTO owners(email,password_hash,name) VALUES (?,?,?)").run(parsed.email, bcrypt.hashSync(temporaryPassword, 10), parsed.name || parsed.email.split("@")[0]).lastInsertRowid);
        user = db.prepare("SELECT id,email,name FROM owners WHERE id=?").get(id);
      }
      db.prepare("INSERT INTO organization_users(organization_id,owner_id,role,branch_id) VALUES (?,?,?,?) ON CONFLICT(organization_id,owner_id) DO UPDATE SET role=excluded.role,branch_id=excluded.branch_id")
        .run(req.user.organization_id, user.id, parsed.role, parsed.branchId || null);
      return { user, temporaryPassword };
    })();
    res.status(201).json({ id: result.user.id, email: result.user.email, name: result.user.name, role: parsed.role, branch_id: parsed.branchId || null, temporaryPassword: result.temporaryPassword });
  } catch (error) { next(error); }
});
app.get("/api/users", auth, requireRole("owner"), (req, res) => {
  res.json(db.prepare(`
    SELECT u.id,u.email,u.name,ou.role,ou.branch_id,b.name branch_name
    FROM organization_users ou
    JOIN owners u ON u.id=ou.owner_id
    LEFT JOIN branches b ON b.id=ou.branch_id
    WHERE ou.organization_id=?
    ORDER BY ou.role,u.email
  `).all(req.user.organization_id));
});
app.patch("/api/users/:id/role", auth, requireRole("owner"), (req, res, next) => {
  try {
    const ownerId = Number(req.params.id);
    const parsed = z.object({ role: z.enum(["owner", "branch_manager", "viewer"]), branchId: z.number().int().positive().nullable().optional() }).parse(req.body);
    if (parsed.role === "branch_manager" && !parsed.branchId) return res.status(400).json({ error: "Branch manager requires a branch." });
    if (parsed.branchId && !assertBranchAccess(req, parsed.branchId)) return res.status(404).json({ error: "Branch not found" });
    const membership = db.prepare("SELECT id FROM organization_users WHERE organization_id=? AND owner_id=?").get(req.user.organization_id, ownerId);
    if (!membership) return res.status(404).json({ error: "User not found" });
    db.prepare("UPDATE organization_users SET role=?,branch_id=? WHERE id=?").run(parsed.role, parsed.role === "branch_manager" ? parsed.branchId : null, membership.id);
    res.json({ updated: true });
  } catch (error) { next(error); }
});
app.get("/api/dashboard", auth, (req, res) => {
  const scope = toolScope(req);
  res.json({ currency: req.user.currency, sales: executeTool("get_daily_sales", {}, scope), inventory: executeTool("get_inventory_status", {}, scope), topDishes: executeTool("get_top_dishes", {}, scope).slice(0, 3) });
});
app.get("/api/data/status", auth, (req, res) => res.json(dataConnectionStatus(req.user.restaurant_id, defaultBranchId(req.user))));
app.post("/api/data/import/preview", auth, requireOwner, (req, res, next) => {
  try {
    const parsed = z.object({
      type: z.enum(["orders", "refunds", "menu_items", "inventory", "staff_shifts"]),
      csv: z.string().min(1).max(2_500_000)
    }).parse(req.body);
    res.json(previewRestaurantData(parsed.type, parsed.csv));
  } catch (error) { next(error); }
});
app.post("/api/data/import", auth, requireOwner, (req, res, next) => {
  try {
    const parsed = z.object({
      type: z.enum(["orders", "refunds", "menu_items", "inventory", "staff_shifts"]),
      csv: z.string().min(1).max(2_500_000),
      branchId: z.number().int().positive().optional(),
      confirm: z.literal(true)
    }).parse(req.body);
    const branchId = branchIdFromRequest(req);
    if (!branchId) return res.status(404).json({ error: "Branch not found" });
    res.status(201).json(importRestaurantData(parsed.type, parsed.csv, req.user.restaurant_id, { branchId, confirm: parsed.confirm }));
  } catch (error) { next(error); }
});
app.get("/api/knowledge/status", auth, (req, res) => res.json(knowledgeStatus(req.user.restaurant_id)));
app.post("/api/knowledge/import", auth, requireOwner, (req, res, next) => {
  try {
    const parsed = z.object({
      title: z.string().trim().min(1).max(200),
      source: z.string().trim().max(500).optional(),
      content: z.string().trim().min(1).max(2_500_000)
    }).parse(req.body);
    res.status(201).json(importKnowledgeDocument(parsed, req.user.restaurant_id));
  } catch (error) { next(error); }
});
app.get("/api/knowledge/search", auth, (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) return res.status(400).json({ error: "Search query is required." });
  res.json(searchKnowledgeBase(query, req.user.restaurant_id));
});
app.get("/api/chat/sessions", auth, (req, res) => res.json(db.prepare("SELECT * FROM chat_sessions WHERE restaurant_id=? AND branch_id=? ORDER BY created_at DESC").all(req.user.restaurant_id, defaultBranchId(req.user))));
app.get("/api/chat/sessions/:id/messages", auth, (req, res) => {
  const session = db.prepare("SELECT id FROM chat_sessions WHERE id=? AND restaurant_id=? AND branch_id=?").get(req.params.id, req.user.restaurant_id, defaultBranchId(req.user));
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(db.prepare("SELECT role,content,timestamp FROM chat_messages WHERE session_id=? ORDER BY id").all(session.id));
});
app.post("/api/chat", auth, async (req, res, next) => {
  try {
    const parsed = z.object({ message: z.string().trim().min(1).max(4000), sessionId: z.number().int().positive().optional() }).parse(req.body);
    let sessionId = parsed.sessionId;
    const branchId = defaultBranchId(req.user);
    if (sessionId && !db.prepare("SELECT id FROM chat_sessions WHERE id=? AND restaurant_id=? AND branch_id=?").get(sessionId, req.user.restaurant_id, branchId)) return res.status(404).json({ error: "Session not found" });
    if (!sessionId) sessionId = Number(db.prepare("INSERT INTO chat_sessions(restaurant_id,branch_id,title) VALUES (?,?,?)").run(req.user.restaurant_id, branchId, parsed.message.slice(0, 48)).lastInsertRowid);
    db.prepare("INSERT INTO chat_messages(session_id,role,content) VALUES (?,'user',?)").run(sessionId, parsed.message);
    const history = db.prepare("SELECT role,content FROM chat_messages WHERE session_id=? ORDER BY id DESC LIMIT 20").all(sessionId).reverse();
    const result = await getAssistantReply(history, toolScope(req));
    const messageId = Number(db.prepare("INSERT INTO chat_messages(session_id,role,content) VALUES (?,'assistant',?)").run(sessionId, result.content).lastInsertRowid);
    res.json({ sessionId, message: { id: messageId, role: "assistant", content: result.content, toolsUsed: result.toolsUsed, aiMode: result.aiMode, model: result.model } });
  } catch (error) { next(error); }
});
app.post("/api/actions/:hash/confirm", auth, requireOwner, (req, res, next) => {
  try {
    const branchId = defaultBranchId(req.user);
    const action = db.prepare("SELECT * FROM pending_ai_actions WHERE action_hash=? AND restaurant_id=? AND branch_id=? AND owner_id=? AND status='pending'")
      .get(req.params.hash, req.user.restaurant_id, branchId, req.user.owner_id);
    if (!action) return res.status(404).json({ error: "Pending action not found" });
    const result = executeTool(action.tool_name, JSON.parse(action.arguments), toolScope(req));
    db.prepare("UPDATE pending_ai_actions SET status='executed',executed_at=CURRENT_TIMESTAMP WHERE id=?").run(action.id);
    res.json({ executed: true, action_hash: action.action_hash, result });
  } catch (error) { next(error); }
});
app.post("/api/feedback", auth, (req, res, next) => {
  try {
    const parsed = z.object({
      sessionId: z.number().int().positive(),
      messageId: z.number().int().positive(),
      rating: z.enum(["approved", "needs_correction"]),
      correctedAnswer: z.string().trim().max(12000).optional(),
      correctTools: z.array(z.string().min(1).max(80)).max(12).default([])
    }).parse(req.body);
    if (parsed.rating === "needs_correction" && !parsed.correctedAnswer) return res.status(400).json({ error: "Please provide the corrected answer." });
    const message = db.prepare("SELECT m.id,m.content FROM chat_messages m JOIN chat_sessions s ON s.id=m.session_id WHERE m.id=? AND m.session_id=? AND m.role='assistant' AND s.restaurant_id=? AND s.branch_id=?").get(parsed.messageId, parsed.sessionId, req.user.restaurant_id, defaultBranchId(req.user));
    if (!message) return res.status(404).json({ error: "Assistant message not found." });
    const question = db.prepare("SELECT content FROM chat_messages WHERE session_id=? AND role='user' AND id < ? ORDER BY id DESC LIMIT 1").get(parsed.sessionId, parsed.messageId)?.content || "";
    db.prepare(`INSERT INTO answer_feedback(restaurant_id,owner_id,session_id,message_id,question,original_answer,rating,corrected_answer,correct_tools)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(restaurant_id,message_id) DO UPDATE SET question=excluded.question,original_answer=excluded.original_answer,rating=excluded.rating,corrected_answer=excluded.corrected_answer,correct_tools=excluded.correct_tools,created_at=CURRENT_TIMESTAMP`)
      .run(req.user.restaurant_id, req.user.owner_id, parsed.sessionId, parsed.messageId, question, message.content, parsed.rating, parsed.correctedAnswer || null, JSON.stringify([]));
    res.status(201).json({ saved: true });
  } catch (error) { next(error); }
});
app.get("/api/training/export", auth, (req, res) => {
  const rows = db.prepare("SELECT question,original_answer,rating,corrected_answer,correct_tools,created_at FROM answer_feedback WHERE restaurant_id=? ORDER BY id").all(req.user.restaurant_id);
  res.json(rows.map((row) => ({
    question: row.question,
    correct_tools: JSON.parse(row.correct_tools),
    approved_answer: row.corrected_answer || row.original_answer,
    source: row.rating === "approved" ? "owner_approved" : "owner_corrected",
    created_at: row.created_at
  })));
});
if (process.env.NODE_ENV === "production") {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const webDist = path.resolve(currentDir, "../../web/dist");
  app.use(express.static(webDist));
  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });
}
app.use((error, _req, res, _next) => {
  console.error(error);
  const isBadRequest = error.name === "ZodError" || /already registered|UNIQUE constraint|Preview this CSV|branch is required|Unsupported import|Missing required columns|must be/i.test(error.message || "");
  res.status(isBadRequest ? 400 : 500).json({ error: error.name === "ZodError" ? "Invalid request" : isBadRequest ? error.message : "Unable to complete request" });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(process.env.PORT || 4000, () => {
    const ai = getAiRuntimeStatus();
    console.log(`API listening on http://localhost:${process.env.PORT || 4000}`);
    console.info(JSON.stringify({ source: "restaurant-ai", event: "ai_mode_active", mode: ai.mode, model: ai.model }));
  });
}

export { app, getAuthContext, serializeMe };
