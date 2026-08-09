import { validationError } from "../errors/appError.js";
import { importKnowledgeDocument, knowledgeStatus, searchKnowledgeBase } from "../knowledge.js";
import { knowledgeImportSchema, validate } from "../validation/schemas.js";

export function getKnowledgeStatus(user) {
  return knowledgeStatus(user.restaurant_id);
}

export function importKnowledge(user, body) {
  return importKnowledgeDocument(validate(knowledgeImportSchema, body), user.restaurant_id);
}

export function searchKnowledge(user, query) {
  const normalized = String(query || "").trim();
  if (!normalized) throw validationError("Search query is required.");
  return searchKnowledgeBase(normalized, user.restaurant_id);
}
