with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = """      setDisplayedAssistance({
        content: resp.content,
        type: mode === 'sample_answer' ? 'answer_guidance' : 'hint',
        level: mode === 'guided_approach' ? 2 : 1,
        event_id: resp.event_id,
        instance
      });"""

replacement = """      setDisplayedAssistance({
        event_id: resp.event_id,
        instance
      });"""

content = content.replace(target, replacement)

with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
