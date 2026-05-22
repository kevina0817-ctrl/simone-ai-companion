import { wantsBulkScheduleApprovals } from "@/lib/schedule-item";

/** User wants to buy / order / purchase (not manage calendar). */
const PURCHASE_VERBS =
  /\b(?:buy(?:ing)?|order(?:ing)?|purchase(?:ing)?|shop(?:ping)?(?:\s+for)?|get\s+(?:a|an|the|some)|pick\s+up|add\s+to\s+(?:cart|approvals?)|want\s+(?:a|an|the)|need\s+(?:a|an|the))\b/i;

const SHOPPING_NOUNS =
  /\b(?:grocery|groceries|amazon|whole\s+foods|tiffany|pendant|necklace|bag|shoes|sneakers|item|product|jewelry|jewellery|luxury)\b/i;

const PRICE_HINT = /\b(?:US\$|CA\$|CAD|USD|\$\d|approximately|price|priced|cost)\b/i;

export function isPurchaseOrderIntent(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t) return false;
  if (PURCHASE_VERBS.test(t)) return true;
  if (SHOPPING_NOUNS.test(t) && (PURCHASE_VERBS.test(t) || PRICE_HINT.test(t))) return true;
  return false;
}

export function isScheduleManagementIntent(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t) return false;

  if (/\b(cancel|remove|delete|skip|drop)\b/i.test(t)) {
    return /\b(meeting|event|appointment|session|schedule|calendar|class|yoga|workout)\b/i.test(t);
  }

  if (/\b(reschedule|re-schedule|move|postpone|shift|push)\b/i.test(t)) {
    return /\b(meeting|event|appointment|session|schedule|calendar|class)\b/i.test(t);
  }

  if (/\b(schedule|book)\b/i.test(t)) {
    return /\b(meeting|event|appointment|session|call|yoga|workout|lunch|dinner|block|reminder)\b/i.test(
      t,
    );
  }

  if (wantsBulkScheduleApprovals(t)) return true;

  if (/\b(add|put|send|queue)\b/i.test(t) && /\b(approvals?)\b/i.test(t)) {
    return /\b(event|events|schedule|calendar|itinerary|plan)\b/i.test(t);
  }

  return false;
}

/** Purchase chat — do not create schedule/calendar approvals from tool output or text parsers. */
export function shouldSuppressScheduleApprovals(userMessage: string): boolean {
  return isPurchaseOrderIntent(userMessage) && !isScheduleManagementIntent(userMessage);
}

/** Only run schedule text fallbacks when the user clearly asked about calendar/events. */
export function shouldRunScheduleTextFallbacks(userMessage: string): boolean {
  if (shouldSuppressScheduleApprovals(userMessage)) return false;
  return isScheduleManagementIntent(userMessage) || wantsBulkScheduleApprovals(userMessage);
}

/** Line looks like order/product copy, not a calendar event. */
export function looksLikeOrderOrProductLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (PRICE_HINT.test(t)) return true;
  if (/\b(?:sent to approvals?|pending approval|create_pending_order|monthly budget)\b/i.test(t)) {
    return true;
  }
  if (SHOPPING_NOUNS.test(t) && !/\b(at|@)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i.test(t)) {
    return true;
  }
  return false;
}
