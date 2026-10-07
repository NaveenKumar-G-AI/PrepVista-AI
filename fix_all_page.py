with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Session fetching
content = content.replace("""    const stored = sessionStorage.getItem('pv_interview_session');
    if (!stored) {
      deferState(() => {
        setPageError('Interview session not found. Please start a new interview.');
        setUiState('ERROR');
        setBooting(false);
      });
      return;
    }

    try {
      const parsed = JSON.parse(stored) as StoredSessionData;
      if (parsed.session_id !== sessionId) {
        deferState(() => {
          setPageError('Interview session mismatch. Please start a new interview.');
          setUiState('ERROR');
          setBooting(false);
        });
        return;
      }

      deferState(() => {
        setSessionData(parsed);
        setMaxTurns(parsed.max_turns || 0);
        globalSecondsRef.current = 0;
        setClockLabel('00:00');
        setTimerUrgent(false);
        setBooting(false);
      });
    } catch {
      deferState(() => {
        setPageError('Interview session data is corrupted. Please start again.');
        setUiState('ERROR');
        setBooting(false);
      });
    }""", """    const fetchSession = async () => {
      let parsed: StoredSessionData | null = null;
      const stored = sessionStorage.getItem('pv_interview_session');
      if (stored) {
        try {
          const s = JSON.parse(stored) as StoredSessionData;
          if (s.session_id === sessionId) {
            parsed = s;
          }
        } catch {}
      }
      
      if (!parsed) {
        try {
          parsed = await api.getInterviewSession<StoredSessionData>(sessionId);
          if (parsed) {
            sessionStorage.setItem('pv_interview_session', JSON.stringify(parsed));
          }
        } catch {
          // fallback to error
        }
      }

      if (!parsed) {
        deferState(() => {
          setPageError('Interview session not found. Please start a new interview.');
          setUiState('ERROR');
          setBooting(false);
        });
        return;
      }

      deferState(() => {
        setSessionData(parsed!);
        setMaxTurns(parsed!.max_turns || 0);
        globalSecondsRef.current = 0;
        setClockLabel('00:00');
        setTimerUrgent(false);
        setBooting(false);
      });
    };
    
    void fetchSession();""")

# 2. State
content = content.replace("""  // Guided assistance states
  const [assistancePanelOpen, setAssistancePanelOpen] = useState(false);
  const [hintContent, setHintContent] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [guidanceContent, setGuidanceContent] = useState<string | null>(null);
  const [guidanceWhyItWorks, setGuidanceWhyItWorks] = useState<string[]>([]);
  const [assistanceLoading, setAssistanceLoading] = useState(false);
  const [assistanceError, setAssistanceError] = useState('');""", """  // Guided assistance states
  const [assistancePanelOpen, setAssistancePanelOpen] = useState(false);
  const [activeAssistance, setActiveAssistance] = useState<{mode: 'hint' | 'guided_approach' | 'sample_answer', content: string, event_id: string, why_it_works?: string[]} | null>(null);
  const [assistanceLoading, setAssistanceLoading] = useState(false);
  const [assistanceError, setAssistanceError] = useState('');""")

# 3. handleStartRecord clear
content = content.replace("""    setHintContent(null);
    setHintLevel(0);
    setGuidanceContent(null);
    setGuidanceWhyItWorks([]);
    setAssistanceLoading(false);""", """    setActiveAssistance(null);
    setAssistanceLoading(false);""")

# 4. requestAssistance function
content = content.replace("""  async function requestAssistance(kind: 'hint' | 'answer_guidance') {
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
  async function requestAnswerGuidance() { await requestAssistance('answer_guidance'); }""", """  async function requestAssistance(mode: 'hint' | 'guided_approach' | 'sample_answer') {
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
  }""")

# 5. Buttons
content = content.replace("""                    {assistanceEnabled ? (
                      <>
                        <button
                          type="button"
                          className={styles.endButton}
                          style={{ opacity: assistanceLoading ? 0.6 : 1 }}
                          disabled={assistanceLoading || finalizing || !!pendingAnswerRef.current || !!pendingRetryRef.current || hintLevel >= 2}
                          onClick={requestHint}
                          aria-label="Show contextual hint for current interview question"
                        >
                          {assistanceLoading && !guidanceContent ? 'Preparing...' : hintLevel >= 2 ? 'Hints used' : '💡 Hint'}
                        </button>
                        <button
                          type="button"
                          className={styles.endButton}
                          style={{ opacity: assistanceLoading ? 0.6 : 1 }}
                          disabled={assistanceLoading || finalizing || !!pendingAnswerRef.current || !!pendingRetryRef.current || !!guidanceContent}
                          onClick={requestAnswerGuidance}
                          aria-label="Show professional answer guidance for current interview question"
                        >
                          {assistanceLoading && !hintContent ? 'Preparing...' : guidanceContent ? 'Guidance shown' : '📝 Show Answer'}
                        </button>
                      </>
                    ) : null}""", """                    {assistanceEnabled ? (
                      <>
                        <button
                          type="button"
                          className={styles.endButton}
                          style={{ opacity: assistanceLoading ? 0.6 : 1 }}
                          disabled={assistanceLoading || finalizing || !!pendingAnswerRef.current || !!pendingRetryRef.current || activeAssistance?.mode === 'hint'}
                          onClick={() => requestAssistance('hint')}
                          aria-label="Get Hint"
                        >
                          💡 Hint
                        </button>
                        <button
                          type="button"
                          className={styles.endButton}
                          style={{ opacity: assistanceLoading ? 0.6 : 1 }}
                          disabled={assistanceLoading || finalizing || !!pendingAnswerRef.current || !!pendingRetryRef.current || activeAssistance?.mode === 'guided_approach'}
                          onClick={() => requestAssistance('guided_approach')}
                          aria-label="Guided Approach"
                        >
                          🧭 Guided Approach
                        </button>
                        <button
                          type="button"
                          className={styles.endButton}
                          style={{ opacity: assistanceLoading ? 0.6 : 1 }}
                          disabled={assistanceLoading || finalizing || !!pendingAnswerRef.current || !!pendingRetryRef.current || activeAssistance?.mode === 'sample_answer'}
                          onClick={() => requestAssistance('sample_answer')}
                          aria-label="Sample Answer"
                        >
                          📝 Sample Answer
                        </button>
                      </>
                    ) : null}""")

import re
panel_regex = re.compile(r"\{\s*assistanceEnabled && assistancePanelOpen && uiState === 'USER_LISTENING'\s*\?\s*\(\s*<div\s*style=\{\{\s*margin: '12px 0'.*?\{/\* Hint content \*/\}.*?\n\s*\)\s*:\s*null\s*\}", re.DOTALL)

new_panel = """
              {assistanceEnabled && assistancePanelOpen && uiState === 'USER_LISTENING' ? (
                <div
                  style={{
                    margin: '12px 0',
                    padding: '16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(59,130,246,0.25)',
                    backgroundColor: 'rgba(59,130,246,0.05)',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(59,130,246,0.8)' }}>
                      INTERVIEW ASSISTANT
                    </span>
                    <span style={{ fontSize: '11px', color: 'rgba(100,116,139,0.8)' }}>
                      {provenanceLabel(assistanceStatus)}
                    </span>
                  </div>

                  {assistanceLoading ? (
                    <div style={{ textAlign: 'center', padding: '12px', color: 'rgba(100,116,139,0.8)' }}>
                      Preparing guidance...
                    </div>
                  ) : null}

                  {assistanceError ? (
                    <div role="alert" style={{ color: 'red', marginTop: '8px' }}>
                      {assistanceError}
                      {displayedAssistance ? <button type="button" onClick={() => void acknowledgeDisplayedAssistance(displayedAssistance)}>Retry view acknowledgement</button> : null}
                    </div>
                  ) : null}

                  {activeAssistance && !assistanceLoading ? (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px' }}>
                        {activeAssistance.mode === 'hint' && 'Hint:'}
                        {activeAssistance.mode === 'guided_approach' && 'Guided Approach:'}
                        {activeAssistance.mode === 'sample_answer' && 'Sample Answer:'}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{activeAssistance.content}</div>
                      
                      {activeAssistance.why_it_works && activeAssistance.why_it_works.length > 0 && (
                        <div style={{ marginTop: '16px', borderTop: '1px solid rgba(59,130,246,0.2)', paddingTop: '12px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', color: 'rgba(100,116,139,0.8)' }}>Why this works</span>
                          <ul style={{ marginTop: '8px', paddingLeft: '20px', marginBottom: 0 }}>
                            {activeAssistance.why_it_works.map((reason, i) => (
                              <li key={i} style={{ marginBottom: '4px' }}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
"""

content = panel_regex.sub(new_panel.strip(), content)

with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done exact replaces")
