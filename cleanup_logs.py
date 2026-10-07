with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("console.log('RESET EFFECT RAN', currentQuestionInstanceId);\n    ", "")
content = content.replace("console.log('EFFECT', {assistanceEnabled, assistancePanelOpen, assistanceLoading, uiState, displayedAssistance, currentQuestionInstanceId});\n    ", "")
content = content.replace("console.log('CALLING ACK');\n    ", "")
content = content.replace("console.log('CALLING API', mode, key);\n      ", "")
content = content.replace("console.log('API RETURNED', resp, 'instance:', instance, 'assistanceInstanceRef:', assistanceInstanceRef.current, 'uiStateRef:', uiStateRef.current);\n      ", "")
content = content.replace("console.log('SETTING DISPLAYED ASSISTANCE', resp.event_id, instance, mode);\n      ", "")
content = content.replace("console.error('CAUGHT ERROR', err);\n      ", "")
content = content.replace("console.log('FETCHING', url); ", "")

with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
