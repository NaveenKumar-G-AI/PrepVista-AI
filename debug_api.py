with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = """    try {
      const key = `${mode}-${session.session_id}-${instance}`;
      let resp;
      if (mode === 'hint') {"""

replacement = """    try {
      const key = `${mode}-${session.session_id}-${instance}`;
      console.log('CALLING API', mode, key);
      let resp;
      if (mode === 'hint') {"""

content = content.replace(target, replacement)

with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
