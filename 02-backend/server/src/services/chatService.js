import { notFound, validationError } from "../errors/appError.js";
import { getAssistantReply } from "../ai.js";
import { executeTool } from "../tools.js";
import * as chatRepository from "../repositories/chatRepository.js";
import { defaultBranchId, toolScope } from "./branchService.js";
import { chatSchema, feedbackSchema, validate } from "../validation/schemas.js";

export function listChatSessions(user) {
  return chatRepository.listSessions(user.restaurant_id, defaultBranchId(user));
}

export function getChatMessages(user, sessionId) {
  const branchId = defaultBranchId(user);
  const session = chatRepository.findSession(user.restaurant_id, branchId, sessionId);
  if (!session) throw notFound("Session not found");
  return chatRepository.listMessages(session.id);
}

export async function sendChatMessage(user, body) {
  const parsed = validate(chatSchema, body);
  let sessionId = parsed.sessionId;
  const branchId = defaultBranchId(user);
  if (sessionId && !chatRepository.findSession(user.restaurant_id, branchId, sessionId)) throw notFound("Session not found");
  if (!sessionId) sessionId = chatRepository.createSession(user.restaurant_id, branchId, parsed.message.slice(0, 48));
  chatRepository.addMessage(sessionId, "user", parsed.message);
  const history = chatRepository.getRecentHistory(sessionId);
  const result = await getAssistantReply(history, toolScope(user));
  const messageId = chatRepository.addMessage(sessionId, "assistant", result.content);
  return { sessionId, message: { id: messageId, role: "assistant", content: result.content, toolsUsed: result.toolsUsed, aiMode: result.aiMode, model: result.model } };
}

export function confirmAction(user, hash) {
  const branchId = defaultBranchId(user);
  const action = chatRepository.findPendingAction(hash, user.restaurant_id, branchId, user.owner_id);
  if (!action) throw notFound("Pending action not found");
  const result = executeTool(action.tool_name, JSON.parse(action.arguments), toolScope(user));
  chatRepository.markActionExecuted(action.id);
  return { executed: true, action_hash: action.action_hash, result };
}

export function saveFeedback(user, body) {
  const parsed = validate(feedbackSchema, body);
  if (parsed.rating === "needs_correction" && !parsed.correctedAnswer) throw validationError("Please provide the corrected answer.");
  const branchId = defaultBranchId(user);
  const message = chatRepository.findAssistantMessage(user.restaurant_id, branchId, parsed.sessionId, parsed.messageId);
  if (!message) throw notFound("Assistant message not found.");
  const question = chatRepository.findPreviousUserQuestion(parsed.sessionId, parsed.messageId);
  chatRepository.saveFeedback({
    restaurantId: user.restaurant_id,
    ownerId: user.owner_id,
    sessionId: parsed.sessionId,
    messageId: parsed.messageId,
    question,
    originalAnswer: message.content,
    rating: parsed.rating,
    correctedAnswer: parsed.correctedAnswer
  });
  return { saved: true };
}

export function exportTrainingFeedback(user) {
  return chatRepository.exportFeedback(user.restaurant_id).map((row) => ({
    question: row.question,
    correct_tools: JSON.parse(row.correct_tools),
    approved_answer: row.corrected_answer || row.original_answer,
    source: row.rating === "approved" ? "owner_approved" : "owner_corrected",
    created_at: row.created_at
  }));
}
