'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ScoreSummary } from '@/components/score-summary';
import type { ScoreMeasurement } from '@/lib/score-semantics';
import { useParams, useRouter } from 'next/navigation';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from '@/lib/auth-context';
import { AssistanceViews, provenanceLabel, type AssistanceProvenance, type ViewedEvent } from '@/lib/assistance-views';
import { api } from '@/lib/api';
import { ServerSttSession, serverSttSupported, retryPendingTranscription, type StopResult } from '@/lib/serverStt';
import { ensurePendingAttempt, getPendingEvidence, listPendingEvidence, savePendingAnswer, acknowledgePendingEvidence, appendPendingTranscript, flushPendingAudio,
  type EvidenceScope, type PendingAnswerPayload, type PendingInterviewEvidence, type DurableEvidenceAck } from '@/lib/pending-interview-evidence';

import { bounded, outcomeForCapture, type CaptureResult } from '@/lib/interview-capture';
import styles from './page.module.css';

// Fix 1 — server-side STT feature flag. Default OFF: while off, the interview
// uses the existing client-side Web Speech recognition. Flip
// NEXT_PUBLIC_STT_SERVER_ENABLED=true to route capture through MediaRecorder +
// the backend WebSocket (cross-browser, audio retained for disputes).
const STT_SERVER_ENABLED =
  (process.env.NEXT_PUBLIC_STT_SERVER_ENABLED || '').toLowerCase() === 'true';
const STT_BACKEND_URL = (process.env.NEXT_PUBLIC_API_URL || '').trim();

type InterviewUiState =
  | 'INIT'
  | 'AI_SPEAKING'
  | 'USER_LISTENING'
  | 'STOPPING'
  | 'TRANSCRIBING'
  | 'FINALIZING'
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
  // Additive: guided interview assistance policy
  assistance_enabled?: boolean;
  turn?: number;
  state?: string;
  question_instance_id?: string | null;
  current_question_text?: string | null;
  current_assistance_provenance?: AssistanceProvenance | null;
  terminal_outcome?: string | null;
  pending_accepted_answers?: ServerPendingAnswer[];
}

interface ServerPendingAnswer {
  request: { user_text: string; client_request_id: string; duration_actual?: number; answer_duration_seconds?: number } & PendingAnswerPayload['terminal'];
  evidence_ack: DurableEvidenceAck;
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
  // Additive: stable question instance ID for assistance tracking
  question_instance_id?: string;
}

interface NeuralFeedback {
  summary: string;
  strength_signal: string;
  growth_focus: string;
  next_step: string;
  focus_category: string;
}

interface CompletedResponse extends ScoreMeasurement {
  action: 'finish' | 'terminated';
  final_score: number | null;
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

type SubmitResponse = (ContinueResponse | CompletedResponse | { action: 'accepted'; processing_state: 'PENDING' | 'COMPLETE' }) & { evidence_ack?: DurableEvidenceAck };

function matchesEvidenceAck(scope: EvidenceScope, ack?: DurableEvidenceAck): boolean {
  return ack?.durable === true && ack.session_id === scope.sessionId && ack.question_instance_id === scope.questionInstanceId
    && ack.client_request_id === scope.requestId && Number.isFinite(Date.parse(ack.accepted_at));
}

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
  const [sessionLoadAttempt, setSessionLoadAttempt] = useState(0);
  const [maxTurns, setMaxTurns] = useState(0);
  const [resultData, setResultData] = useState<CompletedResponse | null>(null);
  const [waveformBars] = useState<number[]>(LIVE_WAVEFORM_BARS);
  const waveformTrackRef = useRef<HTMLDivElement | null>(null);
  const [endInterviewOpen, setEndInterviewOpen] = useState(false);

  const currentTurnRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Fix 1 — active server-side STT session (only used when STT_SERVER_ENABLED).
  const serverSttRef = useRef<ServerSttSession | null>(null);
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
  const answerResyncRequiredRef = useRef(false);
  const captureSettlingRef = useRef(false);
  const settledCaptureRef = useRef<{ question: string | null; result: CaptureResult } | null>(null);
  const captureFailedRef = useRef(false);
  const captureSpeechRef = useRef(false);
  const [finalizing, setFinalizing] = useState(false);
  const [terminationRetry, setTerminationRetry] = useState('');
  const pendingAnswerRef = useRef<PendingAnswerPayload | null>(null);
  const captureScopeRef = useRef<EvidenceScope | null>(null);
  const acceptedSessionActionRef = useRef<{ scope: EvidenceScope; payload: PendingAnswerPayload; ack: DurableEvidenceAck } | null>(null);
  const transcriptWritesRef = useRef<Promise<void>>(Promise.resolve());
  const [recoveryRecords, setRecoveryRecords] = useState<PendingInterviewEvidence[]>([]);
  const [serverPending, setServerPending] = useState<ServerPendingAnswer[]>([]);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
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

  // ── Guided Interview Assistance state ──────────────────────────────────
  const assistanceEnabled = sessionData?.assistance_enabled ?? false;
  const [currentQuestionInstanceId, setCurrentQuestionInstanceId] = useState<string | null>(null);
  const [activeAssistance, setActiveAssistance] = useState<{mode: 'hint' | 'guided_approach' | 'sample_answer', instance: string, content: string, event_id: string, why_it_works?: string[]} | null>(null);
  const [assistanceLoading, setAssistanceLoading] = useState(false);
  const [assistanceStatus, setAssistanceStatus] = useState<AssistanceProvenance>('independent');
  const [assistancePanelOpen, setAssistancePanelOpen] = useState(false);
  const assistanceTurnRef = useRef<number>(0); // stale response protection fallback
  const assistanceInstanceRef = useRef<string | null>(null); // stale response protection main

  // Reset guidance content when the question instance changes
  useEffect(() => {
    setActiveAssistance(null);
    setAssistanceStatus(currentQuestionInstanceId ? assistanceViewsRef.current!.provenance(currentQuestionInstanceId) : 'independent');
    setAssistancePanelOpen(false);
    setAssistanceLoading(false);
    setAssistanceError('');
    setDisplayedAssistance(null);
    currentTurnRef.current = currentTurn;
    assistanceTurnRef.current = currentTurn;
    assistanceInstanceRef.current = currentQuestionInstanceId;
  }, [currentQuestionInstanceId, currentTurn]);

  const [assistanceError, setAssistanceError] = useState('');
  const [displayedAssistance, setDisplayedAssistance] = useState<ViewedEvent | null>(null);
  const assistanceBusyRef = useRef<string | null>(null);
  const assistanceViewsRef = useRef<AssistanceViews | null>(null);
  if (!assistanceViewsRef.current) assistanceViewsRef.current = new AssistanceViews(async event => {
    const session = sessionDataRef.current;
    if (!session) throw new Error('Session is unavailable.');
    return api.markAssistanceViewed(session.session_id, session.access_token, event.id);
  });
  const lastCompletedQuestionRef = useRef<string | null>(null);
  const pendingRetryRef = useRef<Parameters<typeof api.retryQuestion>[1] | null>(null);

  // Only visible content acquires a view; generation alone never does.
  useEffect(() => {
    if (!assistanceEnabled || !assistancePanelOpen || assistanceLoading || uiState !== 'USER_LISTENING'
        || !displayedAssistance || displayedAssistance.instance !== currentQuestionInstanceId
        || !activeAssistance?.content.trim() || activeAssistance.event_id !== displayedAssistance.id) return;
    void acknowledgeDisplayedAssistance(displayedAssistance);
  }, [assistanceEnabled, assistancePanelOpen, assistanceLoading, uiState, displayedAssistance, currentQuestionInstanceId, activeAssistance]);

  async function acknowledgeDisplayedAssistance(event: ViewedEvent) {
    try {
      const acknowledgement = assistanceViewsRef.current!.show(event);
      setAssistanceStatus(assistanceViewsRef.current!.provenance(event.instance));
      await acknowledgement;
      if (assistanceInstanceRef.current !== event.instance) return;
      setAssistanceStatus(assistanceViewsRef.current!.provenance(event.instance));
      setAssistanceError('');
    } catch {
      if (assistanceInstanceRef.current !== event.instance) return;
      setAssistanceStatus(assistanceViewsRef.current!.provenance(event.instance));
      setAssistanceError('Guidance view could not be saved. Retry before submitting your answer.');
    }
  }

  async function requestAssistance(mode: 'hint' | 'guided_approach' | 'sample_answer') {
    const session = sessionDataRef.current;
    const instance = currentQuestionInstanceId;
    if (!session || !assistanceEnabled || !instance || assistanceBusyRef.current === instance
        || isSubmittingRef.current || pendingRetryRef.current || uiStateRef.current !== 'USER_LISTENING') {
        return;
    }
    
    if (activeAssistance?.instance === instance && activeAssistance.mode === mode) {
      setAssistancePanelOpen(true);
      return;
    }
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
        instance,
        content: resp.content,
        event_id: resp.event_id,
        why_it_works: 'why_it_works' in resp ? resp.why_it_works : undefined
      };
      
      setActiveAssistance(newAssistance);
      setDisplayedAssistance({
        id: resp.event_id,
        instance,
        kind: mode === 'sample_answer' ? 'answer_guidance' : 'hint'
      });
    } catch {
      if (instance === assistanceInstanceRef.current && uiStateRef.current === 'USER_LISTENING') {
        setAssistanceError('Assistant is temporarily unavailable. You can continue the interview or retry.');
      }
    } finally {
      if (assistanceBusyRef.current === instance) {
        assistanceBusyRef.current = null;
        if (instance === assistanceInstanceRef.current) setAssistanceLoading(false);
      }
    }
  }



  async function handleAskMeAgain() {
    const session = sessionDataRef.current;
    if (!session || !currentQuestionInstanceId || isSubmittingRef.current || pendingAnswerRef.current
        || assistanceBusyRef.current || uiStateRef.current !== 'USER_LISTENING') return;
    isSubmittingRef.current = true;
    try {
      if (!pendingRetryRef.current) {
        const capture = await settleCapture();
        await assistanceViewsRef.current!.settle(currentQuestionInstanceId);
        await preserveBeforeSessionAction(capture, 'ABORTED');
        pendingRetryRef.current = {access_token: session.access_token, client_request_id: createSubmissionKey(),
          expected_turn: currentTurn, question_instance_id: lastCompletedQuestionRef.current || currentQuestionInstanceId,
          active_question_instance_id: currentQuestionInstanceId, captured_text: capture.transcript, capture_evidence: capture.evidence};
      }
      transitionTo('SUBMITTING');
      await assistanceViewsRef.current!.settle(currentQuestionInstanceId);
      const result = await api.retryQuestion<{question: string; turn: number; max_turns: number; question_instance_id: string}>(session.session_id, pendingRetryRef.current);
      pendingRetryRef.current = null;
      assistanceInstanceRef.current = result.question_instance_id;
      currentTurnRef.current = result.turn;
      setCurrentQuestionInstanceId(result.question_instance_id); setCurrentTurn(result.turn); setMaxTurns(result.max_turns);
      appendTranscript('ai', result.question);
      speak(result.question);
    } catch {
      setStatusText('Retry could not be saved. Your captured text is preserved.');
      transitionTo('USER_LISTENING');
    } finally { isSubmittingRef.current = false; }
  }

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
    // Fix 1 — tear down the server-side STT session too, so every existing
    // stop path (submit, silence timeout, end interview, unmount) covers both
    // capture modes.
    stopServerStt();

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
            captureSpeechRef.current = true;
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
      if (uiStateRef.current !== 'USER_LISTENING' || isSubmittingRef.current || answerResyncRequiredRef.current) {
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
    // Fix 1 — when server-side STT is enabled, the Web Speech API is not used
    // at all (and the "Please use Chrome" error must never appear). Capture is
    // handled by the MediaRecorder/WebSocket path in startServerStt().
    if (STT_SERVER_ENABLED) {
      return null;
    }

    if (recognitionRef.current) {
      return recognitionRef.current;
    }

    if (typeof window === 'undefined') {
      return null;
    }

    const RecognitionCtor = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!RecognitionCtor) {
      captureFailedRef.current = true;
      setTimerMessage('Transcription could not be started. You can save an unmeasured answer or end this interview.');
      return null;
    }

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    // en-IN gives significantly better recognition accuracy for Indian-accented
    // English than en-US.  Chrome's speech API handles both accents under en-IN.
    recognition.lang = 'en-IN';
    recognition.maxAlternatives = 1;
    let recognitionEpoch = createSubmissionKey();
    const savedFinalSegments = new Set<string>();

    recognition.onstart = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionEpoch = createSubmissionKey();
      if (uiStateRef.current === 'USER_LISTENING') {
        setStatusText('Awaiting your response...');
      }
    };

    recognition.onspeechstart = () => {
      if (recognitionRef.current !== recognition) return;
      captureSpeechRef.current = true;
      if (uiStateRef.current === 'USER_LISTENING') {
        noteAnswerActivity(true, 'Listening...');
      }
    };

    recognition.onspeechend = () => {
      if (recognitionRef.current !== recognition) return;
      if (uiStateRef.current === 'USER_LISTENING') {
        setTimerMessage(
          currentTranscriptRef.current.trim()
            ? 'Answer captured. Press Submit Answer when you are ready, or wait for the full 20 seconds of silence.'
            : 'Listening live. Press Submit Answer when you finish, or wait for 20 seconds of silence.'
        );
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (recognitionRef.current !== recognition) return;
      if (uiStateRef.current !== 'USER_LISTENING' && !captureSettlingRef.current) {
        return;
      }

      let interimTranscript = '';
      let finalSegment = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) {
          const segmentId = `${recognitionEpoch}:${index}`;
          if (savedFinalSegments.has(segmentId)) continue;
          savedFinalSegments.add(segmentId);
          const words = event.results[index][0].transcript;
          finalSegment += `${words} `;
          const scope = captureScopeRef.current;
          if (scope) {
            transcriptWritesRef.current = transcriptWritesRef.current.then(() => appendPendingTranscript(scope, segmentId, words)).then(() => undefined).catch(() => {
              setTimerMessage('Final words could not be saved to recovery storage. Keep this page open and retry submitting.');
            });
          }
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

    recognition.onerror = (event: Event) => {
      if (recognitionRef.current !== recognition) return;
      const code = (event as Event & { error?: string }).error;
      if (code !== 'no-speech' && code !== 'aborted') captureFailedRef.current = true;
      if (uiStateRef.current === 'USER_LISTENING') {
        setTimerMessage('Microphone issue detected. We will keep listening. Press Submit Answer when ready, or wait for 20 seconds of silence.');
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
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

  // Fix 1 — start the server-side STT capture for the current answer turn.
  // Streams MediaRecorder windows to the backend WebSocket; each returned
  // transcript is appended to the SAME refs the Web Speech path uses, so the
  // synchronous "read currentTranscriptRef at submit" flow is unchanged.
  function evidenceScope(): EvidenceScope {
    const question = assistanceInstanceRef.current;
    if (!user?.id || !question || currentTurnRef.current < 1) throw new Error('The saved question identity is unavailable. Reload the interview before recording.');
    const existing = captureScopeRef.current;
    if (existing && existing.userId === user.id && existing.sessionId === sessionId && existing.questionInstanceId === question) return existing;
    const key = createSubmissionKey();
    return (captureScopeRef.current = { userId: user.id, sessionId, questionInstanceId: question,
      attemptId: key, requestId: key, turnNumber: currentTurnRef.current });
  }

  function startServerStt() {
    if (serverSttRef.current) {
      // A session is already running for this turn.
      return;
    }
    const token = api.getToken() || '';
    if (!token || !STT_BACKEND_URL || !serverSttSupported()) {
      captureFailedRef.current = true;
      setTimerMessage('Audio capture is unavailable. You can save an unmeasured answer or end this interview.');
      return;
    }

    const session = new ServerSttSession({
      sessionId,
      token,
      backendUrl: STT_BACKEND_URL,
      turnNumber: currentTurnRef.current,
      evidenceScope: evidenceScope(),
      language: 'en-IN',
      onTranscript: (full) => {
        if (serverSttRef.current !== session) return;
        if (uiStateRef.current !== 'USER_LISTENING' && !captureSettlingRef.current) return;
        accumulatedTranscriptRef.current = full;
        currentTranscriptRef.current = normalizeLiveTranscript(full);
        setLiveTranscript(currentTranscriptRef.current ? `"${currentTranscriptRef.current}"` : '');
        if (currentTranscriptRef.current.trim().length > 0) {
          noteAnswerActivity(true);
        }
      },
      onStatus: (status) => {
        if (serverSttRef.current !== session) return;
        if (uiStateRef.current !== 'USER_LISTENING') return;
        if (status === 'listening') {
          setStatusText('Listening...');
        }
      },
      onError: (message) => {
        if (serverSttRef.current !== session) return;
        if (uiStateRef.current === 'USER_LISTENING') {
          setTimerMessage(message || 'Audio issue detected. Please keep speaking or press Submit Answer.');
        }
      },
    });
    serverSttRef.current = session;
    session.start().catch(() => {
      if (serverSttRef.current !== session) return;
      serverSttRef.current = null;

      captureFailedRef.current = true;
      // Keep closure/submission available if capture fails after a question was
      // already asked. This question is saved as unmeasured, never scored empty.
      setTimerMessage('Audio capture could not be started. You can save an unmeasured answer or end this interview.');
    });
  }

  async function stopServerStt(): Promise<StopResult | null> {
    const session = serverSttRef.current;
    if (!session) return null;
    // Await the final flush — stop() properly awaits in-flight sendWindow and
    // pendingFinal with a bounded timeout, so we capture the last recording
    // window's transcript instead of discarding it.
    try {
      const result = await session.stop();
      if (serverSttRef.current !== session) return result;
      serverSttRef.current = null;

      // Write the final flushed transcript into the refs so it's available
      // for submission. This is critical: without this, the last ~3s of
      // speech would be silently lost.
      if (result.transcript) {
        accumulatedTranscriptRef.current = result.transcript;
        currentTranscriptRef.current = normalizeLiveTranscript(result.transcript);
        setLiveTranscript(currentTranscriptRef.current ? `"${currentTranscriptRef.current}"` : '');
      }

      if (result.flush_status === 'timeout') {
        console.warn('[Interview] ServerSTT final flush timed out — some speech may be lost');
      }

      return result;
    } catch {
      return null;
    }
  }

  async function startListeningLoop(promptOverride = '', resetQuestionTimer = true) {
    if (answerResyncRequiredRef.current) return;
    try {
      await ensurePendingAttempt(evidenceScope());
      if (uiStateRef.current !== 'USER_LISTENING' || pendingAnswerRef.current) return;
      settledCaptureRef.current = null;
    } catch (error) {
      captureFailedRef.current = true;
      setStatusText('Recording paused: recovery storage is unavailable.');
      setTimerMessage(error instanceof Error ? error.message : 'Keep this page open and retry.');
      return;
    }
    captureFailedRef.current = false;
    captureSpeechRef.current = false;
    // The Web Speech path needs a recognition object up front; the server path
    // does not. Validate the active capture path before doing turn bookkeeping.
    if (!STT_SERVER_ENABLED) {
      const recognition = ensureRecognition();
      if (!recognition) {
        return;
      }
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

    if (STT_SERVER_ENABLED) {
      startServerStt();
    } else {
      try {
        recognitionRef.current?.start();
      } catch {
        /* no-op */
      }
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
    api.invalidateCache('/dashboard');
    
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

    setStatusText('Interview complete!');
    setTimerMessage('Preparing your detailed report...');
    appendTranscript('ai', farewellMessage);
    stopAllMedia();
    
    let navigated = false;
    const complete = () => { if (!navigated) { navigated = true; finishInterviewLocally(data); } };
    // Quick farewell: redirect after speech ends or 3s max (whichever is first)
    const fallbackTimer = window.setTimeout(() => {
      complete();
    }, 3000);

    speak(farewellMessage, () => {
      window.clearTimeout(fallbackTimer);
      complete();
    });
  }

  function terminateInterviewLocally(data: CompletedResponse) {
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

  async function settleCapture(): Promise<CaptureResult> {
    const question = assistanceInstanceRef.current;
    if (settledCaptureRef.current?.question === question) return settledCaptureRef.current.result;
    const settled = (result: CaptureResult) => {
      settledCaptureRef.current = { question, result };
      return result;
    };
    captureSettlingRef.current = true;
    transitionTo('STOPPING');
    setStatusText('Stopping recording...');
    clearSilenceTimers();
    try {
      transitionTo('TRANSCRIBING');
      setStatusText('Completing transcription...');
      const speechDetected = captureSpeechRef.current || lastAudioActivityAtRef.current > 0;
      if (STT_SERVER_ENABLED) {
        const result = await stopServerStt();
        if (result) {
          result.evidence.speech_detected = result.evidence.speech_detected || speechDetected;
          return settled({ transcript: normalizeLiveTranscript(result.transcript), evidence: result.evidence });
        }
        return settled({ transcript: currentTranscriptRef.current, evidence: { audio_bytes: 0, speech_detected: speechDetected,
          failed: true, unintelligible: false, flush_status: 'timeout' } });
      }
      const recognition = recognitionRef.current;
      if (recognition) {
        try {
          await bounded(new Promise<void>(resolve => {
            recognition.onend = () => resolve();
            try { recognition.stop(); } catch { resolve(); }
          }), 5000);
        } catch { captureFailedRef.current = true; }
        recognition.onresult = null;
        recognitionRef.current = null;
      }
      // Browser final results are authoritative; interim text remains UI text.
      await transcriptWritesRef.current;
      if (captureScopeRef.current) await flushPendingAudio(captureScopeRef.current);
      const saved = captureScopeRef.current ? await getPendingEvidence(captureScopeRef.current) : null;
      return settled({ transcript: normalizeLiveTranscript(accumulatedTranscriptRef.current), evidence: {
        audio_bytes: 0, speech_detected: speechDetected, failed: captureFailedRef.current,
        unintelligible: false, flush_status: captureFailedRef.current ? 'timeout' : 'ok',
        transcript_segments: saved?.transcriptSegments?.map(segment => ({ segment_id: segment.id, text: segment.text, captured_at: segment.capturedAt })) } });
    } finally { captureSettlingRef.current = false; clearWaveformMonitor(); setHardwareActive(false); }
  }

  function applyActiveQuestion(session: StoredSessionData) {
    if (!session.question_instance_id || !session.current_question_text || !session.turn) {
      throw new Error('Current question unavailable. Retry synchronization.');
    }
    sessionDataRef.current = session;
    setSessionData(session);
    currentTurnRef.current = session.turn;
    setCurrentTurn(session.turn);
    assistanceInstanceRef.current = session.question_instance_id;
    setCurrentQuestionInstanceId(session.question_instance_id);
    assistanceViewsRef.current!.restore(session.question_instance_id, session.current_assistance_provenance);
    setMaxTurns(session.max_turns || 0);
    pendingAnswerRef.current = null;
    captureScopeRef.current = null;
    settledCaptureRef.current = null;
    pendingSubmitKeyRef.current = '';
    submitRetryCountRef.current = 0;
    currentTranscriptRef.current = '';
    accumulatedTranscriptRef.current = '';
    setLiveTranscript('');
    setFinalizing(false);
    answerResyncRequiredRef.current = false;
    appendTranscript('ai', session.current_question_text);
    // Close the input before speech callbacks run or React commits the new render.
    transitionTo('AI_SPEAKING');
    speak(session.current_question_text);
  }

  async function resyncAnswerSession() {
    const session = sessionDataRef.current;
    if (!session) return;
    answerResyncRequiredRef.current = true;
    isSubmittingRef.current = true;
    transitionTo('SUBMITTING');
    setStatusText('Synchronizing your current question...');
    try {
      const restored = await api.getInterviewSession<StoredSessionData>(session.session_id);
      if (restored.session_id !== session.session_id) throw new Error('Interview session mismatch.');
      if (['FINISHED', 'TERMINATED'].includes(restored.state || '')) {
        sessionDataRef.current = restored;
        setSessionData(restored);
        pendingAnswerRef.current = null;
        captureScopeRef.current = null;
        transitionTo(restored.state === 'FINISHED' ? 'FINISHED' : 'TERMINATED');
        router.push(`/report/${session.session_id}`);
      } else if (restored.pending_accepted_answers?.length) {
        // Accepted work can still be processing. The recovery screen owns that state.
        sessionDataRef.current = restored;
        setSessionData(restored);
        setServerPending(restored.pending_accepted_answers);
        setPreStartOpen(true);
        transitionTo('INIT');
      } else {
        applyActiveQuestion(restored);
      }
    } catch (error) {
      // Retain local evidence, but never repost a successfully accepted/stale turn.
      transitionTo('USER_LISTENING');
      setStatusText('Current question could not be synchronized.');
      setTimerMessage(error instanceof Error ? error.message : 'Retry synchronization.');
    } finally {
      setFinalizing(false);
      isSubmittingRef.current = false;
    }
  }

  async function submitToBackend(text: string, requestKey = createSubmissionKey(), attempt = 0, endAfter = false, action?: 'SKIPPED' | 'ABORTED') {
    const activeSession = sessionDataRef.current;
    requestKey = pendingAnswerRef.current?.key || captureScopeRef.current?.requestId || requestKey;
    if (!activeSession || pendingRetryRef.current || terminationPendingRef.current || isSubmittingRef.current || (pendingAnswerRef.current && pendingAnswerRef.current.key !== requestKey) || uiStateRef.current === 'FINISHED' || uiStateRef.current === 'TERMINATED') {
      return;
    }

    if (answerResyncRequiredRef.current) {
      await resyncAnswerSession();
      return;
    }
    if (!pendingAnswerRef.current && currentTurnRef.current > 0 && uiStateRef.current !== 'USER_LISTENING') return;
    isSubmittingRef.current = true;
    // Disable input immediately; settleCapture owns the final media flush.
    transitionTo('STOPPING');
    const submittedTurn = currentTurnRef.current;
    const submittedQuestion = assistanceInstanceRef.current;
    let normalizedText = text.startsWith('[') ? text : normalizeLiveTranscript(text);
    try {
    if (!pendingAnswerRef.current) {
      const capture = submittedTurn > 0 ? await settleCapture() : null;
      if (capture) {
        const scope = evidenceScope();
        requestKey = scope.requestId;
        await flushPendingAudio(scope);
        const saved = await getPendingEvidence(scope);
        if (saved?.windows.some(window => window.transcript === null)) {
          setRecoveryRecords([saved]);
          setRecoveryError('Your audio is saved. Retry transcription before continuing.');
          setPreStartOpen(true);
          isSubmittingRef.current = false;
          setFinalizing(false);
          return;
        }
      }
      if (capture) normalizedText = capture.transcript;
      const outcome = capture ? outcomeForCapture(capture, action) : undefined;
      pendingAnswerRef.current = { key: requestKey, text: normalizedText, terminal: {
        expected_turn: submittedTurn, question_instance_id: submittedQuestion,
        terminal_outcome: outcome === 'EVALUATED' ? undefined : outcome,
        capture_evidence: capture?.evidence, end_after_answer: endAfter,
      }, elapsedSeconds: Math.max(0, Math.floor((getTimestamp() - startTimeRef.current) / 1000)),
        answerDurationSeconds: questionStartAtRef.current ? Math.max(0, Math.round((getTimestamp() - questionStartAtRef.current) / 1000)) : undefined };
      if (outcome === 'TRANSCRIPTION_FAILED') setTimerMessage('Transcription could not be completed. This answer will remain unmeasured.');
    }
    normalizedText = pendingAnswerRef.current.text;
    endAfter = pendingAnswerRef.current.terminal.end_after_answer || false;
    if (pendingAnswerRef.current.terminal.expected_turn > 0) await savePendingAnswer(evidenceScope(), pendingAnswerRef.current);
    } catch (error) {
      isSubmittingRef.current = false;
      setFinalizing(false);
      transitionTo('USER_LISTENING');
      setStatusText('Your answer has not been sent. Keep this page open.');
      setTimerMessage(error instanceof Error ? error.message : 'Recovery storage failed. Retry saving your answer.');
      return;
    }

    isSubmittingRef.current = true;
    pendingSubmitKeyRef.current = requestKey;
    transitionTo(endAfter ? 'FINALIZING' : 'SUBMITTING');
    setFinalizing(endAfter);
    if (endAfter) setStatusText('Finalizing interview...');
    if (pendingAnswerRef.current.terminal.terminal_outcome === 'TRANSCRIPTION_FAILED') {
      setStatusText(endAfter ? 'Finalizing interview...' : 'Saving unmeasured answer...');
      setTimerMessage('Transcription could not be completed. This question will not be scored.');
    }
    if (normalizedText && !normalizedText.startsWith('[') && attempt === 0 && !isRepeatRequest(normalizedText)) {
      appendTranscript('user', normalizedText);
    }

    let receivedSuccess = false;
    try {
      await assistanceViewsRef.current!.settle(pendingAnswerRef.current.terminal.question_instance_id);
      const response = await api.submitAnswer<SubmitResponse>(
        activeSession.session_id,
        normalizedText,
        activeSession.access_token,
        pendingAnswerRef.current.elapsedSeconds,
        requestKey,
        pendingAnswerRef.current.answerDurationSeconds,
        pendingAnswerRef.current.terminal,
      );

      receivedSuccess = true;
      if (pendingAnswerRef.current.terminal.expected_turn > 0) {
        const scope = evidenceScope();
        if (!matchesEvidenceAck(scope, response.evidence_ack)) throw new Error('The acceptance receipt could not be verified. Synchronizing your interview; saved evidence is retained.');
        await acknowledgePendingEvidence(scope, response.evidence_ack!);
      }

      pendingSubmitKeyRef.current = '';
      lastCompletedQuestionRef.current = pendingAnswerRef.current.terminal.question_instance_id || null;
      pendingAnswerRef.current = null;
      captureScopeRef.current = null;
      setFinalizing(false);
      submitRetryCountRef.current = 0;

      if (response.action === 'accepted') {
        setPreStartOpen(true);
        setBooting(true);
        setSessionLoadAttempt(value => value + 1);
        return;
      }

      if (response.action === 'continue') {
        if (response.answer_quality_hint) pendingQualityHintRef.current = response.answer_quality_hint;
        applyActiveQuestion({ ...activeSession, state: 'ACTIVE', turn: response.turn,
          max_turns: response.max_turns, question_instance_id: response.question_instance_id,
          current_question_text: response.text, current_assistance_provenance: null });
        return;
      }

      if (response.action === 'finish') {
        closeInterviewWithFarewell(response);
        return;
      }

      terminateInterviewLocally(response);
    } catch (error) {
      isSubmittingRef.current = false;

      const status = (error as Error & { status?: number }).status;
      if (receivedSuccess || (status !== undefined && status >= 200 && status < 300)
          || (status === 409 && error instanceof Error && error.message === 'This question has already advanced.')) {
        await resyncAnswerSession();
        return;
      }

      // Don't retry on client errors (4xx) — the request itself is wrong
      const isClientError = status !== undefined && status >= 400 && status < 500;
      // Don't retry on quota exceeded or auth errors
      const isNonRetryable = status === 402 || status === 401 || status === 403;

      if (isNonRetryable || isClientError) {
        setFinalizing(false);
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
        // A stable request-key hash spreads concurrent clients across the retry
        // window without introducing an impure random call in the component.
        const jitter = Array.from(requestKey).reduce(
          (hash, character) => ((hash * 31) + character.charCodeAt(0)) % 300,
          attempt * 97,
        );
        const delay = SUBMIT_BASE_DELAY_MS * Math.pow(2, attempt) + jitter; // 500–800, 1000–1300, 2000–2300
        setStatusText(`Network slow. Retrying your answer (${attempt + 1}/${MAX_SUBMIT_RETRIES})...`);
        setTimerMessage('Holding your answer and retrying now...');
        const retryPayload = pendingAnswerRef.current;
        window.setTimeout(() => {
          if (!retryPayload || pendingAnswerRef.current !== retryPayload || answerResyncRequiredRef.current) return;
          void submitToBackend(normalizedText, requestKey, attempt + 1, endAfter, action);
        }, delay);
        return;
      }

      // All retries exhausted — restore transcript so user doesn't lose their answer
      pendingSubmitKeyRef.current = '';
      setStatusText('Response delayed. Restoring your answer now...');
      setTimerMessage(error instanceof Error ? error.message : 'Network error. Your answer is preserved.');
      setFinalizing(false);
      transitionTo('USER_LISTENING');
      currentTranscriptRef.current = normalizedText;
      accumulatedTranscriptRef.current = normalizedText;
      setLiveTranscript(normalizedText ? `"${normalizedText}"` : '');
    } finally {
      isSubmittingRef.current = false;
    }
  }

  async function hardTerminate(reason: string) {
    const activeSession = sessionDataRef.current;
    if (isSubmittingRef.current) {
      setTerminationRetry(reason);
      setStatusText('Saving your current answer before closing the session.');
      return;
    }
    if (
      !activeSession ||
      terminationPendingRef.current ||
      uiStateRef.current === 'FINISHED' ||
      uiStateRef.current === 'TERMINATED'
    ) {
      return;
    }

    terminationPendingRef.current = true;
    setFinalizing(true);
    const capture = await settleCapture();

    clearSilenceTimers();
    stopRecognition();
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
    }

    setStatusText('Security violation detected...');
    setTimerMessage('');

    try {
      await assistanceViewsRef.current!.settle(currentQuestionInstanceId);
      const preserved = await preserveBeforeSessionAction(capture);
      const elapsedSeconds = Math.floor((getTimestamp() - startTimeRef.current) / 1000);
      const response = await api.terminateInterview<CompletedResponse>(
        activeSession.session_id,
        activeSession.access_token,
        reason,
        elapsedSeconds,
        { user_text: preserved?.text ?? capture.transcript, question_instance_id: preserved?.terminal.question_instance_id ?? currentQuestionInstanceId,
          capture_evidence: preserved?.terminal.capture_evidence ?? capture.evidence },
      );
      terminateInterviewLocally(response);
    } catch {
      // Keep the frozen session recoverable until the server confirms closure.
      setFinalizing(false);
      setTerminationRetry(reason);
      transitionTo('FINALIZING');
      setStatusText('Session closure could not be saved.');
      setTimerMessage('Retry to finish saving this session.');
    }
  }
  async function preserveBeforeSessionAction(capture: CaptureResult, action?: 'ABORTED') {
    const session = sessionDataRef.current;
    if (!session || currentTurnRef.current < 1) return;
    const scope = evidenceScope();
    const acceptedAction = acceptedSessionActionRef.current;
    if (acceptedAction && acceptedAction.scope.userId === scope.userId && matchesEvidenceAck(scope, acceptedAction.ack)) return acceptedAction.payload;
    await flushPendingAudio(scope);
    const saved = await getPendingEvidence(scope);
    if (saved?.windows.some(window => window.transcript === null)) {
      setRecoveryRecords([saved]);
      setPreStartOpen(true);
      throw new Error('Your audio is saved. Recover its transcription before closing this question.');
    }
    const outcome = outcomeForCapture(capture, action);
    const payload = pendingAnswerRef.current || { key: scope.requestId, text: capture.transcript,
      terminal: { expected_turn: scope.turnNumber, question_instance_id: scope.questionInstanceId,
        terminal_outcome: outcome === 'EVALUATED' ? undefined : outcome, capture_evidence: capture.evidence } };
    pendingAnswerRef.current = payload;
    await savePendingAnswer(scope, payload);
    const result = await api.acceptAnswer<SubmitResponse>(sessionId, { user_text: payload.text, access_token: session.access_token,
      client_request_id: payload.key, duration_actual: payload.elapsedSeconds, answer_duration_seconds: payload.answerDurationSeconds,
      ...payload.terminal });
    if (!matchesEvidenceAck(scope, result.evidence_ack)) throw new Error('Durable acceptance has not been confirmed. Your answer remains saved.');
    acceptedSessionActionRef.current = { scope, payload, ack: result.evidence_ack! };
    await acknowledgePendingEvidence(scope, result.evidence_ack!);
    pendingAnswerRef.current = null;
    return payload;
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

  async function recoverSavedAnswer(local?: PendingInterviewEvidence, accepted?: ServerPendingAnswer) {
    const session = sessionDataRef.current;
    if (!session || !user?.id || recoveryBusy || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setRecoveryBusy(true);
    let receivedSuccess = false;
    setRecoveryError('');
    try {
      let payload: PendingAnswerPayload;
      let scope: EvidenceScope;
      if (local) {
        scope = local.scope;
        if (scope.userId !== user.id || scope.sessionId !== sessionId) throw new Error('This saved answer belongs to another session.');
        let record = await getPendingEvidence(scope);
        if (!record) throw new Error('Saved answer is no longer available. Reload the session to confirm acceptance.');
        if (!record.answer) {
          const recovered = await retryPendingTranscription({ scope, backendUrl: STT_BACKEND_URL, token: api.getToken() || '', language: 'en-IN' });
          record = recovered.record;
          if (record.windows.some(window => window.transcript === null)) throw new Error('Your audio remains saved. Transcription is unavailable; retry when the connection returns.');
          const outcome = outcomeForCapture(recovered);
          payload = { key: scope.requestId, text: recovered.transcript, terminal: { expected_turn: scope.turnNumber,
            question_instance_id: scope.questionInstanceId, terminal_outcome: outcome === 'EVALUATED' ? undefined : outcome,
            capture_evidence: recovered.evidence } };
          await savePendingAnswer(scope, payload);
        } else payload = record.answer;
      } else if (accepted) {
        const request = accepted.request;
        scope = { userId: user.id, sessionId, questionInstanceId: accepted.evidence_ack.question_instance_id,
          attemptId: request.client_request_id, requestId: request.client_request_id, turnNumber: request.expected_turn };
        payload = { text: request.user_text, key: request.client_request_id, elapsedSeconds: request.duration_actual,
          answerDurationSeconds: request.answer_duration_seconds, terminal: { expected_turn: request.expected_turn,
            question_instance_id: request.question_instance_id, terminal_outcome: request.terminal_outcome,
            capture_evidence: request.capture_evidence, end_after_answer: request.end_after_answer } };
      } else return;
      const result = await api.submitAnswer<SubmitResponse>(sessionId, payload.text, session.access_token, payload.elapsedSeconds,
        payload.key, payload.answerDurationSeconds, payload.terminal);
      receivedSuccess = true;
      if (!matchesEvidenceAck(scope, result.evidence_ack)) throw new Error('Durable acceptance has not been confirmed. Your saved answer is retained.');
      if (local) await acknowledgePendingEvidence(scope, result.evidence_ack!);
      pendingAnswerRef.current = null;
      captureScopeRef.current = null;
      setRecoveryRecords([]);
      setServerPending([]);
      if (result.action === 'accepted' && result.processing_state === 'PENDING') setRecoveryError('Your answer is safely accepted. Processing is delayed; retry to continue.');
      // A replay may refer to an earlier turn. Always fetch the authoritative current question.
      setBooting(true);
      setSessionLoadAttempt(value => value + 1);
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (receivedSuccess || (status !== undefined && status >= 200 && status < 300)
          || (status === 409 && error instanceof Error && error.message === 'This question has already advanced.')) {
        // Refresh the recovery inventory/current turn; keep unacknowledged local evidence.
        setBooting(true);
        setSessionLoadAttempt(value => value + 1);
      } else {
        setRecoveryError(error instanceof Error ? error.message : 'Recovery failed. Your saved evidence is retained.');
      }
    } finally { setRecoveryBusy(false); isSubmittingRef.current = false; }
  }

  async function handleStartInterview() {
    if (!sessionDataRef.current || startupLoading || recoveryRecords.length || serverPending.length) {
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

    if (currentTurnRef.current > 0 && lastQuestionRef.current) {
      // Resume the already-open question after the microphone gesture.
      speak(lastQuestionRef.current);
    } else {
      void submitToBackend('');
    }
  }

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user?.id) {
      router.push('/login');
      return;
    }

    let cancelled = false;
    const fetchSession = async () => {
      try {
        // Session storage contains setup data, not the current turn.
        const restored = await api.getInterviewSession<StoredSessionData>(sessionId);
        if (cancelled) return;
        if (!restored || restored.session_id !== sessionId) throw new Error('Session unavailable');
        const pending = (await listPendingEvidence(user.id, sessionId)).filter(record => record.answer || record.windows.length || record.transcriptSegments?.length);
        if (cancelled) return;
        const accepted = restored.pending_accepted_answers || [];
        setRecoveryRecords(pending);
        setServerPending(accepted.filter(item => !pending.some(record => record.scope.requestId === item.evidence_ack.client_request_id)));
        setPreStartOpen(true);
        if (restored.state && restored.state !== 'ACTIVE' && !pending.length && !accepted.length) {
          router.replace(`/report/${sessionId}`);
          return;
        }
        const turn = restored.turn || 0;
        if (restored.state === 'ACTIVE' && turn > 0 && (!restored.current_question_text || !restored.question_instance_id)) {
          throw new Error('Current question unavailable');
        }
        sessionStorage.setItem('pv_interview_session', JSON.stringify(restored));
        sessionDataRef.current = restored;
        setSessionData(restored);
        answerResyncRequiredRef.current = false;
        setMaxTurns(restored.max_turns || 0);
        currentTurnRef.current = turn;
        setCurrentTurn(turn);
        if (restored.question_instance_id) {
          assistanceViewsRef.current!.restore(restored.question_instance_id, restored.current_assistance_provenance);
        }
        assistanceInstanceRef.current = restored.question_instance_id || null;
        setCurrentQuestionInstanceId(restored.question_instance_id || null);
        lastQuestionRef.current = restored.current_question_text || '';
        if (restored.current_question_text) {
          setTranscriptLog([{ id: `restored-${restored.question_instance_id}`, role: 'ai', text: restored.current_question_text }]);
        }
        globalSecondsRef.current = 0;
        setClockLabel('00:00');
        setTimerUrgent(false);
        setUiState('INIT');
        setPageError('');
        setBooting(false);
      } catch {
        if (cancelled) return;
        setPageError('Your interview could not be restored. Retry to load the saved question.');
        setUiState('ERROR');
        setBooting(false);
      }
    };
    void fetchSession();
    return () => { cancelled = true; };
  }, [authLoading, router, sessionId, user?.id, sessionLoadAttempt]);

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

      // Seal the active turn on unmount so late provider callbacks cannot write
      // into a page that has navigated away, and always release its microphone.
      const serverSession = serverSttRef.current;
      serverSttRef.current = null;
      if (serverSession) void serverSession.stop();
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
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
    void submitToBackend(pendingAnswerRef.current?.text ?? spokenText, pendingAnswerRef.current?.key || createSubmissionKey());
  };

  const handleEndInterview = () => {
    setEndInterviewOpen(true);
  };

  const handleConfirmEndInterview = async () => {
    if (isSubmittingRef.current || pendingAnswerRef.current || pendingRetryRef.current) return;
    setEndInterviewOpen(false);
    setFinalizing(true);
    clearGlobalClock();
    // Capture settles before the final answer is persisted and the session ends.
    await submitToBackend(currentTranscriptRef.current, createSubmissionKey(), 0, true);
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
            <button type="button" className={styles.actionButton} onClick={() => { setBooting(true); setSessionLoadAttempt(value => value + 1); }}>Retry restoring interview</button>
            <Link href="/interview/setup" className={styles.secondaryButton}>Start New Interview</Link>
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
            <div className={styles.scoreBox}><ScoreSummary value={resultData.final_score} measurement={resultData} /></div>
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
                      ...(resultData.strengths.length ? resultData.strengths : ['Not enough measured evidence to identify strengths.']),
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
                      ...(resultData.weaknesses.length ? resultData.weaknesses : ['Not enough measured evidence to identify an improvement area.']),
                    ].filter((item, index, array) => array.indexOf(item) === index)).map(item => (
                      <li key={`weakness-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* ── Interview Assistance Summary ───────────────────────── */}
            {assistanceEnabled ? (
              <div style={{ margin: '16px 0', padding: '16px', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)', backgroundColor: 'rgba(59,130,246,0.03)' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Guided Interview Mode</h3>
                <div style={{ fontSize: '13px', color: 'rgba(100,116,139,0.8)', marginBottom: '8px' }}>
                  This session used Guided Interview Assistance. Your full report includes a detailed breakdown of which questions were answered independently and which used hints or answer guidance.
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(100,116,139,0.6)', textAlign: 'center' }}>
                  Assisted responses are valuable learning evidence, but PrepVista keeps them separate from independent answers.
                </div>
              </div>
            ) : null}

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
                  <div className={styles.scoreBox}><ScoreSummary value={resultData.final_score} measurement={resultData} /></div>
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
                <button type="button" className={styles.forceButton}
                  disabled={uiState !== 'USER_LISTENING' || finalizing || !!pendingRetryRef.current}
                  onClick={handleManualSubmit}>{answerResyncRequiredRef.current ? 'Retry synchronization' : pendingAnswerRef.current ? 'Retry saved answer' : 'Submit Answer'}</button>
                {uiState === 'USER_LISTENING' ? (
                  <>
                    <button type="button" className={styles.forceButton} disabled={finalizing || !!pendingRetryRef.current || uiState !== 'USER_LISTENING'} onClick={() => void submitToBackend('', createSubmissionKey(), 0, false, 'SKIPPED')}>Skip question</button>
                    <button type="button" className={styles.forceButton} disabled={finalizing || assistanceLoading || !!pendingAnswerRef.current} onClick={() => void handleAskMeAgain()}>{pendingRetryRef.current ? 'Retry Ask Me Again' : 'Ask Me Again'}</button>
                    {assistanceEnabled ? (
                      <>
                        <button
                          type="button"
                          className={styles.endButton}
                          style={{ opacity: assistanceLoading ? 0.6 : 1 }}
                          disabled={assistanceLoading || finalizing || !!pendingAnswerRef.current || !!pendingRetryRef.current}
                          onClick={() => requestAssistance('hint')}
                          aria-label="Get Hint"
                        >
                          💡 Hint
                        </button>
                        <button
                          type="button"
                          className={styles.endButton}
                          style={{ opacity: assistanceLoading ? 0.6 : 1 }}
                          disabled={assistanceLoading || finalizing || !!pendingAnswerRef.current || !!pendingRetryRef.current}
                          onClick={() => requestAssistance('guided_approach')}
                          aria-label="Guided Approach"
                        >
                          🧭 Guided Approach
                        </button>
                        <button
                          type="button"
                          className={styles.endButton}
                          style={{ opacity: assistanceLoading ? 0.6 : 1 }}
                          disabled={assistanceLoading || finalizing || !!pendingAnswerRef.current || !!pendingRetryRef.current}
                          onClick={() => requestAssistance('sample_answer')}
                          aria-label="Sample Answer"
                        >
                          📝 Sample Answer
                        </button>
                      </>
                    ) : null}
                    <button type="button" className={styles.endButton} disabled={finalizing || !!pendingRetryRef.current} onClick={handleEndInterview}>End Interview</button>
                  </>
                ) : null}
              </div>

              {/* ── Guided Assistance Panel ──────────────────────────────── */}
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
                  {/* Assistance status label */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(59,130,246,0.8)' }}>
                      PrepVista Guidance
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

                  {assistanceError ? <div role="alert">{assistanceError}{displayedAssistance ? <button type="button" onClick={() => void acknowledgeDisplayedAssistance(displayedAssistance)}>Retry view acknowledgement</button> : null}</div> : null}
                  {activeAssistance?.instance === currentQuestionInstanceId && !assistanceLoading ? (
                    <section aria-label={activeAssistance.mode === 'hint' ? 'Hint content' : activeAssistance.mode === 'guided_approach' ? 'Guided Approach content' : 'Sample Answer content'}>
                      <h3>{activeAssistance.mode === 'hint' ? 'Hint' : activeAssistance.mode === 'guided_approach' ? 'Guided Approach' : 'Sample Answer'}</h3>
                      <p style={{ whiteSpace: 'pre-wrap' }}>{activeAssistance.content}</p>
                      {activeAssistance.why_it_works?.length ? (
                        <ul>{activeAssistance.why_it_works.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
                      ) : null}
                    </section>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setAssistancePanelOpen(false)}
                    style={{ position: 'absolute', top: '8px', right: '12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'rgba(100,116,139,0.6)' }}
                    aria-label="Collapse guidance panel"
                  >
                    ×
                  </button>
                </div>
              ) : null}

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
              <h2>{recoveryRecords.length || serverPending.length ? 'Recover your saved answer' : 'Security Check'}</h2>
              {recoveryRecords.length || serverPending.length ? <div>
                <p>Saved answers keep their original question identity. Recover them before continuing this interview.</p>
                {recoveryRecords.map(record => <button key={record.key} type="button" className={styles.actionButton} disabled={recoveryBusy}
                  onClick={() => void recoverSavedAnswer(record)}>Recover saved answer · Question {record.scope.turnNumber}</button>)}
                {serverPending.map(record => <button key={record.evidence_ack.client_request_id} type="button" className={styles.actionButton} disabled={recoveryBusy}
                  onClick={() => void recoverSavedAnswer(undefined, record)}>Continue accepted answer · Question {record.request.expected_turn}</button>)}
              </div> : <>
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
                  {startupLoading ? 'Securing Session...' : currentTurn > 0 ? 'Resume Interview' : 'Validate And Start Session'}
                </button>
              </div>
              </>}
              {recoveryError ? <div role="alert" className={styles.modalError}>{recoveryError}</div> : null}
              {startupError ? <div className={styles.modalError}>{startupError}</div> : null}
            </div>
          </div>
        ) : null}

        

        {terminationRetry ? (
          <div role="alert">
            <p>Session closure could not be saved. Your session is preserved.</p>
            <button type="button" disabled={finalizing} onClick={() => {
              terminationPendingRef.current = false;
              setTerminationRetry('');
              void hardTerminate(terminationRetry);
            }}>Retry session closure</button>
          </div>
        ) : null}
        <ConfirmDialog
          open={endInterviewOpen}
          title="End interview early?"
          description="You can stop now and PrepVista will evaluate the answers completed so far. If you want a fuller report, continue with the interview."
          confirmLabel="End interview now"
          confirmTone="danger"
          loading={finalizing}
          onCancel={() => setEndInterviewOpen(false)}
          onConfirm={handleConfirmEndInterview}
        />
      </div>
    </div>
  );
}
