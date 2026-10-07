with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = """      console.log('API RETURNED', resp);
      if (instance !== assistanceInstanceRef.current || uiStateRef.current !== 'USER_LISTENING') return;"""

replacement = """      console.log('API RETURNED', resp, 'instance:', instance, 'assistanceInstanceRef:', assistanceInstanceRef.current, 'uiStateRef:', uiStateRef.current);
      if (instance !== assistanceInstanceRef.current || uiStateRef.current !== 'USER_LISTENING') return;"""

content = content.replace(target, replacement)

with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
