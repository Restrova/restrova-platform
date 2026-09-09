// Native Ollama API: https://docs.ollama.com/api/chat
// No provider is contacted unless it is explicitly configured by the operator.
export function getAiRuntimeStatus() {
  const configured =
    process.env.AI_PROVIDER === "ollama" && Boolean(process.env.OLLAMA_BASE_URL && process.env.OLLAMA_MODEL);
  return {
    aiConfigured: configured,
    mode: configured ? "ollama" : "builtin",
    model: configured ? process.env.OLLAMA_MODEL : "built-in"
  };
}

export async function createLocalResponse(messages, systemPrompt) {
  const runtime = getAiRuntimeStatus();
  if (!runtime.aiConfigured) throw new Error("Local model is not configured");
  const url = new URL(`${process.env.OLLAMA_BASE_URL.replace(/\/$/, "")}/api/chat`);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Invalid model endpoint");
  const configuredTimeout = Number(process.env.AI_TIMEOUT_MS);
  const timeout =
    Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? Math.min(configuredTimeout, 60000) : 20000;
  const response = await fetch(url, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(timeout),
    headers: {
      "Content-Type": "application/json",
      ...(process.env.OLLAMA_API_KEY ? { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` } : {})
    },
    body: JSON.stringify({
      model: runtime.model,
      stream: false,
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\nThis is a general conversation. You have no business facts or tools in this request. Never claim to have inspected imported records or changed data. For analysis, ask the owner to request a sales summary, top dishes or inventory. If answering in Arabic, use professional Saudi Arabic.`
        },
        ...messages
          .slice(-10)
          .filter((message) => ["user", "assistant"].includes(message.role))
          .map(({ role, content }) => ({ role, content: String(content).slice(0, 6000) }))
      ],
      options: { temperature: 0.2, num_predict: 900 }
    })
  });
  if (!response.ok) throw new Error("Local model unavailable");
  const payload = await response.json();
  const content = payload?.message?.content;
  if (typeof content !== "string" || !content.trim() || content.length > 16000)
    throw new Error("Invalid model response");
  return content.trim();
}
