import { isBoredomOrFreeTimeIntent, isEveningPlanIntent } from "@/lib/boredom-schedule";
import { getPendingRoutineProposal } from "@/lib/routine-proposal-store";
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

  if (isEveningPlanIntent(t)) return true;

  if (/\b(add|put|send|queue)\b/i.test(t) && /\b(approvals?)\b/i.test(t)) {
    return /\b(event|events|schedule|calendar|itinerary|plan)\b/i.test(t);
  }

  return false;
}

/** Purchase chat — do not create schedule/calendar approvals from tool output or text parsers. */
export function shouldSuppressScheduleApprovals(userMessage: string): boolean {
  return isPurchaseOrderIntent(userMessage) && !isScheduleManagementIntent(userMessage);
}

/** Text fallback only when the user explicitly asked to book/queue events — never from assistant replies. */
export function shouldRunScheduleTextFallbacks(userMessage: string): boolean {
  if (shouldSuppressScheduleApprovals(userMessage)) return false;
  if (isTiredEveningRoutineProposalRequest(userMessage)) return false;
  return (
    wantsBulkScheduleApprovals(userMessage) ||
    isScheduleManagementIntent(userMessage) ||
    isEveningPlanIntent(userMessage)
  );
}

const FULL_SCHEDULE_OR_PLAN =
  /\b(?:full[\s-]?day|daily|entire|whole\s+day|itinerary|updated?\s+schedule|adjust(?:ing)?\s+(?:my\s+)?(?:schedule|plan|day)|revise\s+(?:my\s+)?(?:day|schedule)|replan|re-plan|weekend\s+plan|build\s+(?:my|your|a)\s+day)\b/i;

/** User is adding one concrete event to today — skip Approvals. */
export function isDirectSingleEventAddRequest(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t) return false;
  if (wantsBulkScheduleApprovals(t)) return false;
  if (FULL_SCHEDULE_OR_PLAN.test(t)) return false;
  if (/\b(add|put|send|queue)\b/i.test(t) && /\bapprovals?\b/i.test(t)) return false;
  if (/\b(?:all|every|each)\s+(?:event|events)\b/i.test(t)) return false;
  if (!/\b(?:add|schedule|book|set\s+up|put|create)\b/i.test(t)) return false;
  if (/\b(?:today|tonight|this\s+(?:morning|afternoon|evening))\b/i.test(t)) return true;
  if (/\b(?:at|@)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i.test(t)) return true;
  return false;
}

/**
 * Approvals required for multi-event plans or bulk changes; single direct adds go straight to timeline.
 */
export function shouldRequireScheduleApproval(
  userMessage: string,
  eventCount: number,
  opts?: { assistantParsedCount?: number; toolCallCount?: number },
): boolean {
  if (eventCount === 0) return false;
  if (eventCount > 1) return true;

  const assistantParsed = opts?.assistantParsedCount ?? 0;
  const toolCalls = opts?.toolCallCount ?? 0;

  if (assistantParsed > 1 || toolCalls > 1) return true;
  if (wantsBulkScheduleApprovals(userMessage)) return true;
  if (FULL_SCHEDULE_OR_PLAN.test(userMessage)) return true;
  if (isEveningPlanIntent(userMessage) && eventCount > 1) return true;
  if (/\b(add|put|send|queue)\b/i.test(userMessage) && /\bapprovals?\b/i.test(userMessage)) {
    return true;
  }
  if (
    assistantParsed > 0 &&
    shouldParseStructuredScheduleFromReply(userMessage, toolCalls)
  ) {
    return true;
  }
  if (isDirectSingleEventAddRequest(userMessage)) return false;
  return false;
}

/** Strict structured lines in assistant reply (Title — start - end), not loose prose. */
export function shouldParseStructuredScheduleFromReply(
  userMessage: string,
  scheduleActionCount: number,
): boolean {
  if (shouldSuppressScheduleApprovals(userMessage)) return false;
  if (isTiredEveningRoutineProposalRequest(userMessage)) return false;
  if (isAffirmativeRoutineConfirmText(userMessage)) return false;
  if (scheduleActionCount > 0 && isEveningPlanIntent(userMessage)) return false;
  if (wantsBulkScheduleApprovals(userMessage)) return true;
  if (isEveningPlanIntent(userMessage)) return true;
  if (scheduleActionCount > 0 && isScheduleManagementIntent(userMessage)) return true;
  if (
    isScheduleManagementIntent(userMessage) &&
    /\b(?:full[\s-]?day|daily|today'?s?)\s+(?:plan|schedule)|(?:plan|schedule|build)\s+(?:my|your|a)\s+(?:day|today)\b/i.test(
      userMessage,
    )
  ) {
    return true;
  }
  return false;
}

const TIRED_OR_EXHAUSTED = /\b(?:i\s*(?:'m|am)\s+)?(?:tired|exhausted|wiped|drained)\b/i;

const AFFIRMATIVE_SHORT =
  /^(?:yes|yeah|yep|sure|ok(?:ay)?|please|go\s+ahead|do\s+it|schedule\s+(?:it|them|this)|sounds\s+good|that\s+works|let'?s\s+do\s+it)[!.?\s]*$/i;

const AFFIRMATIVE_SCHEDULE =
  /\b(?:yes|yeah|yep|sure|ok(?:ay)?|please|go\s+ahead|do\s+it|schedule\s+(?:it|them|this)|sounds\s+good|that\s+works|let'?s\s+do\s+it)\b/i;

/**
 * User is tired/exhausted — phase 1 is a flexible proposal without clock times.
 * Excludes immediate "schedule now" bulk requests that already carry explicit intent.
 */
export function isTiredEveningRoutineProposalRequest(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t || !TIRED_OR_EXHAUSTED.test(t)) return false;
  if (wantsBulkScheduleApprovals(t)) return false;
  if (/\b(?:add|put|send)\b/i.test(t) && /\bapprovals?\b/i.test(t)) return false;
  return true;
}

export function isAffirmativeRoutineConfirmText(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t) return false;
  return AFFIRMATIVE_SHORT.test(t) || AFFIRMATIVE_SCHEDULE.test(t);
}

/** User confirmed a pending tired-evening routine (e.g. "sure") — client store. */
export function isRoutineProposalConfirmMessage(
  userMessage: string,
  userId?: string,
): boolean {
  if (!isAffirmativeRoutineConfirmText(userMessage) || !userId) return false;
  return Boolean(getPendingRoutineProposal(userId));
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
