const API_BASE_URL = "http://127.0.0.1:8000";

// UPDATED: This function connects Lovable frontend to your FastAPI backend /chat endpoint.
export async function sendChatMessage(message: string) {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: message,
    }),
  });

  // ADDED: If backend fails, throw an error so chat.tsx can show a toast message.
  if (!response.ok) {
    throw new Error("Failed to connect to Simone backend");
  }

  return await response.json();
}