import { wantsBulkScheduleApprovals } from "@/lib/schedule-item";
import type { PendingOrder } from "@/lib/pending-order";

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

/** User is browsing options — recommendations only, no Approvals order yet. */
const RECOMMENDATION_REQUEST =
  /\b(?:recommend(?:ation)?s?|suggest(?:ion)?s?|show\s+me(?:\s+some)?|what\s+(?:are|is)\s+(?:some|a\s+good)|(?:any|some)\s+options?|alternatives?|compare|comparison|help\s+me\s+(?:choose|pick|decide)|which\s+(?:one|should\s+i)|(?:gift|product)\s+ideas?|top\s+picks?|best\s+(?:ones?|options?)|shopping\s+around|browse(?:ing)?|considering(?:\s+my)?\s+options?|can\s+you\s+(?:find|list|show)|looking\s+at\s+(?:some|a\s+few)|few\s+(?:options?|choices?)|multiple\s+options?)\b/i;

const ORDER_CONFIRMATION =
  /\b(?:(?:i\s+)?(?:want|take|get|buy|order|purchase|add)\s+(?:the|this|that|my)|(?:i(?:'ll| will)|let'?s)\s+take|go\s+with|buy\s+this|order\s+this|this\s+one|that\s+one|get\s+me\s+the|send\s+(?:the|this)\s+to\s+approvals?|add\s+(?:the|this|that)\s+(?:\w+\s+){0,6}to\s+approvals?)\b/i;

const OPTION_PICK = /\b(?:the\s+)?(?:(\d+)(?:st|nd|rd|th)|first|second|third|fourth)\s+option\b/i;

/** Buying a category/item type without naming a specific product (e.g. "buy a necklace"). */
const VAGUE_PRODUCT_BROWSE =
  /\b(?:buy|order|get|want|need|purchase)\s+(?:a|an|some)\s+(?!(?:the\b))(?:\w+\s+){0,3}?(?:necklaces?|pendants?|bags?|shoes|sneakers?|items?|products?|jewelry|jewellery)\b/i;

const SPECIFIC_PRODUCT =
  /\b(?:the\s+\w+|this\s+one|that\s+one|tiffany\s*&|pearl\s+necklace|whole\s+foods|amazon\b)/i;

export function isProductRecommendationRequest(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t) return false;
  if (isOrderConfirmationIntent(t)) return false;
  if (RECOMMENDATION_REQUEST.test(t)) return true;
  if (/\b(?:what|which)\b/i.test(t) && SHOPPING_NOUNS.test(t) && !ORDER_CONFIRMATION.test(t)) {
    return true;
  }
  return false;
}

export function isOrderConfirmationIntent(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t) return false;
  if (ORDER_CONFIRMATION.test(t)) return true;
  if (OPTION_PICK.test(t)) return true;
  if (/\b(?:yes|yeah|yep|sure),?\s+(?:the\s+)?/i.test(t) && SHOPPING_NOUNS.test(t) && SPECIFIC_PRODUCT.test(t)) {
    return true;
  }
  return false;
}

function isVagueProductBrowse(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t || isOrderConfirmationIntent(t)) return false;
  if (VAGUE_PRODUCT_BROWSE.test(t) && !SPECIFIC_PRODUCT.test(t)) return true;
  return false;
}

/** True only when the user has chosen a specific product — not while browsing recommendations. */
export function shouldCreateOrderApproval(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t) return false;
  if (isProductRecommendationRequest(t)) return false;
  if (isOrderConfirmationIntent(t)) return true;
  if (isVagueProductBrowse(t)) return false;
  if (isPurchaseOrderIntent(t)) return true;
  return false;
}

/** When multiple tool orders exist, keep at most one for a confirmed purchase turn. */
export function pickSingleOrderForApproval(
  userMessage: string,
  orders: PendingOrder[],
): PendingOrder[] {
  if (orders.length <= 1) return orders;

  const lower = userMessage.trim().toLowerCase();
  const optionMatch = lower.match(
    /\b(?:the\s+)?(?:(\d+)(?:st|nd|rd|th)?|(first|second|third|fourth))\s+option\b/,
  );
  if (optionMatch) {
    const ordinals: Record<string, number> = {
      first: 0,
      second: 1,
      third: 2,
      fourth: 3,
    };
    const idx = optionMatch[1]
      ? Math.max(0, Number.parseInt(optionMatch[1], 10) - 1)
      : (optionMatch[2] ? ordinals[optionMatch[2]] : -1);
    if (idx >= 0 && idx < orders.length) return [orders[idx]!];
  }

  const byTitle = orders.find((o) => {
    const snippet = o.title.toLowerCase().slice(0, 20);
    return snippet.length >= 6 && lower.includes(snippet);
  });
  if (byTitle) return [byTitle];

  return [orders[0]!];
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
