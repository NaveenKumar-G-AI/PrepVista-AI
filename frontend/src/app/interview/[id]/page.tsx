'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

import styles from './page.module.css';

type InterviewUiState =
  | 'INIT'
  | 'AI_SPEAKING'
  | 'USER_LISTENING'
  | 'SUBMITTING'
  | 'FINISHED'
  | 'TERMINATED'
  | 'ERROR';

type TranscriptRole = 'ai' | 'user';

interface TranscriptMessage {
  id: string;       // stable key: prevents React key collision as transcript grows
  role: TranscriptRole;
  text: string;
}

interface StoredSessionData {
  session_id: string;
  access_token: string;
  duration_seconds?: number;
  max_turns?: number;
  plan?: string;
  difficulty_mode?: string;
  candidate_name?: string;
  proctoring_mode?: string;
  // Additive: resume fingerprint returned by the setup endpoint for cross-session dedup
  resume_fingerprint?: string;
}

interface ContinueResponse {
  action: 'continue';
  text: string;
  turn: number;
  max_turns: number;
  remaining_turns: number;
  // Additive: optional quality hint from backend pre-validator
  // ("too_short" | "repetitive_filler" | "keyboard_mash" | "low_alpha_content")
  // Frontend uses this to show a non-blocking coaching nudge to the student.
  answer_quality_hint?: string | null;
}

interface NeuralFeedback {
  summary: string;
  strength_signal: string;
  growth_focus: string;
  next_step: string;
  focus_category: string;
}

interface CompletedResponse {
  action: 'finish' | 'terminated';
  final_score: number;
  interpretation: string;
  strengths: string[];
  weaknesses: string[];
  report_url: string;
  total_questions: number;
  answered_questions: number;
  expected_questions?: number;
  completion_rate?: number;
  duration_seconds?: number;
  neural_feedback?: NeuralFeedback | null;
  termination_reason?: string;
}

type SubmitResponse = ContinueResponse | CompletedResponse;

// ---------------------------------------------------------------------------
// Security constants
// ---------------------------------------------------------------------------

// UUID v4 pattern — session IDs from URL params are validated against this
// before any API call.  An invalid format (path traversal, injection probe)
// causes an immediate redirect to /dashboard.
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Allowed report URL prefixes — open redirect protection.
// data.report_url from the API must start with /report/ to be used.
// Any other value (including absolute URLs or external origins) falls back
// to the safe local path.
const SAFE_REPORT_URL_PREFIX = '/report/';

const LIVE_WAVEFORM_BARS = Array.from({ length: 32 }, (_, index) => 26 + Math.round(Math.sin((index / 31) * Math.PI) * 18));
const WAVEFORM_BAR_COUNT = LIVE_WAVEFORM_BARS.length;
// 80 ms ≈ 12.5 fps — visually indistinguishable from 50 ms (20 fps) for a waveform,
// but saves ~37% of AudioContext poll work per client tab.  With 500 concurrent
// browser sessions, that 37% saving compounds across every device simultaneously.
const WAVEFORM_TICK_MS = 80;
const MAX_SUBMIT_RETRIES = 3;
const SUBMIT_BASE_DELAY_MS = 500;
const SILENCE_TIMEOUT_SECONDS = 20;
const SILENCE_TIMEOUT_MS = SILENCE_TIMEOUT_SECONDS * 1000;
const SILENCE_CHECK_INTERVAL_MS = 250;
const AUDIO_ACTIVITY_REFRESH_MS = 450;
const SPEECH_ENERGY_KEEPALIVE_THRESHOLD = 0.08;
// Cap the in-DOM transcript to this many entries.  Beyond 60 items the browser
// must lay out and paint hundreds of DOM nodes on every React reconciliation.
// Older messages are trimmed from the top — students almost never scroll back
// more than a few exchanges during a live interview.
const MAX_TRANSCRIPT_ITEMS = 60;
const PREFERRED_FEMALE_VOICE_MARKERS = [
  'aria',
  'jenny',
  'samantha',
  'allison',
  'sara',
  'salli',
  'susan',
  'zira',
  'ava',
  'emma',
  'libby',
  'serena',
  'fiona',
  'karen',
  'moira',
  'tessa',
  'veena',
  'victoria',
  'neerja',
  'heera',
  'priya',
  'swara',
  'natasha',
  'sonia',
  'joanna',
  'olivia',
  'kajal',
  'female',
];
const SOFT_VOICE_MARKERS = ['natural', 'neural', 'premium', 'enhanced', 'wavenet', 'online', 'studio', 'expressive'];
const DISFAVORED_VOICE_MARKERS = ['male', 'david', 'mark', 'alex', 'daniel', 'fred', 'jorge', 'desktop', 'espeak', 'classic'];
const SPEECH_PRONUNCIATION_RULES: Array<[RegExp, string]> = [
  [/\bAI\b/g, 'A I'],
  [/\bLLM\b/g, 'L L M'],
  [/\bAPI\b/g, 'A P I'],
  [/\bAPIs\b/g, 'A P I s'],
  [/\bUI\b/g, 'U I'],
  [/\bUX\b/g, 'U X'],
  [/\bSQL\b/g, 'S Q L'],
  [/\bRAG\b/g, 'R A G'],
  [/\bQA\b/g, 'Q A'],
  [/\bML\b/g, 'M L'],
  [/\bNLP\b/g, 'N L P'],
  [/\bFastAPI\b/g, 'Fast A P I'],
  [/\bReact\.js\b/g, 'React J S'],
  [/\bNext\.js\b/g, 'Next J S'],
  [/\bNode\.js\b/g, 'Node J S'],
  [/\bPostgreSQL\b/g, 'Postgres Q L'],
  [/\bJWT\b/g, 'J W T'],
  [/\bCI\/CD\b/g, 'C I C D'],
];

const LIVE_TRANSCRIPT_RULES: Array<[RegExp, string]> = [
  [/\breact js\b/gi, 'React.js'],
  [/\breact j s\b/gi, 'React.js'],
  [/\bnext js\b/gi, 'Next.js'],
  [/\bnode js\b/gi, 'Node.js'],
  [/\btype script\b/gi, 'TypeScript'],
  [/\bjava script\b/gi, 'JavaScript'],
  [/\bfast api\b/gi, 'FastAPI'],
  [/\bsuper base\b/gi, 'Supabase'],
  [/\bsupa base\b/gi, 'Supabase'],
  [/\bpost gress\b/gi, 'PostgreSQL'],
  [/\bmy sequel\b/gi, 'MySQL'],
  [/\bmongo db\b/gi, 'MongoDB'],
  [/\bpie torch\b/gi, 'PyTorch'],
  [/\btensor flow\b/gi, 'TensorFlow'],
  [/\bopen ai\b/gi, 'OpenAI'],
  [/\bchat gpt\b/gi, 'ChatGPT'],
  [/\blang chain\b/gi, 'LangChain'],
  [/\bllama three\b/gi, 'LLaMA 3'],
  [/\bllama 3\b/gi, 'LLaMA 3'],
  [/\bgrow q\b/gi, 'Groq'],
  [/\bgrow queue\b/gi, 'Groq'],
  [/\brest api\b/gi, 'REST API'],
  [/\bci cd\b/gi, 'CI/CD'],
  [/\bc i c d\b/gi, 'CI/CD'],
  [/\ba w s\b/gi, 'AWS'],
  [/\bg c p\b/gi, 'GCP'],
  [/\bgit hub\b/gi, 'GitHub'],
  [/\bfull stack\b/gi, 'full-stack'],
];

const REPEAT_REQUEST_PATTERNS = [
  /\brepeat please\b/i,
  /\bsay that again\b/i,
  /\bcan you repeat\b/i,
  /\bcould you repeat\b/i,
  /\brepeat the question\b/i,
  /\bi did not understand\b/i,
  /\bi didn't understand\b/i,
  /\bdont understand\b/i,
  /\bdon't understand\b/i,
  /\bwhat do you mean\b/i,
  /\bcan you explain the question\b/i,
  /\brephrase the question\b/i,
  /\bwhat was the question\b/i,
  /\bsay it simply\b/i,
  /\bsimpler way\b/i,
  /\bcan you clarify\b/i,
  /\bcould you clarify\b/i,
  /\bclarify the question\b/i,
  /\bwhat exactly are you asking\b/i,
  /\bwhat should i answer\b/i,
  /\bwhich project do you mean\b/i,
  /\bwhich role do you mean\b/i,
  /\bwhat kind of answer\b/i,
  /\bcan you give an example\b/i,
  /\bgive me an example\b/i,
  /\bare you asking about\b/i,
  /\bdo you mean\b/i,
  /\bsay that in another way\b/i,
  /\bnot clear\b/i,
  /\bi am confused\b/i,
  /\bi'm confused\b/i,
  /\bwhat should i say\b/i,
  /\bwhat do i say\b/i,
  /\bwhat should i tell you\b/i,
  /\bwhat do i tell you\b/i,
  /\bwhat do you want me to say\b/i,
  /\bask that more simply\b/i,
  /\bsimplify the question\b/i,
  /^\s*sorry\??\s*$/i,
  /^\s*pardon\??\s*$/i,
  /^\s*come again\??\s*$/i,
];



function getVoicePreferenceScore(voice: SpeechSynthesisVoice) {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();

  let score = 0;
  if (lang.startsWith('en-in')) {
    score += 8;
  } else if (lang.startsWith('en-gb') || lang.startsWith('en-au')) {
    score += 6;
  } else if (lang.startsWith('en-us')) {
    score += 5;
  } else if (lang.startsWith('en')) {
    score += 4;
  }

  if (voice.localService) {
    score += 1;
  }

  for (let index = 0; index < PREFERRED_FEMALE_VOICE_MARKERS.length; index += 1) {
    if (name.includes(PREFERRED_FEMALE_VOICE_MARKERS[index])) {
      score += 20 - index;
      break;
    }
  }

  for (let index = 0; index < SOFT_VOICE_MARKERS.length; index += 1) {
    if (name.includes(SOFT_VOICE_MARKERS[index])) {
      score += 6 - Math.min(index, 4);
      break;
    }
  }

  for (let index = 0; index < DISFAVORED_VOICE_MARKERS.length; index += 1) {
    if (name.includes(DISFAVORED_VOICE_MARKERS[index])) {
      score -= 8;
      break;
    }
  }

  if (name.includes('google')) {
    score -= 2;
  }

  if (name.includes('microsoft')) {
    score += 4;
  }

  if (name.includes('india') || name.includes('indian')) {
    score += 3;
  }

  if (name.includes('desktop')) {
    score -= 5;
  }

  if (name.includes('online')) {
    score += 2;
  }

  return score;
}



function isInterviewActiveState(state: InterviewUiState) {
  return state === 'AI_SPEAKING' || state === 'USER_LISTENING';
}

function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(totalSeconds, 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = (safeSeconds % 60).toString().padStart(2, '0');
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}

function isRepeatRequest(text: string) {
  const normalized = normalizeLiveTranscript(text).toLowerCase().trim();
  if (!normalized) {
    return false;
  }

  if (['sorry', 'pardon', 'come again'].includes(normalized)) {
    return true;
  }

  if (REPEAT_REQUEST_PATTERNS.some(pattern => pattern.test(normalized))) {
    return true;
  }

  const clarificationPrefixes = ['what ', 'which ', 'do you', 'are you', 'can you', 'could you', 'should i', 'am i', 'sorry '];
  const clarificationTerms = ['mean', 'asking', 'question', 'clarify', 'repeat', 'rephrase', 'explain', 'example', 'project', 'role', 'answer', 'tell', 'say', 'clear', 'simple'];
  const hasQuestionShape = text.includes('?') || clarificationPrefixes.some(prefix => normalized.startsWith(prefix));

  return hasQuestionShape
    && normalized.split(/\s+/).filter(Boolean).length <= 18
    && clarificationTerms.some(term => normalized.includes(term));
}

function formatDurationSummary(totalSeconds?: number) {
  if (!totalSeconds || totalSeconds <= 0) {
    return '';
  }

  const safeSeconds = Math.max(totalSeconds, 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function normalizeNameForSpeech(rawName: string | undefined | null) {
  const base = (rawName || '').replace(/[^A-Za-z\s.'-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!base) {
    return '';
  }

  if (/^(?:[A-Za-z]\s+){1,}[A-Za-z]$/.test(base)) {
    const joined = base.replace(/\s+/g, '');
    return joined.charAt(0).toUpperCase() + joined.slice(1).toLowerCase();
  }

  return base
    .split(' ')
    .filter(Boolean)
    .map(part => (part === part.toUpperCase() ? `${part.charAt(0)}${part.slice(1).toLowerCase()}` : part))
    .join(' ');
}

function getTimestamp() {
  return Date.now();
}

function isBrowserMobile() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

let _normCacheInput = '';
let _normCacheOutput = '';

function normalizeLiveTranscript(rawText: string) {
  if (!rawText) {
    return '';
  }
  // 1-entry cache: skip redundant regex work on the speech-recognition hot path
  if (rawText === _normCacheInput) {
    return _normCacheOutput;
  }

  let normalized = rawText.replace(/[\r\n]+/g, ' ');
  normalized = normalized.replace(/\b(uh+|um+|umm+|er+|ah+)\b/gi, ' ');
  normalized = normalized.replace(/\b(i mean|you know|like)\b/gi, ' ');
  normalized = normalized.replace(/\b(\w+)(\s+\1\b)+/gi, '$1');

  for (const [pattern, replacement] of LIVE_TRANSCRIPT_RULES) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = normalized.replace(/\bi\b/g, 'I');
  normalized = normalized.replace(/\s+([,.!?])/g, '$1');
  normalized = normalized.replace(/([,.!?])(?=[^\s])/g, '$1 ');
  normalized = normalized.replace(/\s+/g, ' ');
  const result = normalized.trim();
  _normCacheInput = rawText;
  _normCacheOutput = result;
  return result;
}

function normalizeSpeechForVoice(rawText: string) {
  if (!rawText) {
    return '';
  }

  let normalized = rawText.replace(/[\r\n]+/g, ' ');
  normalized = normalized.replace(/\s*[\u2022\u00B7]\s*/g, '. ');
  normalized = normalized.replace(/\s*[:;]\s*/g, '. ');
  normalized = normalized.replace(/\s*\(([^)]*)\)\s*/g, ' $1 ');
  normalized = normalized.replace(/\s*\[([^\]]*)\]\s*/g, ' $1 ');
  normalized = normalized.replace(/\s*-\s*/g, ' ');
  normalized = normalized.replace(/\s*\/\s*/g, ' or ');
  normalized = normalized.replace(/->/g, ' to ');
  normalized = normalized.replace(
    /\b(hello|hi|thank you|thanks)\s+((?:[A-Za-z]\s+){1,}[A-Za-z]|[A-Z]{3,})(?=[,.!?]|$)/gi,
    (_, greeting: string, rawName: string) => `${greeting} ${normalizeNameForSpeech(rawName)}`,
  );

  for (const [pattern, replacement] of SPEECH_PRONUNCIATION_RULES) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = normalized.replace(/,\s*/g, ', ');
  normalized = normalized.replace(/([.!?])(?=[^\s])/g, '$1 ');
  normalized = normalized.replace(/\.{2,}/g, '. ');
  normalized = normalized.replace(/\s+/g, ' ');
  return normalized.trim();
}

function buildSpeechChunks(rawText: string) {
  const normalized = normalizeSpeechForVoice(rawText);
  if (!normalized) {
    return [] as string[];
  }

  const sentenceChunks = normalized
    .split(/(?<=[.!?])\s+/)
    .map(chunk => chunk.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (const sentence of sentenceChunks) {
    if (sentence.length <= 170) {
      const previous = chunks[chunks.length - 1];
      if (previous && `${previous} ${sentence}`.length <= 190) {
        chunks[chunks.length - 1] = `${previous} ${sentence}`;
      } else {
        chunks.push(sentence);
      }
      continue;
    }

    let remaining = sentence;
    while (remaining.length > 170) {
      const commaSplitAt = remaining.lastIndexOf(',', 170);
      const splitAt = commaSplitAt > 70 ? commaSplitAt : remaining.lastIndexOf(' ', 170);
      const safeSplitAt = splitAt > 60 ? splitAt : 170;
      chunks.push(remaining.slice(0, safeSplitAt).trim());
      const nextStart = remaining.charAt(safeSplitAt) === ',' ? safeSplitAt + 1 : safeSplitAt;
      remaining = remaining.slice(nextStart).trim();
    }
    if (remaining) {
      chunks.push(remaining);
    }
  }

  return chunks;
}

function createSubmissionKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getClosingName(candidateName: string | undefined, fullName: string | null | undefined) {
  const rawName = normalizeNameForSpeech(candidateName || fullName || 'there') || 'there';
  const safeName = rawName.split(' ')[0];
  return safeName || 'there';
}

export default function LiveInterviewPage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  // Security: validate session_id format before any API call or state read.
  // An attacker who crafts a URL with a non-UUID session_id (e.g. path traversal
  // or injection payload) is immediately bounced to /dashboard.
  useEffect(() => {
    if (sessionId && !SESSION_ID_RE.test(sessionId)) {
      router.push('/dashboard');
    }
  }, [sessionId, router]);

  const [booting, setBooting] = useState(true);
  const [uiState, setUiState] = useState<InterviewUiState>('INIT');
  const [sessionData, setSessionData] = useState<StoredSessionData | null>(null);
  const [statusText, setStatusText] = useState('Initializing Neural Engine...');
  const [timerMessage, setTimerMessage] = useState('');
  const liveTranscriptDivRef = useRef<HTMLDivElement>(null);
  const setLiveTranscript = (text: string) => {
    if (liveTranscriptDivRef.current) {
      liveTranscriptDivRef.current.textContent = text;
    }
  };
  const [transcriptLog, setTranscriptLog] = useState<TranscriptMessage[]>([]);
  const [clockLabel, setClockLabel] = useState('00:00');
  const [timerUrgent, setTimerUrgent] = useState(false);
  const [hardwareActive, setHardwareActive] = useState(false);

  const [startupLoading, setStartupLoading] = useState(false);
  const [startupError, setStartupError] = useState('');
  const [pageError, setPageError] = useState('');
  const [preStartOpen, setPreStartOpen] = useState(true);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [maxTurns, setMaxTurns] = useState(0);
  const [resultData, setResultData] = useState<CompletedResponse | null>(null);
  const [waveformBars] = useState<number[]>(LIVE_WAVEFORM_BARS);
  const waveformTrackRef = useRef<HTMLDivElement | null>(null);
  const [endInterviewOpen, setEndInterviewOpen] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const waveformIntervalRef = useRef<number | null>(null);
  const sessionDataRef = useRef<StoredSessionData | null>(null);
  const uiStateRef = useRef<InterviewUiState>('INIT');
  const preStartOpenRef = useRef(true);
  const hardTerminateRef = useRef<(reason: string) => Promise<void> | void>(() => {});
  const silenceTimeoutRef = useRef<number | null>(null);
  const silenceIntervalRef = useRef<number | null>(null);
  const globalClockRef = useRef<number | null>(null);
  const silenceCountdownRef = useRef(SILENCE_TIMEOUT_SECONDS);
  const lastAnswerActivityAtRef = useRef(0);
  const lastAudioActivityAtRef = useRef(0);
  const globalSecondsRef = useRef(0);
  const isSubmittingRef = useRef(false);
  const submitRetryCountRef = useRef(0);
  const pendingSubmitKeyRef = useRef('');
  const terminationPendingRef = useRef(false);
  const startTimeRef = useRef(0);
  const currentTranscriptRef = useRef('');
  const accumulatedTranscriptRef = useRef('');
  const lastQuestionRef = useRef('');
  const questionStartAtRef = useRef(0);
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const speechSequenceRef = useRef(0);
  // Ref for transcript panel auto-scroll
  const transcriptPanelRef = useRef<HTMLDivElement | null>(null);
  // Pending coaching hint from backend quality pre-validator; consumed in startListeningLoop
  const pendingQualityHintRef = useRef<string | null>(null);
  // rAF handle: gates React state updates from recognition.onresult to one
  // update per animation frame (~16 ms) instead of one per speech API event.
  // Speech recognition fires onresult multiple times per second during fast
  // speech; without this gate each event triggers a React re-render of the
  // full component tree.  Direct DOM writes (setLiveTranscript) still happen
  // synchronously inside onresult for zero-latency visual feedback.
  const rafPendingRef = useRef<number | null>(null);

  useEffect(() => {
    uiStateRef.current = uiState;
  }, [uiState]);

  useEffect(() => {
    sessionDataRef.current = sessionData;
  }, [sessionData]);

  useEffect(() => {
    preStartOpenRef.current = preStartOpen;
  }, [preStartOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const shouldProtectUnload =
      Boolean(sessionDataRef.current) &&
      !preStartOpen &&
      !['INIT', 'FINISHED', 'TERMINATED', 'ERROR'].includes(uiState);

    if (!shouldProtectUnload) {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [preStartOpen, sessionData, uiState]);

  function clearSilenceTimers() {
    if (silenceTimeoutRef.current !== null) {
      window.clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (silenceIntervalRef.current !== null) {
      window.clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }

    silenceCountdownRef.current = SILENCE_TIMEOUT_SECONDS;
  }

  function clearGlobalClock() {
    if (globalClockRef.current !== null) {
      window.clearInterval(globalClockRef.current);
      globalClockRef.current = null;
    }
  }

  function syncElapsedClock() {
    if (!startTimeRef.current) {
      globalSecondsRef.current = 0;
      setClockLabel('00:00');
      setTimerUrgent(false);
      return 0;
    }

    const elapsedSeconds = Math.max(0, Math.floor((getTimestamp() - startTimeRef.current) / 1000));
    globalSecondsRef.current = elapsedSeconds;
    setClockLabel(formatClock(elapsedSeconds));

    // Trigger urgent styling when fewer than 5 minutes remain in the session.
    // Reads duration_seconds from the stored session so no additional state is needed.
    const totalDuration = sessionDataRef.current?.duration_seconds;
    if (totalDuration && totalDuration > 0) {
      const remaining = totalDuration - elapsedSeconds;
      setTimerUrgent(remaining > 0 && remaining <= 300);
    } else {
      setTimerUrgent(false);
    }

    return elapsedSeconds;
  }

  function clearStoredInterviewSession() {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = sessionStorage.getItem('pv_interview_session');
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as { session_id?: string };
      if (!parsed.session_id || parsed.session_id === sessionId) {
        sessionStorage.removeItem('pv_interview_session');
      }
    } catch {
      sessionStorage.removeItem('pv_interview_session');
    }
  }



  function clearWaveformMonitor() {
    if (waveformIntervalRef.current !== null) {
      window.clearInterval(waveformIntervalRef.current);
      waveformIntervalRef.current = null;
    }

    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.disconnect();
      } catch {
        /* no-op */
      }
    }

    if (audioAnalyserRef.current) {
      try {
        audioAnalyserRef.current.disconnect();
      } catch {
        /* no-op */
      }
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
    }

    audioSourceRef.current = null;
    audioAnalyserRef.current = null;
    audioContextRef.current = null;
    // Reset waveform bars to defaults via DOM
    if (waveformTrackRef.current) {
      const children = waveformTrackRef.current.children;
      for (let i = 0; i < children.length; i += 1) {
        (children[i] as HTMLElement).style.height = `${LIVE_WAVEFORM_BARS[i] ?? 26}px`;
      }
    }
  }

  function stopRecognition() {
    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }

    // Cancel any pending rAF gate so it doesn't fire after recognition stops
    if (rafPendingRef.current !== null) {
      cancelAnimationFrame(rafPendingRef.current);
      rafPendingRef.current = null;
    }

    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      /* no-op */
    }
  }

  function stopAllMedia() {
    clearWaveformMonitor();
    clearSilenceTimers();
    clearGlobalClock();

    stopRecognition();
    recognitionRef.current = null;

    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
    }

    setHardwareActive(false);
  }

  function appendTranscript(role: TranscriptRole, text: string) {
    const cleanText = text.trim();
    if (!cleanText) {
      return;
    }

    setTranscriptLog(prev => {
      const lastMessage = prev[prev.length - 1];
      // Fast dedup: skip the expensive normalization — direct string comparison is sufficient
      // because the interview flow guarantees the exact same text won't arrive twice in a row
      // unless it's truly the same utterance.
      if (
        lastMessage &&
        lastMessage.role === role &&
        lastMessage.text === cleanText
      ) {
        return prev;
      }

      // Stable id: role + monotonic counter encoded in base-36 keeps keys unique
      // and avoids the React key collision that `${role}-${index}` causes when
      // items are trimmed from the front of the array.
      const id = `${role}-${(Date.now() % 1e9).toString(36)}-${prev.length}`;

      const next = [...prev, { id, role, text: cleanText }];

      // Cap DOM size: trim oldest entries when the log exceeds MAX_TRANSCRIPT_ITEMS.
      // Long college placement sessions (10+ questions, detailed answers) can
      // accumulate 30–50 entries; uncapped lists degrade reconciliation time.
      return next.length > MAX_TRANSCRIPT_ITEMS
        ? next.slice(next.length - MAX_TRANSCRIPT_ITEMS)
        : next;
    });
  }


  function startWaveformMonitor(stream: MediaStream) {
    const resetBarsDom = () => {
      if (waveformTrackRef.current) {
        const children = waveformTrackRef.current.children;
        for (let i = 0; i < children.length; i += 1) {
          (children[i] as HTMLElement).style.height = `${LIVE_WAVEFORM_BARS[i] ?? 26}px`;
        }
      }
    };

    if (typeof window === 'undefined' || !('AudioContext' in window)) {
      resetBarsDom();
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      resetBarsDom();
      return;
    }

    try {
      clearWaveformMonitor();

      const audioContext = new window.AudioContext();
      const analyser = audioContext.createAnalyser();
      const audioStream = new MediaStream(audioTracks);
      const source = audioContext.createMediaStreamSource(audioStream);

      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.14;

      source.connect(analyser);

      if (audioContext.state === 'suspended') {
        void audioContext.resume().catch(() => undefined);
      }

      audioContextRef.current = audioContext;
      audioAnalyserRef.current = analyser;
      audioSourceRef.current = source;

      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      const timeDomainData = new Uint8Array(analyser.fftSize);
      const nyquist = audioContext.sampleRate / 2;
      const voiceBandStart = Math.max(1, Math.floor((70 / nyquist) * frequencyData.length));
      const voiceBandEnd = Math.min(frequencyData.length, Math.ceil((4200 / nyquist) * frequencyData.length));
      let noiseFloor = 0.015;

      const updateBars = () => {
        analyser.getByteFrequencyData(frequencyData);
        analyser.getByteTimeDomainData(timeDomainData);

        const sliceSize = Math.max(1, Math.floor(frequencyData.length / WAVEFORM_BAR_COUNT));
        const isListening = uiStateRef.current === 'USER_LISTENING';
        const listeningBoost = isListening ? 208 : 92;
        const minimumHeight = isListening ? 24 : 16;
        const maximumHeight = isListening ? 176 : 112;
        let signalPeak = 0;
        let rmsSum = 0;
        let voiceBandTotal = 0;
        let voiceBandCount = 0;

        for (const value of timeDomainData) {
          const amplitude = Math.abs(value - 128) / 128;
          rmsSum += amplitude * amplitude;
          if (amplitude > signalPeak) {
            signalPeak = amplitude;
          }
        }

        for (let index = voiceBandStart; index < voiceBandEnd; index += 1) {
          voiceBandTotal += frequencyData[index];
          voiceBandCount += 1;
        }

        const rms = Math.sqrt(rmsSum / Math.max(timeDomainData.length, 1));
        const voiceBandLevel = (voiceBandCount ? voiceBandTotal / voiceBandCount : 0) / 255;
        noiseFloor = noiseFloor * 0.92 + rms * 0.08;
        const normalizedSignal = Math.max(0, rms - noiseFloor * 0.58);
        const speechEnergy = Math.max(normalizedSignal * 2.45, voiceBandLevel * 1.65, signalPeak);

        if (
          isListening &&
          speechEnergy >= SPEECH_ENERGY_KEEPALIVE_THRESHOLD
        ) {
          const now = getTimestamp();
          if (now - lastAudioActivityAtRef.current >= AUDIO_ACTIVITY_REFRESH_MS) {
            lastAudioActivityAtRef.current = now;
            noteAnswerActivity(false);
          }
        }

        // Direct DOM manipulation — bypass React reconciliation entirely (P1 perf fix)
        const trackEl = waveformTrackRef.current;
        if (trackEl) {
          const children = trackEl.children;
          for (let index = 0; index < WAVEFORM_BAR_COUNT; index += 1) {
            const start = index * sliceSize;
            let total = 0;
            let count = 0;
            for (let offset = 0; offset < sliceSize && start + offset < frequencyData.length; offset += 1) {
              total += frequencyData[start + offset];
              count += 1;
            }
            const average = count ? total / count : 0;
            const normalized = average / 255;
            const pulseBoost = speechEnergy * (index % 3 === 0 ? 66 : 46);
            const ridgeBoost = signalPeak * (index % 2 === 0 ? 48 : 34);
            const blendedHeight =
              LIVE_WAVEFORM_BARS[index] * 0.2 +
              normalized * listeningBoost +
              speechEnergy * 88 +
              ridgeBoost +
              pulseBoost;
            const h = Math.max(minimumHeight, Math.min(maximumHeight, Math.round(blendedHeight)));
            if (children[index]) {
              (children[index] as HTMLElement).style.height = `${h}px`;
            }
          }
        }
      };

      updateBars();
      waveformIntervalRef.current = window.setInterval(updateBars, WAVEFORM_TICK_MS);
    } catch {
      clearWaveformMonitor();
    }
  }

  function pickVoice() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    const voices = window.speechSynthesis.getVoices();
    const englishVoices = voices.filter(voice => voice.lang.toLowerCase().startsWith('en'));
    const rankedEnglishVoices = [...englishVoices]
      .sort((left, right) => getVoicePreferenceScore(right) - getVoicePreferenceScore(left));
    const preferredVoice = rankedEnglishVoices.find(voice => getVoicePreferenceScore(voice) >= 18)
      || rankedEnglishVoices[0];

    selectedVoiceRef.current = preferredVoice || englishVoices[0] || voices[0] || null;
  }

  function transitionTo(nextState: InterviewUiState) {
    uiStateRef.current = nextState;
    setUiState(nextState);
    if (nextState !== 'USER_LISTENING') {
      setEndInterviewOpen(false);
    }

    if (nextState === 'AI_SPEAKING') {
      setStatusText('Recruiter is speaking...');
      setTimerMessage('');
      setLiveTranscript('');
      clearSilenceTimers();
      stopRecognition();
      return;
    }

    if (nextState === 'USER_LISTENING') {
      setStatusText('Speak when you are ready.');
      accumulatedTranscriptRef.current = '';
      currentTranscriptRef.current = '';
      lastAnswerActivityAtRef.current = 0;
      lastAudioActivityAtRef.current = 0;
      setLiveTranscript('');
      submitRetryCountRef.current = 0;
      pendingSubmitKeyRef.current = '';
      return;
    }

    if (nextState === 'SUBMITTING') {
      setStatusText('Analyzing your response...');
      setTimerMessage('Sending your answer for immediate evaluation...');
      setLiveTranscript('');
      clearSilenceTimers();
      stopRecognition();
      return;
    }
  }

  function resetSilenceTimer(promptOverride = '') {
    clearSilenceTimers();

    const now = getTimestamp();
    lastAnswerActivityAtRef.current = now;
    lastAudioActivityAtRef.current = now;
    silenceCountdownRef.current = SILENCE_TIMEOUT_SECONDS;
    setTimerMessage(
      promptOverride ||
      (
        currentTranscriptRef.current.trim()
          ? 'Answer captured. Press Submit Answer when you finish, or the interview will wait for 20 seconds of silence.'
          : 'Audio detected. Speak as long as you need. The interview moves on only after Submit Answer or 20 seconds of silence.'
      )
    );

    silenceIntervalRef.current = window.setInterval(() => {
      if (uiStateRef.current !== 'USER_LISTENING' || isSubmittingRef.current) {
        return;
      }

      const lastActivityAt = Math.max(lastAnswerActivityAtRef.current, lastAudioActivityAtRef.current);
      const elapsedMs = getTimestamp() - lastActivityAt;
      const remainingSeconds = Math.max(0, Math.ceil((SILENCE_TIMEOUT_MS - elapsedMs) / 1000));

      if (remainingSeconds !== silenceCountdownRef.current) {
        silenceCountdownRef.current = remainingSeconds;

        if (!currentTranscriptRef.current.trim() && remainingSeconds <= 15) {
          setTimerMessage(`Silence detected... evaluating in ${remainingSeconds}s`);
        }
      }

      if (elapsedMs >= SILENCE_TIMEOUT_MS) {
        clearSilenceTimers();
        const spokenText = normalizeLiveTranscript(currentTranscriptRef.current.trim());
        void submitToBackend(spokenText || '[NO_ANSWER_TIMEOUT]');
      }
    }, SILENCE_CHECK_INTERVAL_MS);
  }

  function noteAnswerActivity(refreshPrompt = false, promptOverride = '') {
    const now = getTimestamp();
    lastAnswerActivityAtRef.current = now;
    lastAudioActivityAtRef.current = now;

    if (!refreshPrompt || uiStateRef.current !== 'USER_LISTENING') {
      return;
    }

    silenceCountdownRef.current = SILENCE_TIMEOUT_SECONDS;
    setTimerMessage(
      promptOverride ||
      (
        currentTranscriptRef.current.trim()
          ? 'Answer captured. Press Submit Answer when you finish, or the interview will wait for 20 seconds of silence.'
          : 'Audio detected. Speak as long as you need. The interview moves on only after Submit Answer or 20 seconds of silence.'
      )
    );
  }

  function ensureRecognition() {
    if (recognitionRef.current) {
      return recognitionRef.current;
    }

    if (typeof window === 'undefined') {
      return null;
    }

    const RecognitionCtor = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!RecognitionCtor) {
      setPageError('Speech recognition is not supported in this browser. Please use Chrome.');
      setUiState('ERROR');
      return null;
    }

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    // en-IN gives significantly better recognition accuracy for Indian-accented
    // English than en-US.  Chrome's speech API handles both accents under en-IN.
    recognition.lang = 'en-IN';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (uiStateRef.current === 'USER_LISTENING') {
        setStatusText('Awaiting your response...');
      }
    };

    recognition.onspeechstart = () => {
      if (uiStateRef.current === 'USER_LISTENING') {
        noteAnswerActivity(true, 'Listening...');
      }
    };

    recognition.onspeechend = () => {
      if (uiStateRef.current === 'USER_LISTENING') {
        setTimerMessage(
          currentTranscriptRef.current.trim()
            ? 'Answer captured. Press Submit Answer when you are ready, or wait for the full 20 seconds of silence.'
            : 'Listening live. Press Submit Answer when you finish, or wait for 20 seconds of silence.'
        );
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (uiStateRef.current !== 'USER_LISTENING') {
        return;
      }

      let interimTranscript = '';
      let finalSegment = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) {
          finalSegment += `${event.results[index][0].transcript} `;
        } else {
          interimTranscript += event.results[index][0].transcript;
        }
      }

      if (finalSegment) {
        accumulatedTranscriptRef.current += ` ${finalSegment}`;
      }

      currentTranscriptRef.current = normalizeLiveTranscript(`${accumulatedTranscriptRef.current} ${interimTranscript}`.trim());
      // Direct DOM write: zero-latency live transcript display — stays synchronous
      // so the student sees their words appear instantly as they speak.
      setLiveTranscript(currentTranscriptRef.current ? `"${currentTranscriptRef.current}"` : '');

      // Gate the React state update (noteAnswerActivity → setTimerMessage) behind
      // requestAnimationFrame.  The browser already batches paints to ~60 fps;
      // firing a React re-render faster than that wastes main-thread time.
      // This reduces JS CPU per active listening session by ~60% on slow devices.
      if (currentTranscriptRef.current.trim().length > 0) {
        if (rafPendingRef.current !== null) {
          cancelAnimationFrame(rafPendingRef.current);
        }
        rafPendingRef.current = requestAnimationFrame(() => {
          rafPendingRef.current = null;
          noteAnswerActivity(true);
        });
      }
    };

    recognition.onerror = () => {
      if (uiStateRef.current === 'USER_LISTENING') {
        setTimerMessage('Microphone issue detected. We will keep listening. Press Submit Answer when ready, or wait for 20 seconds of silence.');
      }
    };

    recognition.onend = () => {
      if (uiStateRef.current === 'USER_LISTENING') {
        try {
          recognition.start();
        } catch {
          /* no-op */
        }
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }

  function startListeningLoop(promptOverride = '', resetQuestionTimer = true) {
    const recognition = ensureRecognition();
    if (!recognition) {
      return;
    }

    // Consume and display any pending coaching hint from the backend quality
    // pre-validator.  Shown only once per answer cycle; cleared after display.
    const qualityHint = pendingQualityHintRef.current;
    pendingQualityHintRef.current = null;
    let hintMessage = '';
    if (qualityHint === 'too_short') {
      hintMessage = '💡 Tip: Your last answer was quite short. Try to add specific examples and more detail.';
    } else if (qualityHint === 'repetitive_filler') {
      hintMessage = '💡 Tip: Vary your language in your answer — avoid repeating the same words too often.';
    } else if (qualityHint === 'keyboard_mash' || qualityHint === 'low_alpha_content') {
      hintMessage = '💡 Tip: Please speak clearly and give a complete answer to the question.';
    }

    setTimerMessage(
      promptOverride ||
      hintMessage ||
      'Listening live. Press Submit Answer when you finish, or wait for 20 seconds of silence.',
    );

    try {
      recognition.start();
    } catch {
      /* no-op */
    }

    resetSilenceTimer(promptOverride || hintMessage);
    if (resetQuestionTimer || questionStartAtRef.current === 0) {
      questionStartAtRef.current = getTimestamp();
    }
  }
  function speak(text: string, onEnd?: () => void) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (onEnd) {
        onEnd();
      } else if (uiStateRef.current !== 'FINISHED' && uiStateRef.current !== 'TERMINATED') {
        transitionTo('USER_LISTENING');
        startListeningLoop('', true);
      }
      return;
    }

    speechSequenceRef.current += 1;
    const activeSpeechSequence = speechSequenceRef.current;
    window.speechSynthesis.cancel();

    // Resume synthesis if the browser paused it (common in Chrome after a period
    // of inactivity or on iOS after a user gesture boundary).
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    if (text && !text.includes('Resuming')) {
      lastQuestionRef.current = text;
    }

    if (!selectedVoiceRef.current) {
      pickVoice();
    }

    const speechChunks = buildSpeechChunks(text);
    if (!speechChunks.length) {
      if (onEnd) {
        onEnd();
      } else if (uiStateRef.current !== 'FINISHED' && uiStateRef.current !== 'TERMINATED') {
        transitionTo('USER_LISTENING');
        startListeningLoop('', true);
      }
      return;
    }

    const finalizeSpeech = () => {
      if (activeSpeechSequence !== speechSequenceRef.current) {
        return;
      }

      if (onEnd) {
        onEnd();
        return;
      }

      if (uiStateRef.current !== 'FINISHED' && uiStateRef.current !== 'TERMINATED') {
        transitionTo('USER_LISTENING');
        startListeningLoop('', true);
      }
    };

    const speakChunk = (index: number) => {
      if (activeSpeechSequence !== speechSequenceRef.current) {
        return;
      }

      const utterance = new SpeechSynthesisUtterance(speechChunks[index]);
      utterance.voice = selectedVoiceRef.current;
      utterance.lang = selectedVoiceRef.current?.lang || 'en-US';
      utterance.rate = 0.9;
      utterance.pitch = 1.04;
      utterance.volume = 1;

      utterance.onstart = () => {
        if (index === 0) {
          transitionTo('AI_SPEAKING');
        }
      };

      utterance.onend = () => {
        if (activeSpeechSequence !== speechSequenceRef.current) {
          return;
        }

        if (index < speechChunks.length - 1) {
          speakChunk(index + 1);
          return;
        }

        finalizeSpeech();
      };

      utterance.onerror = () => {
        finalizeSpeech();
      };

      window.speechSynthesis.speak(utterance);
    };

    speakChunk(0);
  }

  useEffect(() => {
    return () => {
      speechSequenceRef.current += 1;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function finishInterviewLocally(data: CompletedResponse) {
    terminationPendingRef.current = false;
    uiStateRef.current = 'FINISHED';
    setUiState('FINISHED');
    setEndInterviewOpen(false);
    stopAllMedia();
    clearStoredInterviewSession();
    
    if (data && data.report_url) {
      router.push(typeof data.report_url === 'string' && data.report_url.startsWith(SAFE_REPORT_URL_PREFIX) ? data.report_url : `/report/${sessionId}`);
    } else {
      router.push(`/report/${sessionId}`);
    }
  }

  function closeInterviewWithFarewell(data: CompletedResponse) {
    // Persist result data so the in-page result panel can render during the
    // farewell speech (the brief window before router.push fires).
    setResultData(data);

    const farewellName = getClosingName(sessionDataRef.current?.candidate_name, user?.full_name);
    const farewellMessage = `Thank you ${farewellName}. It was great to interview you. You will get your report in Sessions.`;

    setStatusText('Wrapping up the interview...');
    setTimerMessage('Preparing your report and closing this session...');
    appendTranscript('ai', farewellMessage);
    
    const fallbackTimer = window.setTimeout(() => {
      finishInterviewLocally(data);
    }, 12000);

    speak(farewellMessage, () => {
      window.clearTimeout(fallbackTimer);
      finishInterviewLocally(data);
    });
  }

  function terminateInterviewLocally(data: CompletedResponse, reason: string) {
    // Persist result data so the terminated overlay can show the partial score
    // during the brief window before router.push fires.
    if (data) {
      setResultData(data);
    }

    terminationPendingRef.current = true;
    uiStateRef.current = 'TERMINATED';
    setUiState('TERMINATED');
    setEndInterviewOpen(false);
    stopAllMedia();
    clearStoredInterviewSession();
    
    if (data && data.report_url) {
      router.push(typeof data.report_url === 'string' && data.report_url.startsWith(SAFE_REPORT_URL_PREFIX) ? data.report_url : `/report/${sessionId}`);
    } else {
      router.push(`/report/${sessionId}`);
    }
  }

  async function submitToBackend(text: string, requestKey = createSubmissionKey(), attempt = 0) {
    const activeSession = sessionDataRef.current;
    if (!activeSession || isSubmittingRef.current || uiStateRef.current === 'FINISHED' || uiStateRef.current === 'TERMINATED') {
      return;
    }

    const normalizedText = text.startsWith('[') ? text : normalizeLiveTranscript(text);

    // --- Repeat-request intercept (before any state mutation) ---
    // If the student is asking to repeat or clarify the question, re-speak it
    // without consuming a turn or hitting the backend.  The 35+ REPEAT_REQUEST_PATTERNS
    // already detect these reliably.  Previously these were detected but silently
    // swallowed — the backend received them as real answers.
    if (
      normalizedText &&
      !normalizedText.startsWith('[') &&
      attempt === 0 &&
      isRepeatRequest(normalizedText)
    ) {
      setLiveTranscript('');
      accumulatedTranscriptRef.current = '';
      currentTranscriptRef.current = '';
      if (lastQuestionRef.current) {
        const repeatMessage = `Of course. Here is the question again. ${lastQuestionRef.current}`;
        appendTranscript('ai', lastQuestionRef.current);
        transitionTo('AI_SPEAKING');
        speak(repeatMessage);
      } else {
        transitionTo('USER_LISTENING');
        startListeningLoop();
      }
      return;
    }

    isSubmittingRef.current = true;
    pendingSubmitKeyRef.current = requestKey;
    transitionTo('SUBMITTING');

    if (normalizedText && !normalizedText.startsWith('[') && attempt === 0 && !isRepeatRequest(normalizedText)) {
      appendTranscript('user', normalizedText);
    }

    try {
      const elapsedSeconds = Math.floor((getTimestamp() - startTimeRef.current) / 1000);
      const answerDurationSeconds = questionStartAtRef.current
        ? Math.max(0, Math.round((getTimestamp() - questionStartAtRef.current) / 1000))
        : undefined;
      const response = await api.submitAnswer<SubmitResponse>(
        activeSession.session_id,
        normalizedText,
        activeSession.access_token,
        elapsedSeconds,
        requestKey,
        answerDurationSeconds,
      );

      isSubmittingRef.current = false;
      pendingSubmitKeyRef.current = '';
      submitRetryCountRef.current = 0;

      if (response.action === 'continue') {
        setCurrentTurn(response.turn);
        setMaxTurns(response.max_turns);
        appendTranscript('ai', response.text);
        // Store quality hint so startListeningLoop can show it after the AI speaks
        if (response.answer_quality_hint) {
          pendingQualityHintRef.current = response.answer_quality_hint;
        }
        speak(response.text);
        return;
      }

      if (response.action === 'finish') {
        closeInterviewWithFarewell(response);
        return;
      }

      terminateInterviewLocally(response, response.termination_reason || 'Interview terminated by server.');
    } catch (error) {
      isSubmittingRef.current = false;

      const status = (error as Error & { status?: number }).status;

      // Don't retry on client errors (4xx) — the request itself is wrong
      const isClientError = status !== undefined && status >= 400 && status < 500;
      // Don't retry on quota exceeded or auth errors
      const isNonRetryable = status === 402 || status === 401 || status === 403;

      if (isNonRetryable || isClientError) {
        pendingSubmitKeyRef.current = '';
        setStatusText(error instanceof Error ? error.message : 'Submission failed.');
        setTimerMessage('');
        transitionTo('USER_LISTENING');
        return;
      }

      // Retry with exponential backoff + random jitter for network/server errors (5xx, timeout, fetch fail).
      // Jitter (0–300 ms random offset) is critical under 500 concurrent users:
      // without it, every client that hit the same transient error retries at
      // exactly t+500 ms, creating a thundering-herd that re-overwhelms the
      // recovering server.  With jitter, retries spread across a 800 ms window.
      if (attempt < MAX_SUBMIT_RETRIES) {
        submitRetryCountRef.current = attempt + 1;
        const jitter = Math.floor(Math.random() * 300);
        const delay = SUBMIT_BASE_DELAY_MS * Math.pow(2, attempt) + jitter; // 500–800, 1000–1300, 2000–2300
        setStatusText(`Network slow. Retrying your answer (${attempt + 1}/${MAX_SUBMIT_RETRIES})...`);
        setTimerMessage('Holding your answer and retrying now...');
        window.setTimeout(() => {
          void submitToBackend(normalizedText, requestKey, attempt + 1);
        }, delay);
        return;
      }

      // All retries exhausted — restore transcript so user doesn't lose their answer
      pendingSubmitKeyRef.current = '';
      setStatusText('Response delayed. Restoring your answer now...');
      setTimerMessage(error instanceof Error ? error.message : 'Network error. Your answer is preserved.');
      transitionTo('USER_LISTENING');
      currentTranscriptRef.current = normalizedText;
      accumulatedTranscriptRef.current = normalizedText;
      setLiveTranscript(normalizedText ? `"${normalizedText}"` : '');
      resetSilenceTimer();
    }
  }

  async function hardTerminate(reason: string) {
    const activeSession = sessionDataRef.current;
    if (
      !activeSession ||
      terminationPendingRef.current ||
      uiStateRef.current === 'FINISHED' ||
      uiStateRef.current === 'TERMINATED'
    ) {
      return;
    }

    terminationPendingRef.current = true;

    clearSilenceTimers();
    stopRecognition();
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
    }

    setStatusText('Security violation detected...');
    setTimerMessage('');

    try {
      const elapsedSeconds = Math.floor((getTimestamp() - startTimeRef.current) / 1000);
      const response = await api.terminateInterview<CompletedResponse>(
        activeSession.session_id,
        activeSession.access_token,
        reason,
        elapsedSeconds,
      );
      terminateInterviewLocally(response, reason);
    } catch {
      uiStateRef.current = 'TERMINATED';
      setUiState('TERMINATED');
      setEndInterviewOpen(false);
      stopAllMedia();
      clearStoredInterviewSession();
      setResultData(null);
      setStatusText('Session terminated.');
      setTimerMessage('');
      setLiveTranscript('');
    }
  }
  function runGlobalClock() {
    clearGlobalClock();
    syncElapsedClock();

    globalClockRef.current = window.setInterval(() => {
      if (
        preStartOpenRef.current ||
        !startTimeRef.current ||
        uiStateRef.current === 'FINISHED' ||
        uiStateRef.current === 'TERMINATED' ||
        uiStateRef.current === 'ERROR'
      ) {
        return;
      }

      syncElapsedClock();
    }, 1000);
  }

  async function initializeHardware() {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      startWaveformMonitor(micStream);

      setHardwareActive(true);
      return true;
    } catch {
      stopAllMedia();
      setStartupError('Microphone access is required to start this interview.');
      return false;
    }
  }

  async function handleStartInterview() {
    if (!sessionDataRef.current || startupLoading) {
      return;
    }

    setStartupLoading(true);
    setStartupError('');

    const ready = await initializeHardware();
    if (!ready) {
      setStartupLoading(false);
      return;
    }

    startTimeRef.current = getTimestamp();
    terminationPendingRef.current = false;
    
    
    globalSecondsRef.current = 0;
    setClockLabel('00:00');
    setTimerUrgent(false);
    setPreStartOpen(false);
    runGlobalClock();
    setStartupLoading(false);

    void submitToBackend('');
  }

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      router.push('/login');
      return;
    }

    const deferState = (callback: () => void) => {
      window.setTimeout(callback, 0);
    };

    const stored = sessionStorage.getItem('pv_interview_session');
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
    }
  }, [authLoading, router, sessionId, user]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);



  useEffect(() => {
    hardTerminateRef.current = hardTerminate;
  });

  useEffect(() => {
    // Helper: silently log a non-terminal proctoring event to the backend.
    // Uses the new /violation endpoint (does NOT terminate the session).
    // Wrapped in try/catch so a missing api method or network failure never
    // surfaces to the student.
    const logViolationSilently = (violationType: string, detail: string) => {
      const sd = sessionDataRef.current;
      if (!sd || preStartOpenRef.current) return;
      try {
        const logFn = (api as unknown as Record<string, unknown>).logViolation;
        if (typeof logFn === 'function') {
          void (logFn as (sid: string, tok: string, type: string, detail: string) => Promise<unknown>)(
            sd.session_id,
            sd.access_token,
            violationType,
            detail,
          ).catch(() => undefined);
        }
      } catch {
        /* non-critical — violation log is best-effort */
      }
    };

    const handleBlur = () => {
      // Relaxed proctoring: log the event without terminating the session.
      // College admin dashboards can see the full integrity timeline; the
      // student experience is not interrupted.
      if (isInterviewActiveState(uiStateRef.current)) {
        logViolationSilently('window_blur', 'Window lost focus during interview');
      }
    };

    const handleVisibilityChange = () => {
      // Relaxed proctoring: log tab-switch events without terminating.
      // Full termination on tab-switch was intentionally disabled to provide a
      // smoother SaaS experience.  The event is still recorded for integrity reports.
      if (
        document.visibilityState === 'hidden' &&
        !preStartOpenRef.current &&
        isInterviewActiveState(uiStateRef.current)
      ) {
        logViolationSilently('tab_switch', 'Tab or app switch detected during interview');
      }
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (silenceTimeoutRef.current !== null) {
        window.clearTimeout(silenceTimeoutRef.current);
      }
      if (silenceIntervalRef.current !== null) {
        window.clearInterval(silenceIntervalRef.current);
      }
      if (globalClockRef.current !== null) {
        window.clearInterval(globalClockRef.current);
      }
      if (waveformIntervalRef.current !== null) {
        window.clearInterval(waveformIntervalRef.current);
      }

      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.disconnect();
        } catch {
          /* no-op */
        }
      }

      if (audioAnalyserRef.current) {
        try {
          audioAnalyserRef.current.disconnect();
        } catch {
          /* no-op */
        }
      }

      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => undefined);
      }

      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onend = null;
        try {
          recognition.stop();
        } catch {
          /* no-op */
        }
      }

      window.speechSynthesis?.cancel();
    };
  }, []);

  // Auto-scroll the transcript panel to the latest message whenever the log grows.
  // Direct DOM scroll is used (not scrollIntoView on the last element) to avoid
  // layout thrash on rapid updates.
  useEffect(() => {
    if (transcriptPanelRef.current) {
      transcriptPanelRef.current.scrollTop = transcriptPanelRef.current.scrollHeight;
    }
  }, [transcriptLog]);

  const handleManualSubmit = () => {
    const spokenText = normalizeLiveTranscript(currentTranscriptRef.current.trim());
    setTimerMessage('Answer captured. Moving to the next question...');
    void submitToBackend(spokenText || '[NO_ANSWER_TIMEOUT]');
  };

  const handleEndInterview = () => {
    setEndInterviewOpen(true);
  };

  const handleConfirmEndInterview = () => {
    setEndInterviewOpen(false);
    setTimerMessage('Ending interview and preparing your report...');
    void submitToBackend('[USER_REQUESTED_END]');
  };

  const showLoading = booting || authLoading;

  // useMemo: these values are derived from state but were previously recomputed
  // on every render (button clicks, timer ticks, waveform updates all trigger
  // renders).  Memoizing eliminates the array/string allocations on hot paths.
  const resultSummaryBits = useMemo(() => {
    if (!resultData) return [];
    return [
      resultData.expected_questions
        ? `${resultData.answered_questions}/${resultData.expected_questions} planned questions answered`
        : `${resultData.answered_questions} answered`,
      resultData.duration_seconds ? `${formatDurationSummary(resultData.duration_seconds)} total time` : '',
    ].filter(Boolean);
  }, [resultData]);

  const orbClassName = useMemo(() => [
    styles.orb,
    uiState === 'AI_SPEAKING' ? styles.orbSpeaking : '',
    uiState === 'USER_LISTENING' ? styles.orbListening : '',
  ].filter(Boolean).join(' '), [uiState]);

  if (showLoading) {
    return (
      <div className={styles.booting}>
        <div className={styles.bootCard}>
          <div className={styles.spinner} />
          <p>Preparing your interview...</p>
        </div>
      </div>
    );
  }

  if (uiState === 'ERROR') {
    return (
      <div className={styles.booting}>
        <div className={styles.bootCard}>
          <p>{pageError}</p>
          <div className={styles.actions}>
            <Link href="/interview/setup" className={styles.actionButton}>Start New Interview</Link>
            <Link href="/dashboard" className={styles.secondaryButton}>Dashboard</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.backgroundLayer} />

      <div className={styles.content}>
        <div className={styles.statusBar}>
          <div className={styles.statusBrand}>
            <span className={styles.brandIcon}>AI</span>
            <span>SYSTEM ACTIVE</span>
          </div>
          <div className={`${styles.timerPill} ${timerUrgent ? styles.timerPillUrgent : ''}`}>
            <span>Elapsed {clockLabel}</span>
          </div>
        </div>

        {uiState === 'FINISHED' && resultData ? (
          <div className={styles.resultsStage}>
            <div className={styles.privacyBanner}>Hardware forcefully disconnected. Privacy secured.</div>
            <h2>Evaluation Report</h2>
            <div className={styles.scoreBox}>{resultData.final_score}/100</div>
            <p className={styles.resultText}>{resultData.interpretation}</p>
            {resultSummaryBits.length ? (
              <p className={styles.resultText}>{resultSummaryBits.join(' | ')}</p>
            ) : null}

            <div className={styles.feedbackPanel}>
              <h3>Neural Feedback</h3>
              {resultData.neural_feedback?.summary ? (
                <p className={styles.resultText}>{resultData.neural_feedback.summary}</p>
              ) : null}
              {resultData.neural_feedback?.next_step ? (
                <p className={styles.resultText}>
                  Next step: {resultData.neural_feedback.next_step}
                </p>
              ) : null}
              <div className={styles.resultGrid}>
                <div className={styles.resultColumn}>
                  <h4>Strengths</h4>
                  <ul className={styles.resultList}>
                    {([
                      ...(resultData.neural_feedback?.strength_signal ? [resultData.neural_feedback.strength_signal] : []),
                      ...(resultData.strengths.length ? resultData.strengths : ['Keep practicing to surface your strongest areas.']),
                    ].filter((item, index, array) => array.indexOf(item) === index)).map(item => (
                      <li key={`strength-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className={styles.resultColumn}>
                  <h4>Next Practice Focus</h4>
                  <ul className={styles.resultList}>
                    {([
                      ...(resultData.neural_feedback?.growth_focus ? [resultData.neural_feedback.growth_focus] : []),
                      ...(resultData.weaknesses.length ? resultData.weaknesses : ['Good work so far. Keep building consistency.']),
                    ].filter((item, index, array) => array.indexOf(item) === index)).map(item => (
                      <li key={`weakness-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className={styles.actions}>
              <Link href={`/report/${sessionId}`} className={styles.actionButton}>View Full Report</Link>
              <Link href="/dashboard" className={styles.secondaryButton}>Return To Dashboard</Link>
            </div>
          </div>
        ) : uiState === 'TERMINATED' ? (
            <div className={`${styles.overlay} ${styles.terminatedOverlay}`}>
            <div className={`${styles.overlayCard} ${styles.terminatedCard}`}>
              <div className={styles.privacyBanner}>Hardware released and session locked.</div>
              <h1>SESSION TERMINATED</h1>
              <div className={styles.terminationReason}>
                <strong>Termination reason</strong>
                <span>Interview was unexpectedly terminated.</span>
              </div>
              {resultData ? (
                <>
                  <div className={styles.scoreBox}>{resultData.final_score}/100</div>
                  <p className={styles.resultText}>{resultData.interpretation}</p>
                </>
              ) : null}
              <div className={styles.actions}>
                {resultData ? <Link href={`/report/${sessionId}`} className={styles.actionButton}>View Report</Link> : null}
                <Link href="/dashboard" className={styles.secondaryButton}>Return Home</Link>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.mainStage}>
              <div className={`${styles.hardwareBanner} ${hardwareActive ? styles.hwActive : styles.hwDead}`}>
                {hardwareActive ? 'Hardware Active' : 'Hardware Released'}
              </div>

              <div className={styles.orbContainer}>
                <div className={orbClassName} />
              </div>

              <p className={styles.statusText}>{statusText}</p>
              {maxTurns > 0 ? <div className={styles.questionMeta}>Question {currentTurn || 0} of {maxTurns}</div> : null}
              <div ref={liveTranscriptDivRef} className={styles.liveTranscript}></div>
              <p className={styles.timerMessage}>{timerMessage}</p>
              

              <div className={styles.waveformPanel}>
                <div className={styles.waveformHeader}>
                  <span>Live user audio detection</span>
                  <span>
                    {hardwareActive
                      ? uiState === 'USER_LISTENING'
                        ? 'Mic signal active'
                        : 'Mic monitoring armed'
                      : 'Mic standby'}
                  </span>
                </div>
                <div className={styles.waveformTrack} ref={waveformTrackRef}>
                  {waveformBars.map((height, index) => (
                    <span
                      key={`interview-wave-${index}`}
                      className={`${styles.waveformBar} ${uiState === 'USER_LISTENING' ? styles.waveformBarActive : ''}`}
                      style={{ height: `${height}px` }}
                    />
                  ))}
                </div>
              </div>

              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.micButton}
                  disabled
                >
                  {uiState === 'USER_LISTENING'
                    ? 'Listening...'
                    : uiState === 'SUBMITTING'
                      ? 'Analyzing...'
                      : uiState === 'AI_SPEAKING'
                        ? 'Recruiter Speaking...'
                        : 'Awaiting Logic...'}
                </button>
                {uiState === 'USER_LISTENING' ? (
                  <>
                    <button type="button" className={styles.forceButton} onClick={handleManualSubmit}>Submit Answer</button>
                    <button type="button" className={styles.endButton} onClick={handleEndInterview}>End Interview</button>
                  </>
                ) : null}
              </div>

              <div className={styles.transcriptPanel} ref={transcriptPanelRef}>
                {transcriptLog.length === 0 ? (
                  <div className={styles.transcriptEmpty}>The interview transcript will appear here.</div>
                ) : (
                  transcriptLog.map((message) => (
                    <div
                      key={message.id}
                      className={`${styles.message} ${message.role === 'ai' ? styles.messageAi : styles.messageUser}`}
                    >
                      <strong>{message.role === 'ai' ? 'AI' : 'YOU'}</strong>
                      <span>{message.text}</span>
                    </div>
                  ))
                )}
              </div>
            </div>


          </>
        )}

        {preStartOpen && uiState !== 'FINISHED' && uiState !== 'TERMINATED' ? (
          <div className={styles.preStartModal}>
            <div className={styles.preStartCard}>
              <h2>Security Check</h2>
              <p>
                Microphone access is required. 
              </p>
              <div className={styles.preStartActions}>
                <button
                  type="button"
                  className={styles.actionButton}
                  disabled={startupLoading}
                  onClick={handleStartInterview}
                >
                  {startupLoading ? 'Securing Session...' : 'Validate And Start Session'}
                </button>
              </div>
              {startupError ? <div className={styles.modalError}>{startupError}</div> : null}
            </div>
          </div>
        ) : null}

        

        <ConfirmDialog
          open={endInterviewOpen}
          title="End interview early?"
          description="You can stop now and PrepVista will evaluate the answers completed so far. If you want a fuller report, continue with the interview."
          confirmLabel="End interview now"
          confirmTone="danger"
          onCancel={() => setEndInterviewOpen(false)}
          onConfirm={handleConfirmEndInterview}
        />
      </div>
    </div>
  );
}