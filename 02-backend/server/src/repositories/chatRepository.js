import { db } from "../db.js";

export function listSessions(restaurantId, branchId) {
  return db
    .prepare("SELECT * FROM chat_sessions WHERE restaurant_id=? AND branch_id=? ORDER BY created_at DESC")
    .all(restaurantId, branchId);
}

export function findSession(restaurantId, branchId, sessionId) {
  return db
    .prepare("SELECT id FROM chat_sessions WHERE id=? AND restaurant_id=? AND branch_id=?")
    .get(sessionId, restaurantId, branchId);
}

export function createSession(restaurantId, branchId, title) {
  return Number(
    db
      .prepare("INSERT INTO chat_sessions(restaurant_id,branch_id,title) VALUES (?,?,?)")
      .run(restaurantId, branchId, title).lastInsertRowid
  );
}

export function listMessages(sessionId) {
  return db.prepare("SELECT role,content,timestamp FROM chat_messages WHERE session_id=? ORDER BY id").all(sessionId);
}

export function addMessage(sessionId, role, content) {
  return Number(
    db.prepare("INSERT INTO chat_messages(session_id,role,content) VALUES (?,?,?)").run(sessionId, role, content)
      .lastInsertRowid
  );
}

export function getRecentHistory(sessionId) {
  return db
    .prepare("SELECT role,content FROM chat_messages WHERE session_id=? ORDER BY id DESC LIMIT 20")
    .all(sessionId)
    .reverse();
}

export function findPendingAction(hash, restaurantId, branchId, ownerId) {
  return db
    .prepare(
      "SELECT * FROM pending_ai_actions WHERE action_hash=? AND restaurant_id=? AND branch_id=? AND owner_id=? AND status='pending'"
    )
    .get(hash, restaurantId, branchId, ownerId);
}

// Confirmation may arrive from any branch context; resolve by hash within the
// owner's restaurant, then let the service validate the action's own branch.
export function findPendingActionForOwner(hash, restaurantId, ownerId) {
  return db
    .prepare(
      "SELECT * FROM pending_ai_actions WHERE action_hash=? AND restaurant_id=? AND owner_id=? AND status='pending'"
    )
    .get(hash, restaurantId, ownerId);
}

// Idempotent per (owner, scope, tool, arguments): asking the same action again
// re-arms the same hash instead of piling up duplicate pending rows.
export function upsertPendingAction({ restaurantId, branchId, ownerId, toolName, argumentsJson, actionHash }) {
  db.prepare(
    `INSERT INTO pending_ai_actions(restaurant_id,branch_id,owner_id,tool_name,arguments,action_hash,status)
     VALUES (?,?,?,?,?,?,'pending')
     ON CONFLICT(action_hash) DO UPDATE SET status='pending', created_at=CURRENT_TIMESTAMP, executed_at=NULL`
  ).run(restaurantId, branchId, ownerId, toolName, argumentsJson, actionHash);
  return findPendingAction(actionHash, restaurantId, branchId, ownerId);
}

export function markActionExecuted(actionId) {
  db.prepare("UPDATE pending_ai_actions SET status='executed',executed_at=CURRENT_TIMESTAMP WHERE id=?").run(actionId);
}

export function cancelPendingAction(actionId) {
  return (
    db.prepare("UPDATE pending_ai_actions SET status='cancelled' WHERE id=? AND status='pending'").run(actionId)
      .changes === 1
  );
}

export function findAssistantMessage(restaurantId, branchId, sessionId, messageId) {
  return db
    .prepare(
      "SELECT m.id,m.content FROM chat_messages m JOIN chat_sessions s ON s.id=m.session_id WHERE m.id=? AND m.session_id=? AND m.role='assistant' AND s.restaurant_id=? AND s.branch_id=?"
    )
    .get(messageId, sessionId, restaurantId, branchId);
}

export function findPreviousUserQuestion(sessionId, messageId) {
  return (
    db
      .prepare(
        "SELECT content FROM chat_messages WHERE session_id=? AND role='user' AND id < ? ORDER BY id DESC LIMIT 1"
      )
      .get(sessionId, messageId)?.content || ""
  );
}

export function saveFeedback({
  restaurantId,
  ownerId,
  sessionId,
  messageId,
  question,
  originalAnswer,
  rating,
  correctedAnswer,
  correctTools
}) {
  db.prepare(
    `INSERT INTO answer_feedback(restaurant_id,owner_id,session_id,message_id,question,original_answer,rating,corrected_answer,correct_tools)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(restaurant_id,message_id) DO UPDATE SET question=excluded.question,original_answer=excluded.original_answer,rating=excluded.rating,corrected_answer=excluded.corrected_answer,correct_tools=excluded.correct_tools,created_at=CURRENT_TIMESTAMP`
  ).run(
    restaurantId,
    ownerId,
    sessionId,
    messageId,
    question,
    originalAnswer,
    rating,
    correctedAnswer || null,
    JSON.stringify(Array.isArray(correctTools) ? correctTools : [])
  );
}

export function exportFeedback(restaurantId) {
  return db
    .prepare(
      "SELECT question,original_answer,rating,corrected_answer,correct_tools,created_at FROM answer_feedback WHERE restaurant_id=? ORDER BY id"
    )
    .all(restaurantId);
}
