// OpenAI-compatible chat completions for server functions.
// Prefers Agnic when AGNIC_TOKEN is set; falls back to Lovable AI Gateway.

export const LOVABLE_AI_BASE = "https://ai.gateway.lovable.dev/v1";
const AGNIC_AI_BASE = "https://api.agnic.ai/v1";

export type ChatCompletionMessage = Record<string, unknown>;

export type ChatCompletionResult = {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    };
  }>;
};

function parseErrorResponse(status: number, text: string): Error {
  if (status === 429) return new Error("Rate limit reached — try again in a moment.");
  if (status === 402) return new Error("AI credits exhausted. Add credits in workspace settings.");
  return new Error(`AI error: ${text.slice(0, 200)}`);
}

async function postChat(
  url: string,
  headers: Record<string, string>,
  body: { model: string; messages: ChatCompletionMessage[]; tools?: unknown[] },
): Promise<ChatCompletionResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw parseErrorResponse(res.status, await res.text());
  }
  return (await res.json()) as ChatCompletionResult;
}

/** Agnic (production) → Lovable gateway (local / Lovable Cloud). */
export async function requestChatCompletion(opts: {
  messages: ChatCompletionMessage[];
  tools?: unknown[];
}): Promise<ChatCompletionResult> {
  const agnicToken = process.env.AGNIC_TOKEN;
  if (agnicToken) {
    return postChat(`${AGNIC_AI_BASE}/chat/completions`, { "X-Agnic-Token": agnicToken }, {
      model: "openai/gpt-4o-mini",
      messages: opts.messages,
      tools: opts.tools,
    });
  }

  const lovableKey = process.env.LOVABLE_API_KEY;
  if (lovableKey) {
    return postChat(`${LOVABLE_AI_BASE}/chat/completions`, { "Lovable-API-Key": lovableKey }, {
      model: "google/gemini-2.5-flash",
      messages: opts.messages,
      tools: opts.tools,
    });
  }

  throw new Error(
    "No AI provider configured. Add AGNIC_TOKEN to .env.local (copy from backend/.env) or set LOVABLE_API_KEY.",
  );
}

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
