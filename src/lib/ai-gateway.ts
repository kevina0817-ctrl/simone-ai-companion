// Shared AI gateway helpers for server functions (OpenAI-compatible REST).

export const LOVABLE_AI_BASE = "https://ai.gateway.lovable.dev/v1";

export function createLovableAiGatewayProvider(apiKey: string) {
  return {
    apiKey,
    baseUrl: LOVABLE_AI_BASE,
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
  };
}

export type ChatCompletionMessage = Record<string, unknown>;

export type ChatCompletionResult = {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    };
  }>;
};

async function callAgnic(
  token: string,
  messages: ChatCompletionMessage[],
  tools?: unknown[],
): Promise<ChatCompletionResult> {
  const res = await fetch("https://api.agnic.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agnic-Token": token,
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages,
      ...(tools ? { tools } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Rate limit reached — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
    throw new Error(`AI error: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as ChatCompletionResult;
}

async function callLovable(
  apiKey: string,
  messages: ChatCompletionMessage[],
  tools?: unknown[],
): Promise<ChatCompletionResult> {
  const res = await fetch(`${LOVABLE_AI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      ...(tools ? { tools } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Rate limit reached — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    throw new Error(`AI error: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as ChatCompletionResult;
}

/** Prefer Agnic when configured; fall back to Lovable AI Gateway. */
export async function requestChatCompletion(
  messages: ChatCompletionMessage[],
  tools?: unknown[],
): Promise<ChatCompletionResult> {
  const agnicToken = process.env.AGNIC_TOKEN;
  const lovableKey = process.env.LOVABLE_API_KEY;

  if (agnicToken) {
    try {
      return await callAgnic(agnicToken, messages, tools);
    } catch (err) {
      if (!lovableKey) throw err;
    }
  }

  if (lovableKey) return callLovable(lovableKey, messages, tools);

  throw new Error("No AI provider configured (set AGNIC_TOKEN or LOVABLE_API_KEY)");
}
