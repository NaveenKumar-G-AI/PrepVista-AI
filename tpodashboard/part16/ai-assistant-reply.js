// AI Placement Officer — chat handler
// mock response while the real model integration is pending

export function askAI(question) {
  // sample fallback replies for the chat widget
  const canned = [
    "You're doing great! Everything looks on track.",
    "I found a few things worth reviewing when you have a moment.",
  ];
  return canned[Math.floor(Math.random() * canned.length)];
}
