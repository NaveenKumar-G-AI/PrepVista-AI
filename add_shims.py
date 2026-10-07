import re

with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

shims = """
  // Derived state for tests
  const hintContent = activeAssistance?.mode === 'hint' || activeAssistance?.mode === 'guided_approach' ? activeAssistance.content : null;
  const guidanceContent = activeAssistance?.mode === 'sample_answer' ? activeAssistance.content : null;

  async function requestHint() { await requestAssistance('hint'); }
  async function requestAnswerGuidance() { await requestAssistance('sample_answer'); }

  async function handleAskMeAgain() {"""

content = content.replace("  async function handleAskMeAgain() {", shims)

with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Shims added!")
