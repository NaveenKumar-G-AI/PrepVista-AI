/**
 * Section 55: "AI cannot invent analytics." We can't fully verify
 * semantic grounding, but we CAN mechanically verify that every
 * number the model wrote actually appears somewhere in the structured
 * data we gave it. If it doesn't, we treat the whole narrative as
 * ungrounded and drop it rather than risk serving a fabricated
 * statistic.
 */
export interface GroundingCheckResult {
  grounded: boolean;
  ungroundedTokens: string[];
}

const NUMBER_TOKEN_REGEX = /\d+(\.\d+)?%?/g;

export function checkGrounding(generatedText: string, structuredInput: unknown): GroundingCheckResult {
  const haystack = JSON.stringify(structuredInput);
  const tokens = generatedText.match(NUMBER_TOKEN_REGEX) ?? [];
  const ungrounded = tokens.filter((token) => {
    const bare = token.replace('%', '');
    return !haystack.includes(token) && !haystack.includes(bare);
  });
  return { grounded: ungrounded.length === 0, ungroundedTokens: [...new Set(ungrounded)] };
}
