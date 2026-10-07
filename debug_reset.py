with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = """  useEffect(() => {
    setActiveAssistance(null);"""

replacement = """  useEffect(() => {
    console.log('RESET EFFECT RAN', currentQuestionInstanceId);
    setActiveAssistance(null);"""

content = content.replace(target, replacement)

with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
