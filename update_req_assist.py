import re

with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = """  async function requestAssistance(kind: 'hint' | 'answer_guidance') {
    const session = sessionDataRef.current;
    const instance = currentQuestionInstanceId;
    if (!session || !assistanceEnabled || !instance || assistanceBusyRef.current === instance
        || isSubmittingRef.current || pendingRetryRef.current || uiStateRef.current !== 'USER_LISTENING') return;
    const level = kind === 'hint' ? hintLevel + 1 : 1;
    if (level > 2) return;
    assistanceBusyRef.current = instance;
    setAssistanceLoading(true);
    setAssistanceError('');
    setAssistancePanelOpen(true);
    try {
      const key = `${kind}-${session.session_id}-${instance}-${level}`;
      const resp = kind === 'hint'
        ? await api.requestHint<{content: string; event_id: string; level: number}>(session.session_id, session.access_token, key, lastQuestionRef.current || '', instance, level)
        : await api.requestAnswerGuidance<{content: string; event_id: string; why_it_works?: string[]}>(session.session_id, session.access_token, key, lastQuestionRef.current || '', instance);
      if (instance !== assistanceInstanceRef.current || uiStateRef.current !== 'USER_LISTENING') return;
      if (!resp.content?.trim() || !resp.event_id) throw new Error('Assistance unavailable.');
      if (kind === 'hint') {
        setHintContent(resp.content); setHintLevel(level); setGuidanceContent(null);
      } else {
        setGuidanceContent(resp.content); setGuidanceWhyItWorks('why_it_works' in resp ? resp.why_it_works || [] : []); setHintContent(null);
      }
      setAssistanceLoading(false);
      assistanceBusyRef.current = null;
      setDisplayedAssistance({
        content: resp.content,
        type: kind,
        level,
        event_id: resp.event_id,
        instance
      });
    } catch (err) {
      setAssistanceError('Assistant is temporarily unavailable. You can continue the interview or retry.');
      setAssistanceLoading(false);
      assistanceBusyRef.current = null;
    }
  }

  async function requestHint() { await requestAssistance('hint'); }
  async function requestAnswerGuidance() { await requestAssistance('answer_guidance'); }"""

replacement = """  async function requestAssistance(mode: 'hint' | 'guided_approach' | 'sample_answer') {
    const session = sessionDataRef.current;
    const instance = currentQuestionInstanceId;
    if (!session || !assistanceEnabled || !instance || assistanceBusyRef.current === instance
        || isSubmittingRef.current || pendingRetryRef.current || uiStateRef.current !== 'USER_LISTENING') return;
    
    assistanceBusyRef.current = instance;
    setAssistanceLoading(true);
    setAssistanceError('');
    setAssistancePanelOpen(true);
    
    try {
      const key = `${mode}-${session.session_id}-${instance}`;
      let resp;
      if (mode === 'hint') {
        resp = await api.requestHint<{content: string; event_id: string; level: number}>(session.session_id, session.access_token, key, lastQuestionRef.current || '', instance, 1);
      } else if (mode === 'guided_approach') {
        resp = await api.requestHint<{content: string; event_id: string; level: number}>(session.session_id, session.access_token, key, lastQuestionRef.current || '', instance, 2);
      } else {
        resp = await api.requestAnswerGuidance<{content: string; event_id: string; why_it_works?: string[]}>(session.session_id, session.access_token, key, lastQuestionRef.current || '', instance);
      }
      
      if (instance !== assistanceInstanceRef.current || uiStateRef.current !== 'USER_LISTENING') return;
      if (!resp.content?.trim() || !resp.event_id) throw new Error('Assistance unavailable.');
      
      const newAssistance = {
        mode,
        content: resp.content,
        event_id: resp.event_id,
        why_it_works: 'why_it_works' in resp ? resp.why_it_works : undefined
      };
      
      setActiveAssistance(newAssistance);
      setAssistanceLoading(false);
      assistanceBusyRef.current = null;
      
      setDisplayedAssistance({
        content: resp.content,
        type: mode === 'sample_answer' ? 'answer_guidance' : 'hint',
        level: mode === 'guided_approach' ? 2 : 1,
        event_id: resp.event_id,
        instance
      });
    } catch (err) {
      setAssistanceError('Assistant is temporarily unavailable. You can continue the interview or retry.');
      setAssistanceLoading(false);
      assistanceBusyRef.current = null;
    }
  }"""

content = content.replace(target, replacement)
with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated requestAssistance")
