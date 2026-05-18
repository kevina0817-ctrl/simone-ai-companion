// Helper for direct Lovable AI Gateway calls (OpenAI-compatible REST).
// Used by server functions to avoid an extra SDK dependency.

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
