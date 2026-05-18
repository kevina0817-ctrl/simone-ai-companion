const API_BASE_URL = "http://127.0.0.1:8000";


// Chat endpoint
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

  return await response.json();
}