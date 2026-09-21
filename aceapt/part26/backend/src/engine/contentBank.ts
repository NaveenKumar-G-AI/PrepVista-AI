import { ActionType, ContentItem, ContentItemPublic, TopicId } from "../types";

/**
 * MVP placeholder for "the existing question engine" (section 4) and the
 * AI-generated + validated content pipeline (section 39). None of that
 * exists here, so this file plays both roles in miniature: a small, static,
 * hand-written item bank. A real integration should replace
 * `getItemsForAction` with a call into PrepVista's actual question engine
 * (optionally AI-generated, then validated per section 39) and delete the
 * placeholder items below.
 *
 * Percentages (transfer challenge) and Probability (retention recall) get
 * bespoke items because they're the document's own worked examples
 * (sections 9, 10, 45). Every other topic falls back to a generic
 * quantitative-reasoning set so the full loop is still playable end to end.
 */

const PERCENTAGES_TRANSFER: ContentItem[] = [
  {
    id: "pct-t-1",
    topicId: "percentages",
    prompt:
      "A shopkeeper marks up a product's price by 25%, then offers a 20% discount on the marked-up price. Compared to the original price, the final price is:",
    options: ["5% higher", "Unchanged", "5% lower", "10% higher"],
    correctIndex: 1,
    difficulty: "MEDIUM"
  },
  {
    id: "pct-t-2",
    topicId: "percentages",
    prompt:
      "A salary rose from ₹40,000 to ₹46,000. If it now falls by that same percentage, what is the new salary?",
    options: ["₹39,100", "₹40,000", "₹38,500", "₹40,500"],
    correctIndex: 0,
    difficulty: "MEDIUM_HARD"
  },
  {
    id: "pct-t-3",
    topicId: "percentages",
    prompt:
      "A 250 ml solution has its water content reduced by 20%, then the result has its volume increased by 20% by adding syrup. The final volume, as a percentage of the original 250 ml, is:",
    options: ["100%", "96%", "104%", "90%"],
    correctIndex: 1,
    difficulty: "HARD"
  }
];

const PROBABILITY_RECALL: ContentItem[] = [
  {
    id: "prob-r-1",
    topicId: "probability",
    prompt: "A fair coin is tossed once. What is the probability of getting heads?",
    options: ["1/4", "1/2", "1/3", "1"],
    correctIndex: 1,
    difficulty: "EASY"
  },
  {
    id: "prob-r-2",
    topicId: "probability",
    prompt: "A bag has 4 red and 6 blue balls. What is the probability of drawing a red ball at random?",
    options: ["2/5", "1/2", "3/5", "1/4"],
    correctIndex: 0,
    difficulty: "EASY"
  },
  {
    id: "prob-r-3",
    topicId: "probability",
    prompt: "If events A and B are mutually exclusive, what is P(A and B)?",
    options: ["P(A) x P(B)", "0", "1", "P(A) + P(B)"],
    correctIndex: 1,
    difficulty: "MEDIUM"
  }
];

/** Generic placeholder set reused for any topic without curated content. */
const GENERIC_FALLBACK: Omit<ContentItem, "topicId">[] = [
  {
    id: "gen-1",
    prompt: "15% of 240 is:",
    options: ["30", "36", "24", "40"],
    correctIndex: 1,
    difficulty: "EASY"
  },
  {
    id: "gen-2",
    prompt: "A train covers 180 km in 3 hours. What is its average speed?",
    options: ["50 km/h", "60 km/h", "65 km/h", "70 km/h"],
    correctIndex: 1,
    difficulty: "EASY"
  },
  {
    id: "gen-3",
    prompt: "Two numbers are in the ratio 3:5 and sum to 64. What is the larger number?",
    options: ["24", "40", "32", "36"],
    correctIndex: 1,
    difficulty: "MEDIUM"
  },
  {
    id: "gen-4",
    prompt: "An item costing ₹500 is sold at a 20% profit. What is the selling price?",
    options: ["₹520", "₹600", "₹550", "₹580"],
    correctIndex: 1,
    difficulty: "MEDIUM"
  }
];

export function getItemsForAction(topicId: TopicId, actionType: ActionType, count = 3): ContentItem[] {
  if (topicId === "percentages" && actionType === "TRANSFER_CHALLENGE") {
    return PERCENTAGES_TRANSFER.slice(0, count);
  }
  if (topicId === "probability" && actionType === "RECALL") {
    return PROBABILITY_RECALL.slice(0, count);
  }
  return GENERIC_FALLBACK.slice(0, count).map((item) => ({ ...item, topicId, id: `${topicId}-${item.id}` }));
}

export function stripAnswers(items: ContentItem[]): ContentItemPublic[] {
  return items.map(({ correctIndex: _correctIndex, ...rest }) => rest);
}
