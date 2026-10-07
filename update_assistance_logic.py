import re

with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace state variables
content = re.sub(
    r"const \[hintContent, setHintContent\] = useState<string \| null>\(null\);\s*"
    r"const \[hintLevel, setHintLevel\] = useState\(0\);\s*"
    r"const \[guidanceContent, setGuidanceContent\] = useState<string \| null>\(null\);\s*"
    r"const \[guidanceWhyItWorks, setGuidanceWhyItWorks\] = useState<string\[\]>\(\[\]\);",
    "const [activeAssistance, setActiveAssistance] = useState<{mode: 'hint' | 'guided_approach' | 'sample_answer', content: string, event_id: string, why_it_works?: string[]} | null>(null);",
    content
)

# In handleStartRecord, we have:
content = re.sub(
    r"setHintContent\(null\);\s*"
    r"setHintLevel\(0\);\s*"
    r"setGuidanceContent\(null\);\s*"
    r"setGuidanceWhyItWorks\(\[\]\);\s*",
    "setActiveAssistance(null);\n    ",
    content
)

# Replace requestAssistance function
request_assistance_regex = re.compile(
    r"async function requestAssistance\(kind: 'hint' \| 'answer_guidance'\) \{.*?\n  \}",
    re.DOTALL
)

new_request_assistance = """
  async function requestAssistance(mode: 'hint' | 'guided_approach' | 'sample_answer') {
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
      setDisplayedAssistance(newAssistance as any); // just for provenance tracking if needed
      setAssistanceLoading(false);
      assistanceBusyRef.current = null;
      void acknowledgeDisplayedAssistance({ event_id: resp.event_id, instance });
    } catch (err) {
      setAssistanceError('Assistant is temporarily unavailable. You can continue the interview or retry.');
      setAssistanceLoading(false);
      assistanceBusyRef.current = null;
    }
  }

  async function acknowledgeDisplayedAssistance(evt: { event_id: string, instance: string }) {
    const session = sessionDataRef.current;
    if (!session) return;
    try {
      const res = await api.markAssistanceViewed<{status: string, viewed_at: string, question_instance_id: string}>(session.session_id, session.access_token, evt.event_id);
      // provenance tracking is separate
      assistanceViewsRef.current?.markViewed(res.question_instance_id, evt.event_id);
      setAssistanceStatus(assistanceViewsRef.current!.provenance(evt.instance));
    } catch {
      // It's ok, user can retry
    }
  }
"""
content = request_assistance_regex.sub(new_request_assistance.strip(), content)

# Remove the old acknowledgeDisplayedAssistance
content = re.sub(
    r"async function acknowledgeDisplayedAssistance.*?catch \(err\) \{.*?\}\n  \}",
    "",
    content,
    flags=re.DOTALL
)

# And remove `async function requestHint` and `async function requestAnswerGuidance`
content = re.sub(
    r"async function requestHint\(\) \{ await requestAssistance\('hint'\); \}\n\s*async function requestAnswerGuidance\(\) \{ await requestAssistance\('answer_guidance'\); \}",
    "",
    content
)


with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated assistance methods")
