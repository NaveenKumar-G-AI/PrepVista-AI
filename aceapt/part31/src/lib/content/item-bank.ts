import type { Item, SanitizedItem } from '@/lib/db/schema';
import { CAP_APPLIED, CAP_DATA_INTERPRETATION, CAP_DECISION, CAP_FOUNDATIONS, CAP_TRANSFER, CAP_COMMUNICATION } from './targets';

// Every item carries `tags`, which the blueprint engine matches against a
// stage template's `itemPoolTags` (spec §38 — item selection driven by
// target/capability/pool, not hardcoded per-simulation content). Pools are
// intentionally larger than any single stage's itemCount so re-attempts draw
// a different subset (spec §37 — resist memorization).

// ---------------------------------------------------------------------------
// Software Developer — Technical Foundations
// ---------------------------------------------------------------------------
const foundations: Item[] = [
  {
    id: 'it_f1',
    kind: 'multiple_choice',
    capabilityId: CAP_FOUNDATIONS,
    transfer: false,
    tags: ['sde_foundations'],
    prompt: 'What is the time complexity of binary search on a sorted array of n elements?',
    options: [
      { id: 'a', text: 'O(n)' },
      { id: 'b', text: 'O(log n)' },
      { id: 'c', text: 'O(n log n)' },
      { id: 'd', text: 'O(1)' },
    ],
    correctOptionId: 'b',
    explanation: 'Binary search halves the search space each step, giving logarithmic time.',
  },
  {
    id: 'it_f2',
    kind: 'multiple_choice',
    capabilityId: CAP_FOUNDATIONS,
    transfer: false,
    tags: ['sde_foundations'],
    prompt: 'Which data structure gives average O(1) lookup by key?',
    options: [
      { id: 'a', text: 'Linked list' },
      { id: 'b', text: 'Array' },
      { id: 'c', text: 'Hash map' },
      { id: 'd', text: 'Binary search tree' },
    ],
    correctOptionId: 'c',
    explanation: 'A well-distributed hash map gives average constant-time lookup.',
  },
  {
    id: 'it_f3',
    kind: 'multiple_choice',
    capabilityId: CAP_FOUNDATIONS,
    transfer: false,
    tags: ['sde_foundations'],
    prompt: 'In a typical call stack, in which order are function calls resolved?',
    options: [
      { id: 'a', text: 'First-in, first-out (FIFO)' },
      { id: 'b', text: 'Last-in, first-out (LIFO)' },
      { id: 'c', text: 'Random order' },
      { id: 'd', text: 'Priority-based' },
    ],
    correctOptionId: 'b',
    explanation: 'Call stacks unwind in LIFO order — the most recent call returns first.',
  },
  {
    id: 'it_f4',
    kind: 'multiple_choice',
    capabilityId: CAP_FOUNDATIONS,
    transfer: false,
    tags: ['sde_foundations'],
    prompt: 'A client is authenticated but not permitted to access a resource. Which HTTP status best fits?',
    options: [
      { id: 'a', text: '401 Unauthorized' },
      { id: 'b', text: '403 Forbidden' },
      { id: 'c', text: '404 Not Found' },
      { id: 'd', text: '500 Internal Server Error' },
    ],
    correctOptionId: 'b',
    explanation: '401 means "who are you"; 403 means "I know who you are, and no." That matches this case.',
  },
  {
    id: 'it_f5',
    kind: 'multiple_choice',
    capabilityId: CAP_FOUNDATIONS,
    transfer: false,
    tags: ['sde_foundations'],
    prompt: 'In SQL, which clause filters rows after grouping has been applied?',
    options: [
      { id: 'a', text: 'WHERE' },
      { id: 'b', text: 'HAVING' },
      { id: 'c', text: 'GROUP BY' },
      { id: 'd', text: 'ORDER BY' },
    ],
    correctOptionId: 'b',
    explanation: 'WHERE filters rows before grouping; HAVING filters the grouped results.',
  },
  {
    id: 'it_f6',
    kind: 'multiple_choice',
    capabilityId: CAP_FOUNDATIONS,
    transfer: false,
    tags: ['sde_foundations'],
    prompt: 'What is the time complexity of a loop nested inside another loop, each running n times over the same input?',
    options: [
      { id: 'a', text: 'O(n)' },
      { id: 'b', text: 'O(n log n)' },
      { id: 'c', text: 'O(n^2)' },
      { id: 'd', text: 'O(2^n)' },
    ],
    correctOptionId: 'c',
    explanation: 'Two nested loops each of size n give n × n = n² operations.',
  },
];

// ---------------------------------------------------------------------------
// Software Developer — Applied Problem Solving
// ---------------------------------------------------------------------------
const applied: Item[] = [
  {
    id: 'it_a1',
    kind: 'multiple_choice',
    capabilityId: CAP_APPLIED,
    transfer: false,
    tags: ['sde_applied'],
    prompt: "A function should return the last 3 items of a list but sometimes returns 4. It slices with list[len(list)-4:]. What's the most likely fix?",
    options: [
      { id: 'a', text: 'Change -4 to -3' },
      { id: 'b', text: 'Change to list[-4:]' },
      { id: 'c', text: 'Add 1 to len(list)' },
      { id: 'd', text: 'Use list[0:3]' },
    ],
    correctOptionId: 'a',
    explanation: 'len(list) - 4 keeps 4 items from that index onward; it should be len(list) - 3 to keep exactly 3.',
  },
  {
    id: 'it_a2',
    kind: 'multiple_choice',
    capabilityId: CAP_APPLIED,
    transfer: false,
    tags: ['sde_applied'],
    prompt: 'You need to remove duplicate user IDs from a list of 2 million entries as fast as possible. Best approach?',
    options: [
      { id: 'a', text: 'Nested loop comparing every pair' },
      { id: 'b', text: 'Sort, then remove adjacent duplicates' },
      { id: 'c', text: 'Insert into a hash set while iterating once' },
      { id: 'd', text: 'Use recursion to filter' },
    ],
    correctOptionId: 'c',
    explanation: 'A single pass with a hash set is O(n) average time — faster than sorting (O(n log n)) or nested loops (O(n²)).',
  },
  {
    id: 'it_a3',
    kind: 'free_response',
    capabilityId: CAP_APPLIED,
    transfer: false,
    tags: ['sde_applied'],
    prompt: "Describe how you'd design a basic rate limiter for a public API endpoint that allows 100 requests per user per minute.",
    guidance: 'Outline your approach in 2-4 sentences: what you would track, where you would store counts, and what happens when a client exceeds the limit.',
    minWords: 15,
  },
  {
    id: 'it_a4',
    kind: 'multiple_choice',
    capabilityId: CAP_APPLIED,
    transfer: false,
    tags: ['sde_applied'],
    prompt: 'An API returns a huge list of results in one response, slowing clients down. What is the standard fix?',
    options: [
      { id: 'a', text: 'Return everything but compress it' },
      { id: 'b', text: 'Add pagination with a page size and cursor or offset' },
      { id: 'c', text: 'Cache the entire response forever' },
      { id: 'd', text: 'Switch the endpoint to POST' },
    ],
    correctOptionId: 'b',
    explanation: 'Pagination bounds the size of any single response, which is the standard fix for this class of problem.',
  },
  {
    id: 'it_a5',
    kind: 'multiple_choice',
    capabilityId: CAP_APPLIED,
    transfer: false,
    tags: ['sde_applied'],
    prompt: 'Two threads increment the same shared counter with no locking. Most likely outcome under load?',
    options: [
      { id: 'a', text: 'The counter is always correct because increments are atomic' },
      { id: 'b', text: 'The counter can end up lower than expected due to lost updates' },
      { id: 'c', text: 'The program always crashes' },
      { id: 'd', text: 'The counter increments twice as fast' },
    ],
    correctOptionId: 'b',
    explanation: 'Read-modify-write on a shared counter without synchronization is a classic race condition that loses updates.',
  },
];

// ---------------------------------------------------------------------------
// Software Developer — Timed Transfer (deliberately novel variants of the
// foundations/applied concepts above — spec §15 transfer testing)
// ---------------------------------------------------------------------------
const transfer: Item[] = [
  {
    id: 'it_t1',
    kind: 'multiple_choice',
    capabilityId: CAP_TRANSFER,
    transfer: true,
    tags: ['sde_transfer'],
    prompt: 'An array is sorted but rotated at an unknown pivot, e.g. [4,5,6,7,0,1,2]. Best approach to find a target value efficiently?',
    options: [
      { id: 'a', text: 'Linear scan, O(n)' },
      { id: 'b', text: 'Modified binary search that checks which half is sorted, O(log n)' },
      { id: 'c', text: 'Sort it again first, O(n log n)' },
      { id: 'd', text: 'Hash every element, O(n) space' },
    ],
    correctOptionId: 'b',
    explanation: 'One half of a rotated sorted array is always properly sorted, so binary search can still decide which half to recurse into.',
  },
  {
    id: 'it_t2',
    kind: 'multiple_choice',
    capabilityId: CAP_TRANSFER,
    transfer: true,
    tags: ['sde_transfer'],
    prompt: 'A cache is dominated by 3 frequently reused items, but occasionally a one-off scan reads thousands of items once. Which eviction policy avoids the scan wrecking the cache?',
    options: [
      { id: 'a', text: 'Strict least-recently-used (LRU)' },
      { id: 'b', text: 'First-in-first-out (FIFO)' },
      { id: 'c', text: 'LRU with a scan-resistant/frequency component' },
      { id: 'd', text: 'Random eviction' },
    ],
    correctOptionId: 'c',
    explanation: 'Strict LRU would let a single large scan evict all the genuinely hot items; a frequency-aware policy resists that.',
  },
  {
    id: 'it_t3',
    kind: 'multiple_choice',
    capabilityId: CAP_TRANSFER,
    transfer: true,
    tags: ['sde_transfer'],
    prompt: 'You must schedule the maximum number of non-overlapping meetings in a single room given a list of start/end times. Which strategy works?',
    options: [
      { id: 'a', text: 'Pick the shortest meetings first' },
      { id: 'b', text: 'Sort by end time and greedily pick the earliest-ending non-overlapping meeting' },
      { id: 'c', text: 'Sort by start time and pick every other one' },
      { id: 'd', text: 'Try every possible combination' },
    ],
    correctOptionId: 'b',
    explanation: 'This is interval scheduling — the classic greedy-by-end-time strategy provably maximizes the count.',
  },
  {
    id: 'it_t4',
    kind: 'multiple_choice',
    capabilityId: CAP_TRANSFER,
    transfer: true,
    tags: ['sde_transfer'],
    prompt: 'In the rate limiter you designed earlier, two near-simultaneous requests from the same user both read the count as 99 before either writes 100, letting both through. What class of bug is this?',
    options: [
      { id: 'a', text: 'A race condition from a non-atomic read-then-write' },
      { id: 'b', text: 'A memory leak' },
      { id: 'c', text: 'An off-by-one error in the limit itself' },
      { id: 'd', text: 'A DNS resolution issue' },
    ],
    correctOptionId: 'a',
    explanation: "It's the same class of bug as the shared-counter question, applied to the rate limiter you just designed — recognizing that transfer is the point of this stage.",
  },
  {
    id: 'it_t5',
    kind: 'multiple_choice',
    capabilityId: CAP_TRANSFER,
    transfer: true,
    tags: ['sde_transfer'],
    prompt: 'You must deduplicate a stream of IDs, but the full set no longer fits in memory. What changes from the in-memory hash-set approach?',
    options: [
      { id: 'a', text: 'Nothing — hash sets always work regardless of size' },
      { id: 'b', text: 'Use an external/on-disk structure, or a probabilistic structure like a Bloom filter, and accept approximate results' },
      { id: 'c', text: "Just increase the loop's step size" },
      { id: 'd', text: 'Switch the loop to recursion' },
    ],
    correctOptionId: 'b',
    explanation: 'Once the working set exceeds memory, the exact in-memory approach breaks down; external structures or approximate structures are the standard response.',
  },
];

// ---------------------------------------------------------------------------
// Software Developer — Decision Point (spec §16) and Wrap-Up communication
// (spec §33 recovery / free-response, evaluated qualitatively — not scored
// as correct/incorrect, only as reasonable/adequate/weak, per §16)
// ---------------------------------------------------------------------------
const decision: Item[] = [
  {
    id: 'it_d1',
    kind: 'decision',
    capabilityId: CAP_DECISION,
    transfer: false,
    tags: ['sde_decision'],
    prompt: 'You have 6 minutes remaining and one stage left, with several items unanswered. What do you do?',
    options: [
      { id: 'a', text: 'Work through remaining items strictly in order, even if you run out of time', quality: 'weak', rationale: 'Working strictly in order risks running out of time on items you could have answered quickly.' },
      { id: 'b', text: 'Quickly skim all remaining items, answer the ones you are confident about first, then use leftover time on the rest', quality: 'strong', rationale: 'Triaging by confidence maximizes correct answers you can bank within a hard limit.' },
      { id: 'c', text: 'Pick one remaining item and spend all the time trying to get it perfect', quality: 'weak', rationale: 'This risks leaving several other items completely unanswered for the sake of one.' },
    ],
  },
  {
    id: 'it_d2',
    kind: 'decision',
    capabilityId: CAP_DECISION,
    transfer: false,
    tags: ['sde_decision'],
    prompt: 'Midway through a technical stage, you realize you misunderstood an earlier question after already submitting it. What do you do?',
    options: [
      { id: 'a', text: 'Dwell on it and mentally replay what you should have said instead', quality: 'weak', rationale: 'Ruminating on a submitted, unchangeable answer costs time without changing the outcome.' },
      { id: 'b', text: 'Note the lesson briefly and refocus fully on the current question', quality: 'strong', rationale: 'Recovering quickly protects your performance on everything still ahead.' },
      { id: 'c', text: 'Rush through the remaining questions faster to make up for lost time', quality: 'adequate', rationale: 'Speeding up can help, but rushing indiscriminately trades accuracy for pace instead of refocusing.' },
    ],
  },
];

const wrapup: Item[] = [
  {
    id: 'it_w1',
    kind: 'free_response',
    capabilityId: CAP_COMMUNICATION,
    transfer: false,
    tags: ['sde_wrapup'],
    prompt: "In 2-3 sentences, summarize your approach to the Timed Transfer stage and what you'd do differently with more time.",
    guidance: 'Be specific about one thing that was hard and one thing you would change.',
    minWords: 10,
  },
  {
    id: 'it_w2',
    kind: 'free_response',
    capabilityId: CAP_COMMUNICATION,
    transfer: false,
    tags: ['sde_wrapup'],
    prompt: 'In 2-3 sentences, explain how you decided what to prioritize when time got tight.',
    guidance: 'Mention what you deliberately deprioritized and why.',
    minWords: 10,
  },
];

// ---------------------------------------------------------------------------
// Data Analyst — smaller pool, proving the architecture is target-aware
// rather than hardcoded to one simulation (spec §5). Reuses CAP_TRANSFER and
// CAP_DECISION so evidence for those capabilities carries across targets.
// ---------------------------------------------------------------------------
const dataFoundations: Item[] = [
  {
    id: 'it_df1',
    kind: 'multiple_choice',
    capabilityId: CAP_DATA_INTERPRETATION,
    transfer: false,
    tags: ['da_foundations'],
    prompt: 'A dataset of household incomes has a few extremely high outliers. Which measure of central tendency is least distorted by them?',
    options: [
      { id: 'a', text: 'Mean' },
      { id: 'b', text: 'Median' },
      { id: 'c', text: 'Sum' },
      { id: 'd', text: 'Range' },
    ],
    correctOptionId: 'b',
    explanation: 'The median is robust to outliers; the mean is pulled toward extreme values.',
  },
  {
    id: 'it_df2',
    kind: 'multiple_choice',
    capabilityId: CAP_DATA_INTERPRETATION,
    transfer: false,
    tags: ['da_foundations'],
    prompt: 'You need every order row along with its customer\'s name from two related tables, including orders with no matching customer. Which join?',
    options: [
      { id: 'a', text: 'INNER JOIN' },
      { id: 'b', text: 'LEFT JOIN from orders to customers' },
      { id: 'c', text: 'CROSS JOIN' },
      { id: 'd', text: 'A join is not needed' },
    ],
    correctOptionId: 'b',
    explanation: 'A LEFT JOIN keeps every row from orders even when there is no matching customer.',
  },
  {
    id: 'it_df3',
    kind: 'multiple_choice',
    capabilityId: CAP_DATA_INTERPRETATION,
    transfer: false,
    tags: ['da_foundations'],
    prompt: 'A/B test shows a 2% lift with a p-value of 0.41. What is the most defensible read of this result?',
    options: [
      { id: 'a', text: 'The change definitely works — ship it' },
      { id: 'b', text: 'The result is not statistically significant at conventional thresholds' },
      { id: 'c', text: 'A 2% lift is always significant regardless of p-value' },
      { id: 'd', text: 'p-value is irrelevant to A/B tests' },
    ],
    correctOptionId: 'b',
    explanation: 'A p-value of 0.41 is far above conventional significance thresholds (like 0.05) — the lift could easily be noise.',
  },
  {
    id: 'it_df4',
    kind: 'multiple_choice',
    capabilityId: CAP_DATA_INTERPRETATION,
    transfer: false,
    tags: ['da_foundations'],
    prompt: 'In a spreadsheet, which function correctly sums a column only where a condition in another column is met?',
    options: [
      { id: 'a', text: 'SUM()' },
      { id: 'b', text: 'SUMIF()' },
      { id: 'c', text: 'COUNT()' },
      { id: 'd', text: 'AVERAGE()' },
    ],
    correctOptionId: 'b',
    explanation: 'SUMIF() sums a range conditionally based on a criterion applied to another range.',
  },
];

const dataTransfer: Item[] = [
  {
    id: 'it_dt1',
    kind: 'multiple_choice',
    capabilityId: CAP_TRANSFER,
    transfer: true,
    tags: ['da_transfer'],
    prompt: 'Monthly active users rose 20% but revenue per user fell 15% in the same period, for a dataset you have not seen the raw rows of. What is the most defensible next step?',
    options: [
      { id: 'a', text: 'Report that growth is accelerating and stop there' },
      { id: 'b', text: 'Investigate whether the new users differ in composition (e.g. a cheaper tier or region) before concluding anything' },
      { id: 'c', text: 'Assume the revenue drop is a data error and discard it' },
      { id: 'd', text: 'Average the two percentages together' },
    ],
    correctOptionId: 'b',
    explanation: 'Aggregate metrics moving in opposite directions is a classic signal of a composition shift — the same "check what changed underneath the average" instinct as the outlier and A/B questions above, applied to a new scenario.',
  },
  {
    id: 'it_dt2',
    kind: 'multiple_choice',
    capabilityId: CAP_TRANSFER,
    transfer: true,
    tags: ['da_transfer'],
    prompt: 'Two regional stores are compared on average transaction value. Store A looks better on the yearly average but worse in every individual quarter. What is this pattern most likely to be?',
    options: [
      { id: 'a', text: 'A calculation error — this cannot happen' },
      { id: 'b', text: "Simpson's paradox — a shift in the mix of quarters (e.g. seasonality/weighting) is reversing the comparison" },
      { id: 'c', text: 'Store A is simply better and the quarterly data is noise' },
      { id: 'd', text: 'The stores must be in different currencies' },
    ],
    correctOptionId: 'b',
    explanation: "This is Simpson's paradox — a novel-looking instance of the same underlying-composition instinct tested earlier in a spreadsheet/A-B context.",
  },
  {
    id: 'it_dt3',
    kind: 'multiple_choice',
    capabilityId: CAP_TRANSFER,
    transfer: true,
    tags: ['da_transfer'],
    prompt: 'A dashboard filter for "active users" was silently redefined last quarter (stricter threshold). What is the risk of comparing this quarter to last quarter without adjusting for that?',
    options: [
      { id: 'a', text: 'None — active users is always the same definition' },
      { id: 'b', text: 'The comparison conflates a real trend with a definition change, and could show a fake drop or rise' },
      { id: 'c', text: 'The risk only matters for revenue metrics, not user counts' },
      { id: 'd', text: 'This can be ignored if the sample size is large' },
    ],
    correctOptionId: 'b',
    explanation: 'A silent definition change is a hidden confound — the same "check what changed underneath the number" reasoning as the earlier items, applied to metric definitions instead of averages.',
  },
];

const dataDecision: Item[] = [
  {
    id: 'it_dd1',
    kind: 'decision',
    capabilityId: CAP_DECISION,
    transfer: false,
    tags: ['da_decision'],
    prompt: 'A stakeholder asks for a number by end of day. Getting it fully right needs another hour of data cleaning you do not have. What do you do?',
    options: [
      { id: 'a', text: 'Deliver the number with no caveat so it looks decisive', quality: 'weak', rationale: 'An uncaveated wrong-ish number is worse than a caveated one — it can drive a bad decision downstream.' },
      { id: 'b', text: 'Deliver the best current estimate with a clear caveat about what is still unverified, and flag when the clean version will be ready', quality: 'strong', rationale: 'This respects the deadline while being honest about uncertainty — the core skill being tested.' },
      { id: 'c', text: 'Miss the deadline entirely to be certain the number is perfect', quality: 'adequate', rationale: 'Sometimes justified, but often overkill relative to a caveated estimate — and it ignores the stated deadline.' },
    ],
  },
];

export const ITEM_BANK: Item[] = [...foundations, ...applied, ...transfer, ...decision, ...wrapup, ...dataFoundations, ...dataTransfer, ...dataDecision];

const ITEM_INDEX: Record<string, Item> = Object.fromEntries(ITEM_BANK.map((i) => [i.id, i]));

export function getItemById(itemId: string): Item {
  const item = ITEM_INDEX[itemId];
  if (!item) throw new Error(`Unknown item id: ${itemId}`);
  return item;
}

export function itemsByTag(tag: string): Item[] {
  return ITEM_BANK.filter((i) => i.tags.includes(tag));
}

// Strips answer keys / quality labels before anything is sent to the client.
// This is the single choke point that guarantees scoring data never leaks
// (spec §55).
export function sanitizeItem(item: Item): SanitizedItem {
  const base = { id: item.id, kind: item.kind, capabilityId: item.capabilityId, transfer: item.transfer, prompt: item.prompt };
  if (item.kind === 'multiple_choice' || item.kind === 'decision') {
    return { ...base, options: item.options.map((o) => ({ id: o.id, text: o.text })) };
  }
  return { ...base, guidance: item.guidance, minWords: item.minWords };
}
