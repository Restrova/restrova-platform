import { db } from "./db.js";

const STOPWORDS = new Set([
  "the", "and", "for", "you", "your", "with", "that", "this", "from", "into", "what", "when", "where", "why", "how",
  "use", "using", "make", "more", "answer", "tell", "show", "give", "about", "should", "could", "would", "please",
  "هل", "ما", "ماذا", "كيف", "من", "في", "عن", "على", "إلى", "الى", "هذا", "هذه", "ذلك", "استخدم", "أجبني"
]);
const words = (text) => [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])].filter((word) => !STOPWORDS.has(word));
const score = (queryWords, content) => {
  const lower = content.toLowerCase();
  return queryWords.reduce((total, word) => total + (lower.includes(word) ? 1 : 0), 0);
};

export function chunkText(text, size = 1400) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("Book content cannot be empty.");
  const chunks = [];
  for (let index = 0; index < clean.length; index += size) chunks.push(clean.slice(index, index + size));
  return chunks;
}

export function importKnowledgeDocument({ title, source, content }, restaurantId) {
  if (!title?.trim()) throw new Error("Title is required.");
  const chunks = chunkText(content);
  const run = db.transaction(() => {
    const documentId = Number(db.prepare("INSERT INTO knowledge_documents(restaurant_id,title,source) VALUES (?,?,?)").run(restaurantId, title.trim(), source || null).lastInsertRowid);
    const insert = db.prepare("INSERT INTO knowledge_chunks(restaurant_id,document_id,chunk_index,content) VALUES (?,?,?,?)");
    chunks.forEach((chunk, index) => insert.run(restaurantId, documentId, index, chunk));
    return documentId;
  });
  const documentId = run();
  return { document_id: documentId, title: title.trim(), chunks: chunks.length };
}

export function searchKnowledgeBase(query, restaurantId, limit = 4) {
  const queryWords = words(query);
  if (!queryWords.length) return [];
  return db.prepare(`SELECT c.id,c.content,d.title,d.source FROM knowledge_chunks c JOIN knowledge_documents d ON d.id=c.document_id WHERE c.restaurant_id=?`)
    .all(restaurantId)
    .map((row) => ({ ...row, score: score(queryWords, row.content) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ title, source, content, score }) => ({ title, source, excerpt: content.slice(0, 700), score }));
}

export function knowledgeStatus(restaurantId) {
  return {
    documents: db.prepare("SELECT count(*) count FROM knowledge_documents WHERE restaurant_id=?").get(restaurantId).count,
    chunks: db.prepare("SELECT count(*) count FROM knowledge_chunks WHERE restaurant_id=?").get(restaurantId).count
  };
}
