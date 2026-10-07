import re

with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace the session retrieval logic
session_logic_target = """    const stored = sessionStorage.getItem('pv_interview_session');
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
    }"""

session_logic_replacement = """    const fetchSession = async () => {
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
    
    void fetchSession();"""

content = content.replace(session_logic_target, session_logic_replacement)


# 2. Replace the UI state for assistance
state_target = """  // Pending coaching hint from backend quality pre-validator; consumed in startListeningLoop
  const pendingQualityHintRef = useRef<string | null>(null);

  // Audio state
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioWorkletRef = useRef<AudioWorkletNode | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [hardwareActive, setHardwareActive] = useState(false);

  // Guided assistance states
  const [assistancePanelOpen, setAssistancePanelOpen] = useState(false);
  const [hintContent, setHintContent] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [guidanceContent, setGuidanceContent] = useState<string | null>(null);
  const [guidanceWhyItWorks, setGuidanceWhyItWorks] = useState<string[]>([]);
  const [assistanceLoading, setAssistanceLoading] = useState(false);
  const [assistanceError, setAssistanceError] = useState('');"""

state_replacement = """  // Pending coaching hint from backend quality pre-validator; consumed in startListeningLoop
  const pendingQualityHintRef = useRef<string | null>(null);

  // Audio state
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioWorkletRef = useRef<AudioWorkletNode | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [hardwareActive, setHardwareActive] = useState(false);

  // Guided assistance states
  const [assistancePanelOpen, setAssistancePanelOpen] = useState(false);
  const [activeAssistance, setActiveAssistance] = useState<{mode: 'hint' | 'guided_approach' | 'sample_answer', content: string, event_id: string, why_it_works?: string[]} | null>(null);
  const [assistanceLoading, setAssistanceLoading] = useState(false);
  const [assistanceError, setAssistanceError] = useState('');"""

content = content.replace(state_target, state_replacement)


# 3. Replace handleStartRecord clear
clear_target = """    setHintContent(null);
    setHintLevel(0);
    setGuidanceContent(null);
    setGuidanceWhyItWorks([]);
    setAssistanceLoading(false);"""

clear_replacement = """    setActiveAssistance(null);
    setAssistanceLoading(false);"""

content = content.replace(clear_target, clear_replacement)

with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated basic logic")
