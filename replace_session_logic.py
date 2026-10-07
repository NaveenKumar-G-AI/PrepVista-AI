import re

with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# I will replace the sessionStorage logic block
pattern = re.compile(
    r"const stored = sessionStorage\.getItem\('pv_interview_session'\);\s*"
    r"if \(!stored\) \{\s*"
    r"deferState\(\(\) => \{\s*"
    r"setPageError\('Interview session not found\. Please start a new interview\.'\);\s*"
    r"setUiState\('ERROR'\);\s*"
    r"setBooting\(false\);\s*"
    r"\}\);\s*"
    r"return;\s*"
    r"\}\s*"
    r"try \{\s*"
    r"const parsed = JSON\.parse\(stored\) as StoredSessionData;\s*"
    r"if \(parsed\.session_id !== sessionId\) \{\s*"
    r"deferState\(\(\) => \{\s*"
    r"setPageError\('Interview session mismatch\. Please start a new interview\.'\);\s*"
    r"setUiState\('ERROR'\);\s*"
    r"setBooting\(false\);\s*"
    r"\}\);\s*"
    r"return;\s*"
    r"\}\s*"
    r"deferState\(\(\) => \{\s*"
    r"setSessionData\(parsed\);\s*"
    r"setMaxTurns\(parsed\.max_turns \|\| 0\);\s*"
    r"globalSecondsRef\.current = 0;\s*"
    r"setClockLabel\('00:00'\);\s*"
    r"setTimerUrgent\(false\);\s*"
    r"setBooting\(false\);\s*"
    r"\}\);\s*"
    r"\} catch \{\s*"
    r"deferState\(\(\) => \{\s*"
    r"setPageError\('Interview session data is corrupted\. Please start again\.'\);\s*"
    r"setUiState\('ERROR'\);\s*"
    r"setBooting\(false\);\s*"
    r"\}\);\s*"
    r"\}", re.MULTILINE
)

replacement = """
    const fetchSession = async () => {
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
    
    void fetchSession();
"""

if "const fetchSession =" not in content:
    content = pattern.sub(replacement.strip(), content)
    with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Replaced sessionStorage logic")
else:
    print("Already replaced")
