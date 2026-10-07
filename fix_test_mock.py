with open('frontend/tests/assistance-provenance.test.mjs', 'r', encoding='utf-8') as f:
    content = f.read()

target = "/setHintContent\\(null\\)|acknowledgeDisplayedAssistance|uiStateRef.current =|sessionDataRef.current =/"
replacement = "/setActiveAssistance\\(null\\)|acknowledgeDisplayedAssistance|uiStateRef.current =|sessionDataRef.current =/"

content = content.replace(target, replacement)

with open('frontend/tests/assistance-provenance.test.mjs', 'w', encoding='utf-8') as f:
    f.write(content)
