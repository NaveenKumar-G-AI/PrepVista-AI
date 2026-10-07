import re

with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Reset guidance inside handleStartRecord (lines 626+)
content = re.sub(
    r"setHintContent\(null\);\s*setHintLevel\(0\);\s*setGuidanceContent\(null\);\s*setGuidanceWhyItWorks\(\[\]\);",
    "setActiveAssistance(null);",
    content
)

# 2. requestAssistance method
request_assistance_regex = re.compile(
    r"async function requestAssistance\(kind: 'hint' \| 'answer_guidance'\) \{.*?setAssistanceBusyRef.*?\}\n  \}",
    re.DOTALL
)
# Wait, let's just do a greedy match until the two lines of `requestHint` and `requestAnswerGuidance`
request_assistance_regex = re.compile(
    r"async function requestAssistance\(kind: 'hint' \| 'answer_guidance'\) \{.*?\n  \}\n\n  async function requestHint\(\) \{ await requestAssistance\('hint'\); \}\n  async function requestAnswerGuidance\(\) \{ await requestAssistance\('answer_guidance'\); \}",
    re.DOTALL
)

new_request_assistance = """  async function requestAssistance(mode: 'hint' | 'guided_approach' | 'sample_answer') {
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

content = request_assistance_regex.sub(new_request_assistance, content)

# 3. Handle old UI panel inside `transcriptPanelRef`? No, wait. 
# Did my safe_apply_all.py fail to remove the old Hint content?
# Let's check if the old Hint content is still there!
# It looks like it is still there!
old_hint_content_regex = re.compile(
    r"\{/\* Hint content \*/\}.*?\{/\* Answer guidance content \*/\}.*?\{/\* Collapse button \*/\}",
    re.DOTALL
)

if old_hint_content_regex.search(content):
    # This means the old panel inner content wasn't deleted!
    content = old_hint_content_regex.sub("{/* Removed old panel body */}", content)

with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Regex replaces done!")
