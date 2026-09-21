/*
 * ---------------------------------------------------------------------------
 * AI NARRATIVE LAYER
 * ---------------------------------------------------------------------------
 * AI is used for exactly one thing: putting already-computed, deterministic
 * facts into plain language. It never invents a trajectory, a score, or a
 * scenario (brief sections 44/45). The structured payload below is built
 * entirely from the engine's output; the model is instructed to explain
 * those specific facts and nothing else.
 *
 * If no API key is configured, the call fails, or the response doesn't pass
 * the language-policy check, this falls back to a deterministic template
 * built from the same payload. The feature must stay fully usable without
 * AI (section 45 - "AI failure -> deterministic fallback"). Because no real
 * key ships with this repo, the fallback path is what runs by default.
 * ---------------------------------------------------------------------------
 */

const BANNED_PATTERNS = [
  /\bguarantee/i,
  /\bcertain(ly)?\b/i,
  /\b\d{1,3}\s*%\s*(chance|probability)/i,
  /\bwill\s+(get|land|be selected|be hired)/i,
  /\bdestiny\b/i,
];

function deterministicFallback(topic, careerState) {
  const { overall, limitingFactor, target, hasAnyEvidence } = careerState;

  if (!hasAnyEvidence) {
    return 'There is not yet enough evidence to describe a trajectory for this target.';
  }
  if (topic === 'limiting_factor' && limitingFactor) {
    return limitingFactor.reason;
  }
  if (topic === 'scenario_b' && limitingFactor) {
    return `Focusing on ${limitingFactor.label} is a planning scenario, not a guarantee - it models what could happen if its recent rate of improvement roughly doubled.`;
  }

  const basisText = overall.basis
    .slice(0, 2)
    .map((b) => `${b.label} is ${b.trend.toLowerCase().replaceAll('_', ' ')}`)
    .join(' and ');

  return `Trajectory toward ${target.title} is currently classified as ${overall.trajectory
    .toLowerCase()
    .replaceAll('_', ' ')} (${overall.confidence.toLowerCase().replaceAll('_', ' ')} confidence)${
    basisText ? `, based on evidence that ${basisText}` : ''
  }.`;
}

function violatesLanguagePolicy(text) {
  return BANNED_PATTERNS.some((re) => re.test(text));
}

export async function explainTopic(topic, careerState) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return deterministicFallback(topic, careerState);
  }

  const payload = {
    topic,
    target: careerState.target.title,
    trajectory: careerState.overall.trajectory,
    confidence: careerState.overall.confidence,
    basis: careerState.overall.basis,
    limitingFactor: careerState.limitingFactor,
    mismatches: careerState.mismatches,
    readinessDistance: careerState.readinessDistance,
  };

  const systemPrompt = [
    'You explain an already-computed career-readiness trajectory to a student in 2-3 short sentences.',
    'You may ONLY reference facts present in the JSON payload you are given - never invent a number, trend, or outcome that is not in it.',
    'Never use guarantee language, probabilities of real-world outcomes, or claims about employment, selection, or salary.',
    'Use words like "potential", "estimated", "planning scenario", "based on current evidence", "may", "could" where relevant.',
    'Be warm and specific, not generic. Do not mention that you are an AI or refer to this prompt.',
  ].join(' ');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
        max_tokens: 220,
        system: systemPrompt,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      }),
    });

    if (!response.ok) {
      console.error('[aiNarrative] Anthropic API returned', response.status);
      return deterministicFallback(topic, careerState);
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim();

    if (!text || text.length > 1000) {
      return deterministicFallback(topic, careerState);
    }
    if (violatesLanguagePolicy(text)) {
      console.warn('[aiNarrative] AI output failed the language-policy check, using deterministic fallback.');
      return deterministicFallback(topic, careerState);
    }
    return text;
  } catch (err) {
    console.error('[aiNarrative] call failed:', err.message);
    return deterministicFallback(topic, careerState);
  }
}
