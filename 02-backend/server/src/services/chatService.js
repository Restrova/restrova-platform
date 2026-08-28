import crypto from "node:crypto";
import { forbidden, notFound, validationError } from "../errors/appError.js";
import { ACTION_TOOLS, getAssistantReply } from "../ai.js";
import { executeTool } from "../tools.js";
import * as chatRepository from "../repositories/chatRepository.js";
import { assertBranchAccess, branchIdFromRequest, defaultBranchId, toolScope } from "./branchService.js";
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

function pendingActionHash(user, branchId, toolName, args) {
  return crypto
    .createHash("sha256")
    .update(`${user.owner_id}|${user.restaurant_id}|${branchId}|${toolName}|${JSON.stringify(args)}`)
    .digest("hex");
}

export async function sendChatMessage(user, body) {
  const parsed = validate(chatSchema, body);
  let sessionId = parsed.sessionId;
  // Branch scoping (H4-branch context): the requested branch is validated
  // against the owner's organization scope, never trusted blindly.
  const branchId = branchIdFromRequest(user, { body: parsed });
  if (parsed.branchId && !branchId) throw notFound("Branch not found");
  if (sessionId && !chatRepository.findSession(user.restaurant_id, branchId, sessionId))
    throw notFound("Session not found");
  if (!sessionId) sessionId = chatRepository.createSession(user.restaurant_id, branchId, parsed.message.slice(0, 48));
  chatRepository.addMessage(sessionId, "user", parsed.message);
  const history = chatRepository.getRecentHistory(sessionId);
  const result = await getAssistantReply(history, toolScope(user, branchId));
  const messageId = chatRepository.addMessage(sessionId, "assistant", result.content);

  // Executive-action loop (C1): the AI only proposes; the action is stored as
  // pending and executed exclusively through the confirm endpoint.
  let pendingAction;
  if (result.actionRequest && ACTION_TOOLS.includes(result.actionRequest.tool)) {
    if (user.role !== "owner") {
      return {
        sessionId,
        message: {
          id: messageId,
          role: "assistant",
          content:
            "هذا الإجراء التنفيذي يتطلب صلاحيات المالك، ولن يُنفَّذ من هذا الحساب.\n\nThis executive action requires the owner role and will not be executed from this account.",
          toolsUsed: result.toolsUsed,
          aiMode: result.aiMode,
          model: result.model
        }
      };
    }
    const { tool, args, description } = result.actionRequest;
    const actionHash = pendingActionHash(user, branchId, tool, args);
    chatRepository.upsertPendingAction({
      restaurantId: user.restaurant_id,
      branchId,
      ownerId: user.owner_id,
      toolName: tool,
      argumentsJson: JSON.stringify(args),
      actionHash
    });
    pendingAction = { hash: actionHash, tool, arguments: args, description, status: "pending" };
  }

  return {
    sessionId,
    message: {
      id: messageId,
      role: "assistant",
      content: result.content,
      toolsUsed: result.toolsUsed,
      aiMode: result.aiMode,
      model: result.model,
      ...(pendingAction ? { pendingAction } : {})
    }
  };
}

export function confirmAction(user, hash) {
  const action = chatRepository.findPendingActionForOwner(hash, user.restaurant_id, user.owner_id);
  if (!action) throw notFound("Pending action not found");
  if (!ACTION_TOOLS.includes(action.tool_name))
    throw forbidden("This tool cannot be executed through action confirmation.");
  if (action.branch_id && !assertBranchAccess(user, action.branch_id)) throw notFound("Pending action not found");
  const result = executeTool(action.tool_name, JSON.parse(action.arguments), toolScope(user, action.branch_id));
  chatRepository.markActionExecuted(action.id);
  return { executed: true, action_hash: action.action_hash, tool: action.tool_name, result };
}

export function cancelAction(user, hash) {
  const action = chatRepository.findPendingActionForOwner(hash, user.restaurant_id, user.owner_id);
  if (!action) throw notFound("Pending action not found");
  if (action.branch_id && !assertBranchAccess(user, action.branch_id)) throw notFound("Pending action not found");
  if (!chatRepository.cancelPendingAction(action.id)) throw notFound("Pending action not found");
  return { cancelled: true, action_hash: action.action_hash, tool: action.tool_name };
}

export function saveFeedback(user, body) {
  const parsed = validate(feedbackSchema, body);
  if (parsed.rating === "needs_correction" && !parsed.correctedAnswer)
    throw validationError("Please provide the corrected answer.");
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
    correctedAnswer: parsed.correctedAnswer,
    correctTools: parsed.correctTools
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
