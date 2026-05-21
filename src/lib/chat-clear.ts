/** User phrases that clear conversation history without contacting the AI. */
export function isClearChatCommand(text: string): boolean {
  const n = text.trim().toLowerCase().replace(/\s+/g, " ");
  return (
    n === "clear chat" ||
    n === "clear all" ||
    n === "clear history" ||
    n === "clear conversation" ||
    n === "delete chat" ||
    n === "reset chat"
  );
}
