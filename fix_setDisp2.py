with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = """      setDisplayedAssistance({
        event_id: resp.event_id,
        instance
      });"""

replacement = """      setDisplayedAssistance({
        id: resp.event_id,
        instance,
        kind: mode === 'sample_answer' ? 'answer_guidance' : 'hint'
      });"""

content = content.replace(target, replacement)

with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
