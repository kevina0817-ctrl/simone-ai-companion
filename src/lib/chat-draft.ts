const draftKey = (userId: string) => `simone-chat-draft:${userId}`;

export function readChatDraft(userId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(draftKey(userId)) ?? "";
  } catch {
    return "";
  }
}

export function writeChatDraft(userId: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (!value.trim()) {
      sessionStorage.removeItem(draftKey(userId));
    } else {
      sessionStorage.setItem(draftKey(userId), value);
    }
  } catch {
    // ignore quota / private mode
  }
}

export function clearChatDraft(userId: string): void {
  writeChatDraft(userId, "");
}
