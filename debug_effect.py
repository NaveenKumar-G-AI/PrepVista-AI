with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = """  useEffect(() => {
    if (!assistanceEnabled || !assistancePanelOpen || assistanceLoading || uiState !== 'USER_LISTENING'
        || !displayedAssistance || displayedAssistance.instance !== currentQuestionInstanceId) return;
    void acknowledgeDisplayedAssistance(displayedAssistance);
  }, [assistanceEnabled, assistancePanelOpen, assistanceLoading, uiState, displayedAssistance, currentQuestionInstanceId]);"""

replacement = """  useEffect(() => {
    console.log('EFFECT', {assistanceEnabled, assistancePanelOpen, assistanceLoading, uiState, displayedAssistance, currentQuestionInstanceId});
    if (!assistanceEnabled || !assistancePanelOpen || assistanceLoading || uiState !== 'USER_LISTENING'
        || !displayedAssistance || displayedAssistance.instance !== currentQuestionInstanceId) return;
    console.log('CALLING ACK');
    void acknowledgeDisplayedAssistance(displayedAssistance);
  }, [assistanceEnabled, assistancePanelOpen, assistanceLoading, uiState, displayedAssistance, currentQuestionInstanceId]);"""

content = content.replace(target, replacement)

with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
