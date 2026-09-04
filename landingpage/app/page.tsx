"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BrainCircuit,
  BriefcaseBusiness,
  CalendarRange,
  Check,
  ChevronRight,
  Clapperboard,
  CircleAlert,
  CircleDotDashed,
  Code2,
  Compass,
  Crosshair,
  Eye,
  FastForward,
  Fingerprint,
  GraduationCap,
  Gauge,
  LockKeyhole,
  MailCheck,
  Mic,
  MousePointer2,
  Orbit,
  Pause,
  Play,
  Route,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Split,
  Sparkles,
  Square,
  Target,
  TimerReset,
  Trophy,
  UserRoundSearch,
  Volume2,
  Waypoints,
  Workflow,
  X,
  Zap,
} from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type RoleId = "software" | "data" | "core" | "analyst" | "unsure"
type RoundKey = "aptitude" | "technical" | "communication" | "interview"
type Audience = "student" | "professional"
type FilmId = "route" | "repair" | "twin"

type JourneyGate = {
  stage: string
  verb: string
  demand: string
  signal: string
  risk: string
  proof: string
}

type Role = {
  id: RoleId
  index: string
  name: string
  short: string
  description: string
  stages: string[]
  capabilities: string[]
}

type RoundResult = {
  round: RoundKey
  label: string
  status: "demonstrated" | "uncertain" | "focus"
  strongest: string
  focus: string
  evidence: string[]
  mission: string
}

const journeyBlueprints: Record<RoleId, JourneyGate[]> = {
  software: [
    { stage: "Aptitude screen", verb: "DECIDE", demand: "Choose a sound path before the timer changes your judgement.", signal: "Decision time · answer changes · confidence", risk: "A correct first path is abandoned under pressure.", proof: "Accuracy transfers to a changed problem under a tighter timer." },
    { stage: "Coding assessment", verb: "BUILD", demand: "Make the solution survive edge cases, scale and hidden tests.", signal: "Correctness · complexity · edge-case behaviour", risk: "Sample tests pass while the approach collapses at scale.", proof: "The solution survives new constraints and the reasoning remains clear." },
    { stage: "Technical round", verb: "EXPLAIN", demand: "Turn working code into a decision another engineer can trust.", signal: "Why · alternative · complexity · trade-off", risk: "The answer is correct, but ownership of the reasoning is unclear.", proof: "The same approach can be defended against a credible alternative." },
    { stage: "Project defence", verb: "DEFEND", demand: "Prove what you owned, what failed and what changed because of you.", signal: "Ownership · failure · evidence · depth", risk: "A strong project sounds generic after the second follow-up.", proof: "Personal decisions remain specific under why, failure and evidence probes." },
    { stage: "Final conversation", verb: "CONNECT", demand: "Connect your evidence to the role, team and work ahead.", signal: "Role clarity · judgement · professional communication", risk: "Motivation sounds rehearsed instead of role-specific.", proof: "The final story uses evidence from the work—not unsupported confidence." },
  ],
  data: [
    { stage: "Quant screen", verb: "INTERPRET", demand: "Read the condition correctly before calculating quickly.", signal: "Assumptions · variable interpretation · confidence", risk: "Fast arithmetic answers the wrong question.", proof: "The interpretation holds when the wording and data shape change." },
    { stage: "SQL / Python", verb: "TRANSFORM", demand: "Produce a correct result without hiding leakage, nulls or scale risk.", signal: "Data quality · correctness · computational cost", risk: "The output looks right while the pipeline is not trustworthy.", proof: "The solution survives a changed dataset and explains its assumptions." },
    { stage: "Data case", verb: "FRAME", demand: "Turn an ambiguous business question into a measurable analysis.", signal: "Problem framing · metric choice · prioritisation", risk: "Analysis starts before the decision and success measure are clear.", proof: "The candidate can defend the metric and what it does not capture." },
    { stage: "Model defence", verb: "CHALLENGE", demand: "Explain the model, limitation, experiment and failure boundary.", signal: "Validation · trade-offs · bias · limitations", risk: "A model choice sounds impressive but cannot survive scrutiny.", proof: "Performance, baseline, limitations and monitoring are defended together." },
    { stage: "Final conversation", verb: "TRANSLATE", demand: "Connect technical evidence to a decision people can act on.", signal: "Impact · clarity · stakeholder judgement", risk: "Technical depth never becomes business relevance.", proof: "The recommendation stays precise for both technical and nontechnical listeners." },
  ],
  core: [
    { stage: "Aptitude screen", verb: "CALCULATE", demand: "Hold accuracy while time, units and assumptions compete for attention.", signal: "Unit discipline · pacing · verification", risk: "A small interpretation error contaminates the full solution.", proof: "The method transfers across changed values and units." },
    { stage: "Fundamentals", verb: "RECALL", demand: "Retrieve the principle and explain why it applies here.", signal: "Concept retrieval · causal explanation", risk: "A memorised definition cannot guide a real engineering decision.", proof: "The principle is applied correctly in an unfamiliar scenario." },
    { stage: "Technical round", verb: "APPLY", demand: "Move from equations and theory to constraints, safety and behaviour.", signal: "Assumptions · constraints · engineering judgement", risk: "The calculation is right but the real-world boundary is missing.", proof: "The decision remains safe when one operating condition changes." },
    { stage: "Application case", verb: "DIAGNOSE", demand: "Trace the symptom to a cause before proposing a fix.", signal: "Root cause · test plan · failure evidence", risk: "The candidate jumps to a familiar fix without validating the cause.", proof: "The diagnosis is verified through a relevant test or observation." },
    { stage: "Final conversation", verb: "OWN", demand: "Show dependable judgement, learning and responsibility.", signal: "Safety · ownership · communication", risk: "Strong knowledge is disconnected from professional responsibility.", proof: "The candidate explains a decision, its consequence and what they learned." },
  ],
  analyst: [
    { stage: "Quant screen", verb: "REASON", demand: "Reach the right conclusion without losing the business condition.", signal: "Quant logic · pacing · confidence", risk: "A fast answer overlooks the condition that changes the decision.", proof: "The reasoning transfers to a new data representation." },
    { stage: "Data case", verb: "QUESTION", demand: "Find the decision hidden inside an ambiguous dataset.", signal: "Question quality · metric choice · segmentation", risk: "A polished dashboard answers a question nobody needed.", proof: "The analysis connects each metric to a decision or action." },
    { stage: "Communication round", verb: "SYNTHESISE", demand: "Make the important signal visible without narrating every chart.", signal: "Prioritisation · structure · audience clarity", risk: "Good analysis becomes difficult to understand and act on.", proof: "The recommendation is clear in one minute and defensible in ten." },
    { stage: "Case defence", verb: "DEFEND", demand: "Explain assumptions, alternatives and what could invalidate the conclusion.", signal: "Assumptions · trade-offs · counter-evidence", risk: "The recommendation breaks when one premise is challenged.", proof: "The conclusion changes appropriately when new evidence arrives." },
    { stage: "Stakeholder final", verb: "INFLUENCE", demand: "Adapt the same evidence for different priorities and objections.", signal: "Stakeholder judgement · clarity · composure", risk: "The analysis is right but cannot create alignment.", proof: "The candidate handles resistance without losing the decision logic." },
  ],
  unsure: [
    { stage: "Direction baseline", verb: "NOTICE", demand: "See which kinds of work create energy, evidence and repeatable strength.", signal: "Interest · performance · learning speed", risk: "A role is chosen from pressure, trend or title alone.", proof: "Interest and performance remain aligned across more than one task." },
    { stage: "Reasoning sample", verb: "SOLVE", demand: "Observe how you approach unfamiliar problems—not only whether you finish.", signal: "Strategy · persistence · transfer", risk: "One weak topic is mistaken for a weak career direction.", proof: "The reasoning pattern repeats across different domains." },
    { stage: "Role simulation", verb: "TRY", demand: "Experience a small but realistic task from several role families.", signal: "Task fit · capability evidence · learning response", risk: "The role sounds attractive but the actual work feels wrong.", proof: "The candidate can compare evidence from real task samples." },
    { stage: "Communication sample", verb: "EXPLAIN", demand: "Make your thinking visible so strengths are not trapped inside the answer.", signal: "Structure · ownership · clarity", risk: "Potential is underestimated because the reasoning stays hidden.", proof: "A listener can follow the decision without reconstructing it." },
    { stage: "Direction decision", verb: "CHOOSE", demand: "Select a path with evidence and a reversible next experiment.", signal: "Self-awareness · evidence · next action", risk: "Uncertainty becomes endless preparation without direction.", proof: "The next role experiment has a clear question and proof standard." },
  ],
}

const filmLibrary: Record<FilmId, {
  eyebrow: string
  title: string
  body: string
  takeaway: string
  src: string
  poster: string
}> = {
  route: {
    eyebrow: "FILM 01 / THE ROUTE",
    title: "One career route. Five different tests of you.",
    body: "Watch a software-engineer route move from time pressure to code scale, technical explanation and deeper defence. Each gate needs different evidence.",
    takeaway: "PrepVista should locate the gate at risk before the route reaches it.",
    src: "/films/career-route.mp4",
    poster: "/films/career-route.webp",
  },
  repair: {
    eyebrow: "FILM 02 / THE REPAIR",
    title: "A strong idea can still disappear inside a weak answer.",
    body: "A fragmented response becomes a focused retry using Problem → My decision → Why → Result, then faces a changed prompt before improvement is accepted.",
    takeaway: "The product develops the behaviour; it does not stop at describing it.",
    src: "/films/live-repair.mp4",
    poster: "/films/live-repair.webp",
  },
  twin: {
    eyebrow: "FILM 03 / THE DECISION",
    title: "Many attempts should become one useful career decision.",
    body: "Aptitude, technical, communication and interview signals converge around the target role, reveal the current weak link and create one next mission.",
    takeaway: "The Placement Twin moves only when the candidate produces new evidence.",
    src: "/films/evidence-twin.mp4",
    poster: "/films/evidence-twin.webp",
  },
}

const roleRouteFilms: Record<RoleId, (typeof filmLibrary)[FilmId]> = {
  software: filmLibrary.route,
  data: {
    eyebrow: "FILM 01 / DATA + AI ROUTE",
    title: "A data career tests interpretation, transformation, framing and model defence.",
    body: "Watch the evidence change from assumptions and data quality to metric choice, limitations and decision impact.",
    takeaway: "The same generic journey cannot prepare every candidate for a Data or AI role.",
    src: "/films/data-route.mp4",
    poster: "/films/data-route.webp",
  },
  core: {
    eyebrow: "FILM 01 / CORE ENGINEERING ROUTE",
    title: "A core-engineering route moves from calculation to safe applied judgement.",
    body: "The gates change from units and fundamentals to constraints, diagnosis, safety and ownership.",
    takeaway: "PrepVista must connect theory to the condition in which an engineering decision is used.",
    src: "/films/core-route.mp4",
    poster: "/films/core-route.webp",
  },
  analyst: {
    eyebrow: "FILM 01 / ANALYST ROUTE",
    title: "An analyst is tested on the decision—not only the dashboard.",
    body: "The route moves through quantitative conditions, question quality, synthesis, assumption defence and stakeholder influence.",
    takeaway: "Good analysis becomes career evidence only when another person can act on it.",
    src: "/films/analyst-route.mp4",
    poster: "/films/analyst-route.webp",
  },
  unsure: {
    eyebrow: "FILM 01 / DIRECTION ROUTE",
    title: "Not knowing the role yet should lead to experiments—not a generic course pile.",
    body: "The route compares energy, performance, learning response, task evidence and communication before choosing the next role experiment.",
    takeaway: "Career direction becomes stronger when it is based on task evidence rather than pressure or trend.",
    src: "/films/explore-route.mp4",
    poster: "/films/explore-route.webp",
  },
}

const roles: Role[] = [
  {
    id: "software",
    index: "01",
    name: "Software Engineer",
    short: "Software",
    description: "Reasoning, code, technical depth and project defence.",
    stages: ["Aptitude", "Coding", "Technical", "Project defence", "Final"],
    capabilities: ["Problem solving", "Code reasoning", "Trade-offs"],
  },
  {
    id: "data",
    index: "02",
    name: "Data / AI Professional",
    short: "Data / AI",
    description: "Data reasoning, implementation, evidence and model defence.",
    stages: ["Aptitude", "SQL / Python", "Case", "Model defence", "Final"],
    capabilities: ["Data reasoning", "Experiment design", "Evidence"],
  },
  {
    id: "core",
    index: "03",
    name: "Core Engineer",
    short: "Core",
    description: "Domain fundamentals, applied decisions and technical clarity.",
    stages: ["Aptitude", "Fundamentals", "Technical", "Application", "Final"],
    capabilities: ["Fundamentals", "Application", "Explanation"],
  },
  {
    id: "analyst",
    index: "04",
    name: "Business / Data Analyst",
    short: "Analyst",
    description: "Quantitative judgement, cases, communication and defence.",
    stages: ["Aptitude", "Data / case", "Communication", "Case defence", "Final"],
    capabilities: ["Quantitative logic", "Synthesis", "Communication"],
  },
  {
    id: "unsure",
    index: "05",
    name: "Not sure yet",
    short: "Explore",
    description: "Start with a broad readiness path while you explore roles.",
    stages: ["Reasoning", "Role skill", "Communication", "Interview", "Offer"],
    capabilities: ["Reasoning", "Learning agility", "Self-awareness"],
  },
]

const audienceCopy: Record<Audience, {
  label: string
  shortLabel: string
  kicker: string
  heroLead: string
  heroAccent: string
  heroEnd: string
  heroBody: string
  momentLabel: string
  momentTitle: string
  deadline: string
  trustLine: string
}> = {
  student: {
    label: "I am preparing for my first role",
    shortLabel: "First role",
    kicker: "YOUR PLACEMENT WILL TEST THE PART PRACTICE MAY HAVE MISSED",
    heroLead: "Before placement day, find the",
    heroAccent: "one capability",
    heroEnd: "most likely to block your role.",
    heroBody: "Choose the job you want, perform a short live round and see what the result alone cannot tell you. PrepVista turns how you solve, code, explain and defend into the one preparation move your career needs next.",
    momentLabel: "YOUR PLACEMENT MOMENT",
    momentTitle: "The recruiter will test what your practice never asked you to prove.",
    deadline: "placement day",
    trustLine: "No signup to explore · no invented readiness score",
  },
  professional: {
    label: "I am preparing for my next role",
    shortLabel: "Next role",
    kicker: "EXPERIENCE OPENS THE INTERVIEW · EVIDENCE CARRIES IT",
    heroLead: "Before your next interview, find the",
    heroAccent: "missing evidence",
    heroEnd: "your experience never had to prove.",
    heroBody: "Choose the role you are moving toward, perform a short live round and expose the capability most likely to weaken under deeper questions. PrepVista turns that evidence into a focused development and re-test path.",
    momentLabel: "YOUR NEXT CAREER MOVE",
    momentTitle: "The next role will question decisions your current role may never have asked you to defend.",
    deadline: "interview day",
    trustLine: "Private exploration · no resume or microphone required",
  },
}

const careerBeliefs = [
  {
    belief: "I usually score well in practice.",
    recruiter: "Can your accuracy survive a timer, uncertainty and a changed question?",
    signal: "Pressure stability",
    icon: Gauge,
  },
  {
    belief: "My code works, so I know it.",
    recruiter: "Can you defend the complexity, alternative and failure condition?",
    signal: "Technical ownership",
    icon: Code2,
  },
  {
    belief: "I communicate well enough.",
    recruiter: "Can the listener see your decision, ownership and result without assembling the story for you?",
    signal: "Communication evidence",
    icon: Volume2,
  },
  {
    belief: "I perform well in interviews.",
    recruiter: "Does the answer stay strong after the interviewer asks why, how and what failed?",
    signal: "Defence depth",
    icon: UserRoundSearch,
  },
]

const preparationContrast = [
  ["Practice more of everything", "Train the capability blocking this role"],
  ["Collect marks and completion badges", "Collect evidence that survives changed conditions"],
  ["Receive five generic recommendations", "Get one next mission with a reason"],
  ["Feel ready until the interview changes", "Know what is proven, uncertain and still risky"],
]

const roundMeta: Record<RoundKey, {
  number: string
  label: string
  promise: string
  duration: string
  icon: typeof BrainCircuit
  accent: string
}> = {
  aptitude: {
    number: "01",
    label: "Aptitude",
    promise: "Think quickly without losing accuracy.",
    duration: "60–90 sec",
    icon: BrainCircuit,
    accent: "amber",
  },
  technical: {
    number: "02",
    label: "Technical",
    promise: "Your code works. Can you defend it?",
    duration: "90 sec",
    icon: Code2,
    accent: "cobalt",
  },
  communication: {
    number: "03",
    label: "Communication",
    promise: "Can you make someone understand you?",
    duration: "60–120 sec",
    icon: Volume2,
    accent: "sky",
  },
  interview: {
    number: "04",
    label: "Interview",
    promise: "Can your answer survive deeper questions?",
    duration: "2–3 min",
    icon: Target,
    accent: "coral",
  },
}

const roundSignals: Record<RoundKey, string[]> = {
  aptitude: ["Accuracy", "Decision time", "Confidence"],
  technical: ["Scale", "Reasoning", "Trade-off"],
  communication: ["Ownership", "Structure", "Outcome"],
  interview: ["Evidence", "Depth", "Defence"],
}

const systemSteps = [
  { number: "01", title: "Observe", line: "Capture the attempt, not the student’s self-opinion.", detail: "Answers, timing, confidence, code decisions, transcripts and follow-up behaviour become inspectable evidence." },
  { number: "02", title: "Diagnose", line: "Separate the visible result from the likely cause.", detail: "PrepVista distinguishes a knowledge gap from rushing, weak evidence, unclear ownership or shallow defence." },
  { number: "03", title: "Intervene", line: "Choose one action against the current blocker.", detail: "The system prioritises a focused mission instead of sending the student back to a giant content catalogue." },
  { number: "04", title: "Practise", line: "Guide the behaviour that needs to change.", detail: "A hint, reasoning scaffold, answer structure or deeper defence sequence changes the next attempt." },
  { number: "05", title: "Re-test", line: "Ask for the same capability in a changed situation.", detail: "Improvement must transfer to a new problem, explanation or follow-up—not only repeat the guided example." },
  { number: "06", title: "Update", line: "Move the evidence, the Twin and the next action.", detail: "The readiness picture evolves only when the student produces new evidence." },
]

const aptitudePool = [
  {
    id: "ratio-01",
    category: "Ratio & work",
    question: "A team completes 3/5 of a project in 12 days at a constant rate. At the same rate, how many more days are needed to finish it?",
    options: ["6 days", "8 days", "10 days", "12 days"],
    answer: "8 days",
    explanation: "If 3/5 takes 12 days, each fifth takes 4 days. The remaining 2/5 therefore takes 8 days.",
    repairQuestion: "A machine processes 4/7 of a batch in 20 minutes. At the same rate, how many more minutes are needed?",
    repairOptions: ["10 minutes", "12 minutes", "15 minutes", "18 minutes"],
    repairAnswer: "15 minutes",
  },
  {
    id: "percent-02",
    category: "Percent change",
    question: "A value rises by 25% and then falls by 20%. Compared with the original value, what is the final change?",
    options: ["No change", "5% increase", "5% decrease", "10% increase"],
    answer: "No change",
    explanation: "Using a base of 100: a 25% rise gives 125, and a 20% fall on 125 removes 25, returning to 100.",
    repairQuestion: "A price falls by 20% and then rises by 25%. Compared with the original price, what is the final change?",
    repairOptions: ["No change", "5% increase", "5% decrease", "10% decrease"],
    repairAnswer: "No change",
  },
  {
    id: "logic-03",
    category: "Logical reasoning",
    question: "All product analysts use data. Some people who use data write code. Which conclusion must be true?",
    options: ["All product analysts write code", "Some product analysts write code", "Product analysts use data", "Everyone who writes code is an analyst"],
    answer: "Product analysts use data",
    explanation: "Only the first statement is universal: every product analyst uses data. The overlap with code users is not specified.",
    repairQuestion: "All backend engineers work with APIs. Some people who work with APIs design databases. Which conclusion must be true?",
    repairOptions: ["All backend engineers design databases", "Backend engineers work with APIs", "All API users are backend engineers", "No database designer is a backend engineer"],
    repairAnswer: "Backend engineers work with APIs",
  },
]

const faqItems = [
  { q: "Is PrepVista only for coding students?", a: "No. PrepVista connects aptitude and reasoning, technical capability, communication and interview execution. The emphasis changes with the target role." },
  { q: "Does PrepVista guarantee placement?", a: "No. PrepVista helps candidates prepare, produce readiness evidence and decide what to work on next. Employers make hiring decisions." },
  { q: "Is this short result a complete assessment?", a: "No. It summarises only the evidence you produce in this short interactive demonstration. A reliable readiness model needs repeated evidence across changed conditions." },
  { q: "Is PrepVista fully launched?", a: "PrepVista is an early-stage product with a working candidate-interview prototype. Broader aptitude, technical and communication systems are being developed and integrated." },
  { q: "Do I need a microphone or resume?", a: "No. Typed and sample paths are available. Microphone access begins only after you explicitly start it, and this landing experience does not require a resume upload." },
  { q: "How do I vote?", a: "The final Vote for PrepVista control will open the official Startupthon voting destination once the official link is connected." },
]

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

function resultClass(status: RoundResult["status"]) {
  return status === "demonstrated" ? "state-demonstrated" : status === "focus" ? "state-focus" : "state-uncertain"
}

function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`brand ${inverse ? "brand-inverse" : ""}`}>
      <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
      <span className="brand-word">PrepVista</span>
    </span>
  )
}

function EvidenceChip({ state, children }: { state: "blue" | "green" | "amber" | "coral" | "neutral"; children: React.ReactNode }) {
  return <span className={`evidence-chip evidence-${state}`}>{children}</span>
}

function AptitudeRound({ onComplete }: { onComplete: (result: RoundResult) => void }) {
  const [questionIndex] = useState(() => Math.floor(Math.random() * aptitudePool.length))
  const [phase, setPhase] = useState<"ready" | "question" | "confidence" | "result" | "repair" | "complete">("ready")
  const [selected, setSelected] = useState("")
  const [confidence, setConfidence] = useState("")
  const [repairSelected, setRepairSelected] = useState("")
  const [timeLeft, setTimeLeft] = useState(60)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (phase !== "question") return
    const timer = window.setInterval(() => {
      setTimeLeft((value) => {
        if (value <= 1) {
          window.clearInterval(timer)
          setTimedOut(true)
          setPhase("result")
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  const item = aptitudePool[questionIndex]
  const correct = selected === item.answer
  const repairCorrect = repairSelected === item.repairAnswer
  const responseTime = 60 - timeLeft

  function observation() {
    if (timedOut) return "The decision was not completed within the demonstration time."
    if (correct && confidence === "low") return "Accuracy was demonstrated; confidence was lower than the result."
    if (!correct && confidence === "high") return "A confidence mismatch appeared in this attempt."
    if (!correct && responseTime < 12) return "The answer arrived very quickly and may indicate rushing."
    if (correct && responseTime > 45) return "Accuracy was demonstrated; speed remains less certain."
    if (correct) return "This attempt was accurate with no obvious pressure signal."
    return "This attempt needs another question to separate concept, interpretation and calculation causes."
  }

  function finish() {
    const status: RoundResult["status"] = repairCorrect ? "demonstrated" : correct ? "uncertain" : "focus"
    onComplete({
      round: "aptitude",
      label: "Reasoning under pressure",
      status,
      strongest: correct ? `Solved the ${item.category.toLowerCase()} question accurately.` : `Completed a live ${item.category.toLowerCase()} attempt and exposed useful evidence.`,
      focus: repairCorrect ? "The repair transferred to a changed problem; repeat evidence is still needed." : correct ? "Accuracy appeared once; stability under changed conditions is not yet proven." : "Rebuild the reasoning step and re-test without rushing.",
      evidence: [`${timedOut ? "Timed out" : `${responseTime}s response`} · ${confidence || "confidence not captured"}`, `${correct ? "Correct" : "Incorrect"} first attempt`, `${repairCorrect ? "Transferred" : "Not yet transferred"} on repair question`],
      mission: repairCorrect ? "Solve two changed questions with the same principle under a stable time limit." : "Reconstruct the principle, explain it in one sentence, then solve a changed timed question.",
    })
  }

  return (
    <div className="challenge-body aptitude-body">
      {phase === "ready" && (
        <div className="challenge-intro">
          <div className="challenge-orbit" aria-hidden="true"><span>60</span><i /><b>?</b></div>
          <div>
            <p className="eyebrow">ROUND 01 · LIVE APTITUDE</p>
            <h3>One question. One decision.</h3>
            <p>PrepVista will capture correctness, response time and confidence—then ask you to transfer the repair.</p>
            <div className="challenge-meta-row"><EvidenceChip state="green">Reviewed question</EvidenceChip><EvidenceChip state="neutral">Session-stable</EvidenceChip><EvidenceChip state="amber">60 seconds</EvidenceChip></div>
            <Button className="primary-button dark-button" onClick={() => setPhase("question")}>Start challenge <ArrowRight /></Button>
          </div>
        </div>
      )}
      {phase === "question" && (
        <div className="question-layout">
          <div className="question-main">
            <p className="eyebrow">{item.category.toUpperCase()}</p><h3>{item.question}</h3>
            <RadioGroup value={selected} onValueChange={setSelected} className="answer-list">
              {item.options.map((option, index) => <label key={option} className={`answer-option ${selected === option ? "is-selected" : ""}`}><RadioGroupItem value={option} className="answer-radio" /><span className="answer-letter">{String.fromCharCode(65 + index)}</span><span>{option}</span></label>)}
            </RadioGroup>
            <Button className="primary-button dark-button" disabled={!selected} onClick={() => setPhase("confidence")}>Lock answer <LockKeyhole /></Button>
          </div>
          <aside className="timer-panel"><div className={`timer-dial ${timeLeft < 15 ? "timer-urgent" : ""}`}><span>{timeLeft}</span><small>SECONDS</small></div><p>Do not let the timer choose for you.</p></aside>
        </div>
      )}
      {phase === "confidence" && (
        <div className="confidence-panel">
          <p className="eyebrow">BEFORE THE RESULT</p><h3>How sure were you?</h3><p>Confidence changes the interpretation—not whether the answer is correct.</p>
          <RadioGroup value={confidence} onValueChange={setConfidence} className="confidence-options">
            {[["low", "Guessing", "I was not confident"], ["medium", "Somewhat sure", "I had a reason"], ["high", "Very sure", "I would defend it"]].map(([value, label, hint]) => <label key={value} className={`confidence-option ${confidence === value ? "is-selected" : ""}`}><RadioGroupItem value={value} className="answer-radio" /><strong>{label}</strong><span>{hint}</span></label>)}
          </RadioGroup>
          <Button className="primary-button dark-button" disabled={!confidence} onClick={() => setPhase("result")}>Reveal evidence <Eye /></Button>
        </div>
      )}
      {phase === "result" && (
        <div className="result-stage">
          <div className={`result-signal ${correct && !timedOut ? "signal-good" : "signal-focus"}`}>{correct && !timedOut ? <Check /> : <X />}</div>
          <p className="eyebrow">FIRST ATTEMPT</p>
          <h3>{timedOut ? "Time ended. The unfinished decision is the evidence." : correct ? "Correct. Now look beyond the mark." : "Incorrect. The mistake is more useful than the mark."}</h3>
          <div className="evidence-ledger three-up"><div><small>ANSWER</small><strong>{timedOut ? "Not submitted" : selected}</strong></div><div><small>TIME</small><strong>{timedOut ? "60s+" : `${responseTime}s`}</strong></div><div><small>CONFIDENCE</small><strong>{confidence || "Not captured"}</strong></div></div>
          <div className="observation-box"><span>WHAT THIS ATTEMPT SUGGESTS</span><p>{observation()}</p></div>
          <div className="reasoning-repair"><div><small>CORRECT REASONING</small><p>{item.explanation}</p></div><Button className="primary-button" onClick={() => setPhase("repair")}>Try the repair <RotateCcw /></Button></div>
        </div>
      )}
      {phase === "repair" && (
        <div className="question-layout repair-layout">
          <div className="question-main">
            <p className="eyebrow">TRANSFER QUESTION · SAME PRINCIPLE, NEW SURFACE</p><h3>{item.repairQuestion}</h3>
            <RadioGroup value={repairSelected} onValueChange={setRepairSelected} className="answer-list">
              {item.repairOptions.map((option, index) => <label key={option} className={`answer-option ${repairSelected === option ? "is-selected" : ""}`}><RadioGroupItem value={option} className="answer-radio" /><span className="answer-letter">{String.fromCharCode(65 + index)}</span><span>{option}</span></label>)}
            </RadioGroup>
            <Button className="primary-button dark-button" disabled={!repairSelected} onClick={() => setPhase("complete")}>Check transfer <ArrowRight /></Button>
          </div>
          <aside className="repair-note"><span>REPAIR PRINCIPLE</span><p>Translate the completed fraction into one equal unit before calculating what remains.</p></aside>
        </div>
      )}
      {phase === "complete" && (
        <div className="result-stage complete-stage">
          <div className={`result-signal ${repairCorrect ? "signal-good" : "signal-focus"}`}>{repairCorrect ? <Check /> : <RotateCcw />}</div>
          <p className="eyebrow">REPAIR ATTEMPT</p><h3>{repairCorrect ? "The principle transferred to a changed problem." : "The concept is still not demonstrated. Change the intervention."}</h3>
          <p className="result-caveat">One transfer attempt is useful evidence—not a complete aptitude profile.</p>
          <Button className="primary-button" onClick={finish}>Add evidence to my Twin <ArrowRight /></Button>
        </div>
      )}
    </div>
  )
}

function TechnicalRound({ onComplete }: { onComplete: (result: RoundResult) => void }) {
  const [phase, setPhase] = useState<"ready" | "question" | "defend" | "result" | "probe">("ready")
  const [choice, setChoice] = useState("")
  const [defence, setDefence] = useState("")
  const [probe, setProbe] = useState("")
  const correct = choice === "Repeated list membership makes the loop quadratic"
  const normalized = defence.toLowerCase()
  const mentionsSet = /\bset\b|hash/.test(normalized)
  const mentionsCost = /o\(1\)|constant|lookup|membership|o\(n\)|linear/.test(normalized)
  const mentionsTradeoff = /memory|space|order|duplicate|trade/.test(normalized)
  const evidenceCount = [mentionsSet, mentionsCost, mentionsTradeoff].filter(Boolean).length

  function finish() {
    const probeCorrect = probe === "More memory and no guaranteed original ordering"
    const status: RoundResult["status"] = correct && evidenceCount >= 2 && probeCorrect ? "demonstrated" : correct ? "uncertain" : "focus"
    onComplete({ round: "technical", label: "Technical reasoning / code defence", status, strongest: correct ? "Recognised the repeated membership check as the scaling bottleneck." : "Completed a live code inspection and exposed the current reasoning path.", focus: evidenceCount >= 2 ? "The fix was explained; repeat the defence on a changed code example." : "Connect the proposed data structure to complexity and its real cost.", evidence: [`${correct ? "Correct" : "Incorrect"} scaling diagnosis`, `${evidenceCount}/3 defence signals present`, `${probeCorrect ? "Trade-off recognised" : "Trade-off still incomplete"}`], mission: "Defend one code decision using problem → change → complexity → trade-off → failure condition." })
  }

  return (
    <div className="challenge-body technical-body">
      {phase === "ready" && <div className="challenge-intro technical-intro"><div className="code-scan-visual" aria-hidden="true">{[42, 68, 55, 84, 36, 72].map((width, index) => <span key={index} style={{ width: `${width}%` }} />)}<i /></div><div><p className="eyebrow">ROUND 02 · LIVE TECHNICAL</p><h3>Your code works. Can you defend it?</h3><p>Find the scaling risk, propose a change and explain what the change costs.</p><Button className="primary-button dark-button" onClick={() => setPhase("question")}>Inspect the code <Code2 /></Button></div></div>}
      {phase === "question" && (
        <div className="code-question-grid">
          <div className="code-window"><div className="code-window-bar"><span /><span /><span /><small>duplicates.py</small></div><pre aria-label="Python code to inspect"><code>{`def find_duplicates(nums):
    seen = []
    duplicates = []

    for n in nums:
        if n in seen:
            duplicates.append(n)
        else:
            seen.append(n)

    return duplicates`}</code></pre></div>
          <div className="code-question"><p className="eyebrow">SCALE THE INPUT TO 1,000,000 ITEMS</p><h3>What becomes the biggest problem?</h3>
            <RadioGroup value={choice} onValueChange={setChoice} className="answer-list compact-list">{["The function returns the wrong data type", "Repeated list membership makes the loop quadratic", "The append operation always copies the full list", "Python cannot loop over one million items"].map((option, index) => <label key={option} className={`answer-option ${choice === option ? "is-selected" : ""}`}><RadioGroupItem value={option} className="answer-radio" /><span className="answer-letter">{String.fromCharCode(65 + index)}</span><span>{option}</span></label>)}</RadioGroup>
            <Button className="primary-button dark-button" disabled={!choice} onClick={() => setPhase("defend")}>Defend this answer <ArrowRight /></Button>
          </div>
        </div>
      )}
      {phase === "defend" && <div className="defence-stage"><p className="eyebrow">THE CHOICE IS NOT THE PROOF</p><h3>What would you change—and what would your change cost?</h3><div className="defence-framework"><span>PROBLEM</span><ArrowRight /><span>CHANGE</span><ArrowRight /><span>WHY</span><ArrowRight /><span>TRADE-OFF</span></div><Textarea value={defence} onChange={(event) => setDefence(event.target.value)} className="premium-textarea" placeholder="I would replace... because... The trade-off is..." aria-label="Defend your technical answer" /><div className="input-footer"><span>{defence.trim().split(/\s+/).filter(Boolean).length} words</span><Button className="primary-button dark-button" disabled={defence.trim().length < 35} onClick={() => setPhase("result")}>Evaluate my defence <Zap /></Button></div></div>}
      {phase === "result" && (
        <div className="result-stage technical-result"><p className="eyebrow">CODE RESULT × REASONING EVIDENCE</p><h3>{correct ? evidenceCount >= 2 ? "You found the bottleneck. Now prove the engineering trade-off." : "The diagnosis is right. The defence is still incomplete." : "The code result and the reasoning path disagree."}</h3>
          <div className="technical-signal-grid"><div className={correct ? "signal-pass" : "signal-miss"}><small>SCALING DIAGNOSIS</small><strong>{correct ? "Demonstrated" : "Not demonstrated"}</strong></div><div className={mentionsSet ? "signal-pass" : "signal-open"}><small>RELEVANT CHANGE</small><strong>{mentionsSet ? "Present" : "Missing"}</strong></div><div className={mentionsCost ? "signal-pass" : "signal-open"}><small>WHY IT HELPS</small><strong>{mentionsCost ? "Present" : "Needs proof"}</strong></div><div className={mentionsTradeoff ? "signal-pass" : "signal-open"}><small>TRADE-OFF</small><strong>{mentionsTradeoff ? "Present" : "Missing"}</strong></div></div>
          <div className="model-truth-note"><CircleAlert /><p>This short demonstration checks observable concepts in your text. A complete CodeForge evaluation would use deeper code and follow-up evidence.</p></div>
          <Button className="primary-button" onClick={() => setPhase("probe")}>Take the deeper probe <ArrowRight /></Button>
        </div>
      )}
      {phase === "probe" && <div className="confidence-panel"><p className="eyebrow">DEPTH PROBE · TRADE-OFF</p><h3>If you replace the list with a set, what cost should you acknowledge?</h3><RadioGroup value={probe} onValueChange={setProbe} className="confidence-options probe-options">{["More memory and no guaranteed original ordering", "The code becomes impossible to test", "Set membership is slower than list membership"].map((option) => <label key={option} className={`confidence-option ${probe === option ? "is-selected" : ""}`}><RadioGroupItem value={option} className="answer-radio" /><strong>{option}</strong></label>)}</RadioGroup><Button className="primary-button dark-button" disabled={!probe} onClick={finish}>Add evidence to my Twin <ArrowRight /></Button></div>}
    </div>
  )
}

type SpeechRecognitionResultLike = { 0: { transcript: string } }
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultLike> }
type SpeechRecognitionLike = { continuous: boolean; interimResults: boolean; lang: string; onresult: ((event: SpeechRecognitionEventLike) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void }
type SpeechRecognitionWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }

function analyseCommunication(text: string) {
  const lower = text.toLowerCase()
  const words = text.trim().split(/\s+/).filter(Boolean)
  const fillers = lower.match(/\b(um|uh|basically|actually|like)\b/g)?.length ?? 0
  const ownership = /\b(i|my|me)\b/.test(lower)
  const outcome = /\b(result|improved|reduced|increased|saved|achieved|outcome|percent|%)\b/.test(lower)
  const decision = /\b(decided|chose|selected|because|approach|designed|implemented)\b/.test(lower)
  const problem = /\b(problem|challenge|issue|needed|goal)\b/.test(lower)
  return { words: words.length, fillers, ownership, outcome, decision, problem }
}

function CommunicationRound({ onComplete }: { onComplete: (result: RoundResult) => void }) {
  const [phase, setPhase] = useState<"ready" | "answer" | "result" | "retry" | "compare">("ready")
  const [answer, setAnswer] = useState("")
  const [retry, setRetry] = useState("")
  const [recording, setRecording] = useState(false)
  const [voiceMessage, setVoiceMessage] = useState("")
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const first = analyseCommunication(answer)
  const second = analyseCommunication(retry)
  const sample = "I built a campus event platform because students missed important updates across different groups. I designed the event discovery and reminder flow, chose a simple role-based model, and implemented the front end. In our test, students found the correct event faster, but I still need a larger real-user validation."

  function startVoice(target: "first" | "retry") {
    const speechWindow = window as SpeechRecognitionWindow
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) { setVoiceMessage("Live speech recognition is not supported in this browser. Type your answer instead."); return }
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "en-IN"
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ")
      if (target === "first") setAnswer(transcript); else setRetry(transcript)
    }
    recognition.onend = () => setRecording(false)
    recognition.onerror = () => { setRecording(false); setVoiceMessage("Voice recognition stopped. Your typed response is still available.") }
    recognitionRef.current = recognition
    setRecording(true)
    setVoiceMessage("Listening… your browser is converting speech to text.")
    recognition.start()
  }
  function stopVoice() { recognitionRef.current?.stop(); setRecording(false); setVoiceMessage("Recording stopped. Check the transcript before evaluation.") }
  function finish() {
    const improved = [second.ownership, second.decision, second.outcome, second.problem].filter(Boolean).length > [first.ownership, first.decision, first.outcome, first.problem].filter(Boolean).length
    const completeSignals = [second.ownership, second.decision, second.outcome, second.problem].filter(Boolean).length
    onComplete({ round: "communication", label: "Communication structure / evidence", status: completeSignals >= 3 ? "demonstrated" : improved ? "uncertain" : "focus", strongest: second.decision ? "The response explained a personal decision and why it was made." : first.problem ? "The project context was understandable." : "A live response was produced for evaluation.", focus: second.outcome ? "Repeat the structure under a different prompt and tighter time pressure." : "Make the result or evidence explicit instead of leaving the listener to infer it.", evidence: [`${first.words} words in first attempt · ${second.words} in retry`, `${second.ownership ? "Personal ownership present" : "Ownership still unclear"}`, `${second.outcome ? "Outcome evidence present" : "Outcome evidence missing"}`], mission: "Answer a new project question using problem → my decision → why → result, then re-test in 45 seconds." })
  }
  const firstSignals = [first.problem, first.ownership, first.decision, first.outcome]
  const secondSignals = [second.problem, second.ownership, second.decision, second.outcome]
  const signalNames = ["Problem", "My ownership", "Decision / why", "Result"]

  return (
    <div className="challenge-body communication-body">
      {phase === "ready" && <div className="challenge-intro communication-intro"><div className="voice-sculpture" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <span key={index} style={{ height: `${20 + ((index * 19) % 70)}%` }} />)}</div><div><p className="eyebrow">ROUND 03 · LIVE COMMUNICATION</p><h3>You know what you want to say. Can you make it clear?</h3><p>Explain one project. PrepVista will separate what you said from how the answer was structured.</p><Button className="primary-button dark-button" onClick={() => setPhase("answer")}>Enter communication round <Mic /></Button></div></div>}
      {phase === "answer" && <div className="voice-stage"><div className="voice-prompt"><p className="eyebrow">45-SECOND PROJECT EXPLANATION</p><h3>Tell us about a project you are proud of.</h3><p>Focus on the problem, your decision and the result.</p></div><div className={`waveform-live ${recording ? "is-recording" : ""}`} aria-hidden="true">{Array.from({ length: 28 }, (_, index) => <span key={index} />)}</div><div className="voice-controls"><Button variant="outline" className="voice-button" onClick={() => recording ? stopVoice() : startVoice("first")}>{recording ? <><Square /> Stop voice</> : <><Mic /> Answer with voice</>}</Button><Button variant="ghost" className="sample-button" onClick={() => setAnswer(sample)}>Use sample response</Button></div>{voiceMessage && <p className="voice-status">{voiceMessage}</p>}<Textarea value={answer} onChange={(event) => setAnswer(event.target.value)} className="premium-textarea voice-textarea" placeholder="Your live transcript or typed answer appears here…" aria-label="Your project explanation" /><div className="input-footer"><span>{first.words} words · {first.fillers} filler signal{first.fillers === 1 ? "" : "s"}</span><Button className="primary-button dark-button" disabled={answer.trim().length < 45} onClick={() => setPhase("result")}>Analyse the answer <Zap /></Button></div></div>}
      {phase === "result" && <div className="communication-result"><p className="eyebrow">CONTENT × STRUCTURE</p><h3>{first.problem && !first.ownership ? "The project was clear. Your contribution was not." : first.ownership && !first.outcome ? "Your contribution was visible. The outcome was not." : first.decision && first.outcome ? "The core evidence is present. Now make the structure repeatable." : "The answer has content. The listener still has to assemble the story."}</h3><div className="structure-track">{signalNames.map((name, index) => <div key={name} className={firstSignals[index] ? "structure-present" : "structure-missing"}><span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong><small>{firstSignals[index] ? "Observed" : "Missing"}</small></div>)}</div><div className="communication-insight-row"><div><small>DELIVERY SIGNAL</small><p>{first.fillers === 0 ? "No obvious filler pattern in the transcript." : `${first.fillers} filler signal${first.fillers === 1 ? "" : "s"} observed.`}</p></div><div><small>LIMIT</small><p>Text analysis cannot fully measure tone, pronunciation or listener comprehension.</p></div></div><Button className="primary-button" onClick={() => setPhase("retry")}>Fix it live <RotateCcw /></Button></div>}
      {phase === "retry" && <div className="voice-stage retry-stage"><p className="eyebrow">RETRY WITH A CLEAR STRUCTURE</p><h3>Problem → My decision → Why → Result</h3><div className="retry-scaffold" aria-hidden="true">{signalNames.map((name, index) => <span key={name}><b>{index + 1}</b>{name}</span>)}</div><div className="voice-controls"><Button variant="outline" className="voice-button" onClick={() => recording ? stopVoice() : startVoice("retry")}>{recording ? <><Square /> Stop voice</> : <><Mic /> Retry with voice</>}</Button></div><Textarea value={retry} onChange={(event) => setRetry(event.target.value)} className="premium-textarea voice-textarea" placeholder="Answer the same prompt with the new structure…" aria-label="Retry your project explanation" /><div className="input-footer"><span>{second.words} words</span><Button className="primary-button dark-button" disabled={retry.trim().length < 45} onClick={() => setPhase("compare")}>Compare attempts <ArrowRight /></Button></div></div>}
      {phase === "compare" && <div className="comparison-result"><p className="eyebrow">FIRST ATTEMPT → REPAIR ATTEMPT</p><h3>{secondSignals.filter(Boolean).length > firstSignals.filter(Boolean).length ? "The second answer made more of the evidence visible." : "The wording changed. The missing evidence did not."}</h3><div className="before-after-grid"><div><small>BEFORE</small>{signalNames.map((name, index) => <span key={name} className={firstSignals[index] ? "present" : "missing"}>{name}</span>)}</div><div><small>AFTER</small>{signalNames.map((name, index) => <span key={name} className={secondSignals[index] ? "present" : "missing"}>{name}</span>)}</div></div><p className="result-caveat">The change is based on observable structure in these two responses—not a complete communication score.</p><Button className="primary-button" onClick={finish}>Add evidence to my Twin <ArrowRight /></Button></div>}
    </div>
  )
}

function createFollowUp(answer: string) {
  const lower = answer.toLowerCase()
  if (/redis|cache|caching/.test(lower)) return "You mentioned caching. What exactly did you cache, and how did you handle stale data?"
  if (/database|postgres|mysql|query|sql/.test(lower)) return "What evidence showed the database or query was the actual bottleneck?"
  if (/\bwe\b/.test(lower) && !/\b(i|my)\b/.test(lower)) return "You described what the team did. Which technical decision was specifically yours?"
  if (/improv|faster|reduc|increas|optim/.test(lower)) return "How did you measure that improvement, and what was the baseline?"
  if (/react|python|java|node|model|algorithm/.test(lower)) return "What alternative did you consider, and why was this approach better for the constraint?"
  return "What was the most important trade-off in that decision, and what would make the approach fail?"
}

function InterviewRound({ role, onComplete }: { role: Role; onComplete: (result: RoundResult) => void }) {
  const [phase, setPhase] = useState<"context" | "answer" | "followup" | "result">("context")
  const [context, setContext] = useState("")
  const [answer, setAnswer] = useState("")
  const [followupAnswer, setFollowupAnswer] = useState("")
  const followup = useMemo(() => createFollowUp(answer), [answer])
  const sample = "I built a campus event platform with React and PostgreSQL. I designed the event-discovery flow and added Redis caching because repeated event queries were slow. Our small test looked faster, but I did not establish a strong production baseline."
  const combined = `${answer} ${followupAnswer}`.toLowerCase()
  const ownership = /\b(i|my|mine)\b/.test(combined)
  const evidence = /\b\d+|percent|%|measured|baseline|milliseconds|seconds|users\b/.test(combined)
  const tradeoff = /trade|alternative|instead|cost|memory|complex|however|but/.test(combined)
  const failure = /fail|risk|stale|edge|limit|break|problem/.test(combined)
  const depthCount = [ownership, evidence, tradeoff, failure].filter(Boolean).length
  function finish() {
    onComplete({ round: "interview", label: "Deeper interview defence", status: depthCount >= 3 ? "demonstrated" : depthCount >= 2 ? "uncertain" : "focus", strongest: ownership ? "Personal ownership was visible in the project explanation." : "A project answer was carried into an answer-aware follow-up.", focus: evidence ? "Evidence was present; repeat the defence against an alternative or failure question." : "Support technical claims with a baseline, measurement or concrete observation.", evidence: [`${ownership ? "Ownership demonstrated" : "Ownership remained unclear"}`, `${evidence ? "Measurement evidence present" : "Measurement evidence missing"}`, `${tradeoff ? "Trade-off discussed" : "Trade-off needs proof"}`], mission: "Defend one project decision through why → alternative → evidence → failure condition." })
  }
  return (
    <div className="challenge-body interview-body">
      {phase === "context" && <div className="interview-context"><div className="interviewer-orbit" aria-hidden="true"><span>01</span><i /><span>02</span><i /><span>03</span></div><p className="eyebrow">ROUND 04 · ADAPTIVE INTERVIEW</p><h3>Give the interviewer something real to question.</h3><p>Use 2–5 lines about one project. The next question will change according to your answer.</p><Textarea value={context} onChange={(event) => setContext(event.target.value)} className="premium-textarea" placeholder="What the project does, your contribution, one decision and one result…" aria-label="Project context for interview" /><div className="input-footer"><Button variant="ghost" className="sample-button" onClick={() => setContext(sample)}>Use sample project</Button><Button className="primary-button dark-button" disabled={context.trim().length < 35} onClick={() => setPhase("answer")}>Begin interview <ArrowRight /></Button></div></div>}
      {phase === "answer" && <div className="interview-question-stage"><div className="depth-rail" aria-label="Interview depth"><span className="active"><b>01</b>Surface</span><span><b>02</b>Evidence</span><span><b>03</b>Defence</span></div><div className="interview-main"><p className="eyebrow">{role.short.toUpperCase()} · QUESTION 01</p><h3>What was the most difficult part of this project, and what did you personally decide?</h3><div className="project-context-mini"><small>YOUR PROJECT CONTEXT</small><p>{context}</p></div><Textarea value={answer} onChange={(event) => setAnswer(event.target.value)} className="premium-textarea" placeholder="Answer as if you are speaking to the interviewer…" aria-label="First interview answer" /><Button className="primary-button dark-button" disabled={answer.trim().length < 40} onClick={() => setPhase("followup")}>Submit answer <ArrowRight /></Button></div></div>}
      {phase === "followup" && <div className="interview-question-stage"><div className="depth-rail" aria-label="Interview depth"><span><b>01</b>Surface</span><span className="active"><b>02</b>Evidence</span><span><b>03</b>Defence</span></div><div className="interview-main"><p className="eyebrow">THE INTERVIEW CHANGED BECAUSE OF YOUR ANSWER</p><h3>{followup}</h3><div className="answer-reference"><small>YOU SAID</small><p>{answer}</p></div><Textarea value={followupAnswer} onChange={(event) => setFollowupAnswer(event.target.value)} className="premium-textarea" placeholder="Defend the claim with evidence, an alternative or a limitation…" aria-label="Adaptive follow-up answer" /><Button className="primary-button dark-button" disabled={followupAnswer.trim().length < 35} onClick={() => setPhase("result")}>Reveal interview evidence <Eye /></Button></div></div>}
      {phase === "result" && <div className="interview-result"><p className="eyebrow">SURFACE → EVIDENCE → DEFENCE</p><h3>{depthCount >= 3 ? "Your answer carried evidence into the deeper question." : evidence ? "The evidence appeared. The trade-off still needs defence." : "The opening answer survived. The claim lost strength when evidence was requested."}</h3><div className="interview-depth-map">{[["Ownership", ownership], ["Evidence", evidence], ["Trade-off", tradeoff], ["Failure condition", failure]].map(([label, present]) => <div key={String(label)} className={present ? "depth-present" : "depth-missing"}>{present ? <Check /> : <CircleAlert />}<span>{String(label)}</span><small>{present ? "Observed" : "Needs proof"}</small></div>)}</div><p className="result-caveat">Based only on this short interview demonstration. It does not predict a hiring decision.</p><Button className="primary-button" onClick={finish}>Add evidence to my Twin <ArrowRight /></Button></div>}
    </div>
  )
}

function ChallengeDialog({ round, role, onClose, onComplete }: { round: RoundKey | null; role: Role; onClose: () => void; onComplete: (result: RoundResult) => void }) {
  const meta = round ? roundMeta[round] : null
  return <Dialog open={Boolean(round)} onOpenChange={(open) => !open && onClose()}><DialogContent showCloseButton className={`challenge-dialog challenge-${round ?? "none"}`} onPointerDownOutside={(event) => event.preventDefault()}><DialogHeader className="challenge-dialog-header"><div className="challenge-brand-row"><Logo inverse /><div className="challenge-role-chip"><span>ROUND {meta?.number ?? "—"} / 04</span><i /><Target /> {role.name}<b>{meta?.label}</b></div></div><div className="sr-only"><DialogTitle>{meta?.label ?? "Placement"} challenge</DialogTitle><DialogDescription>Interactive PrepVista Placement Gauntlet round.</DialogDescription></div></DialogHeader>{round === "aptitude" && <AptitudeRound onComplete={onComplete} />}{round === "technical" && <TechnicalRound onComplete={onComplete} />}{round === "communication" && <CommunicationRound onComplete={onComplete} />}{round === "interview" && <InterviewRound role={role} onComplete={onComplete} />}</DialogContent></Dialog>
}

function PlacementTwin({ results, role }: { results: Partial<Record<RoundKey, RoundResult>>; role: Role }) {
  const strands: Array<{ key: RoundKey; label: string; path: string; y: number }> = [
    { key: "aptitude", label: "Reasoning", path: "M20 55 C165 20 245 105 395 52 S630 20 780 70", y: 50 },
    { key: "technical", label: "Technical", path: "M20 130 C150 180 270 65 420 140 S650 195 780 112", y: 125 },
    { key: "communication", label: "Communication", path: "M20 205 C175 160 260 250 410 198 S625 155 780 218", y: 200 },
    { key: "interview", label: "Interview", path: "M20 280 C165 330 275 235 430 292 S650 335 780 272", y: 275 },
  ]
  return <div className="twin-shell"><div className="twin-destination"><span>TARGET ROLE</span><strong>{role.name}</strong></div><svg className="twin-svg" viewBox="0 0 820 340" role="img" aria-label="Placement Twin evidence map"><defs><filter id="softGlow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>{strands.map((strand) => { const result = results[strand.key]; const color = !result ? "rgba(255,255,255,.15)" : result.status === "demonstrated" ? "#2fd19a" : result.status === "focus" ? "#ff5c5c" : "#f4a340"; return <g key={strand.key}><path d={strand.path} fill="none" stroke={color} strokeWidth={result ? 4 : 2} strokeDasharray={result ? "0" : "7 9"} /><circle cx="24" cy={strand.y} r={result ? 8 : 5} fill={color} filter={result ? "url(#softGlow)" : undefined} /><circle cx="390" cy={strand.y + (strand.key === "technical" ? 12 : strand.key === "interview" ? 12 : 2)} r={result ? 7 : 4} fill={color} /><circle cx="780" cy={strand.y + (strand.key === "technical" ? -13 : strand.key === "interview" ? -3 : 18)} r={result ? 8 : 5} fill={color} /></g> })}</svg><div className="twin-labels">{strands.map((strand) => { const result = results[strand.key]; return <Tooltip key={strand.key}><TooltipTrigger asChild><button className={`twin-label ${result ? resultClass(result.status) : "state-empty"}`}><span>{strand.label}</span><small>{result ? result.status : "No evidence"}</small></button></TooltipTrigger><TooltipContent side="right" className="twin-tooltip">{result ? result.evidence[0] : "Complete this Gauntlet round to add evidence."}</TooltipContent></Tooltip> })}</div><div className="twin-core"><span>{Object.keys(results).length}</span><small>LIVE SIGNALS</small></div></div>
}

function V4SectionLabel({ number, children, light = false }: { number: string; children: React.ReactNode; light?: boolean }) {
  return (
    <div className={"v4-section-label " + (light ? "is-light" : "")}>
      <span>{number}</span>
      <i />
      <strong>{children}</strong>
    </div>
  )
}

function CinematicFilm({
  film,
  className = "",
}: {
  film: (typeof filmLibrary)[FilmId]
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const source = video.querySelector("source")
    if (!source) return
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    source.removeAttribute("src")
    source.setAttribute("data-src", film.src)
    video.load()
    if (reduceMotion) return

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      const pendingSource = source.getAttribute("data-src")
      if (pendingSource && !source.getAttribute("src")) {
        source.setAttribute("src", pendingSource)
        video.load()
      }
      void video.play().catch(() => undefined)
      observer.disconnect()
    }, { rootMargin: "260px 0px", threshold: 0.08 })

    observer.observe(video)
    return () => observer.disconnect()
  }, [film.src])

  function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  }

  return (
    <figure className={`v5-film ${className}`}>
      <div className="v5-film-media">
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          poster={film.poster}
          aria-hidden="true"
          tabIndex={-1}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
        >
          <source data-src={film.src} type="video/mp4" />
        </video>
        <div className="v5-film-glass" aria-hidden="true" />
        <div className="v5-film-corners" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="v5-film-status"><span><i /> PRODUCT FILM</span><small>MUTED · LOOPING</small></div>
        <button className="v5-film-control" onClick={togglePlayback} aria-label={paused ? "Play product film" : "Pause product film"}>
          {paused ? <Play /> : <Pause />}
        </button>
      </div>
      <figcaption>
        <span>{film.eyebrow}</span>
        <strong>{film.title}</strong>
        <p>{film.takeaway}</p>
      </figcaption>
    </figure>
  )
}

function CareerEngine({ role, locked }: { role: Role; locked: boolean }) {
  return (
    <div className={"v4-career-engine " + (locked ? "is-locked" : "")} aria-label="Selected career route">
      <div className="v4-engine-grid" aria-hidden="true" />
      <div className="v4-engine-head">
        <span><Crosshair /> CAREER COORDINATE</span>
        <small>{locked ? "TARGET LOCKED" : "AWAITING TARGET"}</small>
      </div>
      <div className="v4-engine-orbit" aria-hidden="true">
        <i className="v4-orbit-ring ring-one" />
        <i className="v4-orbit-ring ring-two" />
        <i className="v4-orbit-ring ring-three" />
        <span className="v4-orbit-node node-one">REASON</span>
        <span className="v4-orbit-node node-two">BUILD</span>
        <span className="v4-orbit-node node-three">EXPLAIN</span>
        <span className="v4-orbit-node node-four">DEFEND</span>
        <div className="v4-engine-core">
          <span>{locked ? "TARGET ROLE" : "CHOOSE A ROLE"}</span>
          <strong>{locked ? role.short : "?"}</strong>
          <small>{locked ? "ROUTE READY" : "NO GENERIC PATH"}</small>
        </div>
      </div>
      <div className="v4-engine-capabilities">
        {role.capabilities.map((capability, index) => (
          <span key={capability}><b>{String(index + 1).padStart(2, "0")}</b>{locked ? capability : "Capability pending"}</span>
        ))}
      </div>
      <div className="v4-engine-scan" aria-hidden="true" />
    </div>
  )
}

export default function Home() {
  const [audience, setAudience] = useState<Audience>("student")
  const [selectedRoleId, setSelectedRoleId] = useState<RoleId | null>("software")
  const [activeRound, setActiveRound] = useState<RoundKey | null>(null)
  const [results, setResults] = useState<Partial<Record<RoundKey, RoundResult>>>({})
  const [comparison, setComparison] = useState(50)
  const [journeyProgress, setJourneyProgress] = useState(0)
  const [systemStep, setSystemStep] = useState(0)
  const [activeBelief, setActiveBelief] = useState(0)
  const [activeFilm, setActiveFilm] = useState<FilmId>("repair")
  const [futureMode, setFutureMode] = useState<"unguided" | "guided">("guided")
  const [hoursPerWeek, setHoursPerWeek] = useState(8)
  const [weeksToMoment, setWeeksToMoment] = useState(12)
  const [chapter, setChapter] = useState("01 / YOUR FUTURE")
  const [voteNotice, setVoteNotice] = useState(false)
  const journeyRef = useRef<HTMLElement | null>(null)

  const role = roles.find((item) => item.id === selectedRoleId) ?? roles[0]
  const copy = audienceCopy[audience]
  const resultList = Object.values(results).filter(Boolean) as RoundResult[]
  const focusResult = resultList.find((item) => item.status === "focus") ?? resultList.find((item) => item.status === "uncertain") ?? resultList[0]
  const journeyGates = journeyBlueprints[role.id]
  const activeStage = Math.min(journeyGates.length - 1, Math.floor(journeyProgress * journeyGates.length))
  const activeGate = journeyGates[activeStage]
  const preparationHours = hoursPerWeek * weeksToMoment
  const routeFilm = roleRouteFilms[role.id]
  const activeFilmData = activeFilm === "route" ? routeFilm : filmLibrary[activeFilm]
  const belief = careerBeliefs[activeBelief]
  const BeliefIcon = belief.icon

  useEffect(() => {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible")
      })
    }, { threshold: 0.12 })
    const chapterObserver = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible) setChapter((visible.target as HTMLElement).dataset.chapter ?? "PREPVISTA")
    }, { threshold: [0.28, 0.5, 0.7] })
    document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element))
    document.querySelectorAll("[data-chapter]").forEach((element) => chapterObserver.observe(element))
    return () => {
      revealObserver.disconnect()
      chapterObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const section = journeyRef.current
      if (section) {
        const rect = section.getBoundingClientRect()
        const scrollable = Math.max(section.offsetHeight - window.innerHeight, 1)
        setJourneyProgress(Math.min(1, Math.max(0, -rect.top / scrollable)))
      }
      document.documentElement.style.setProperty("--page-scroll", String(window.scrollY / Math.max(document.body.scrollHeight - window.innerHeight, 1)))
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  function completeRound(result: RoundResult) {
    setResults((current) => ({ ...current, [result.round]: result }))
    setActiveRound(null)
    window.setTimeout(() => scrollToId("career-proof"), 180)
  }

  function moveAmbient(event: React.PointerEvent<HTMLElement>) {
    event.currentTarget.style.setProperty("--pointer-x", event.clientX + "px")
    event.currentTarget.style.setProperty("--pointer-y", event.clientY + "px")
  }

  return (
    <TooltipProvider delayDuration={160}>
      <main className={"v4-shell audience-" + audience} onPointerMove={moveAmbient}>
        <div className="v4-ambient" aria-hidden="true" />
        <div className="page-progress" aria-hidden="true"><span /></div>

        <header className="v4-nav">
          <button className="v4-logo-button" onClick={() => scrollToId("top")} aria-label="Back to top"><Logo inverse /></button>
          <nav aria-label="Primary navigation">
            <button onClick={() => scrollToId("career-reality")}>Career reality</button>
            <button onClick={() => scrollToId("gauntlet")}>Live experience</button>
            <button onClick={() => scrollToId("career-proof")}>Your proof</button>
            <button onClick={() => scrollToId("trust")}>What is real</button>
          </nav>
          <div className="v4-nav-actions">
            <span className="v4-live-state"><i /> INTERACTIVE PROTOTYPE</span>
            <Button className="v4-nav-signin" onClick={() => scrollToId("top")}>Sign In</Button>
            <Button className="v4-nav-cta" onClick={() => scrollToId("gauntlet")}>Try a live round <Play /></Button>
          </div>
        </header>

        <aside className="v4-chapter-rail" aria-hidden="true">
          <span>{chapter}</span>
          <i><b /></i>
          <small>SCROLL TO ADVANCE</small>
        </aside>

        <section id="top" data-chapter="01 / YOUR FUTURE" className={"v4-hero " + (selectedRoleId ? "has-target" : "")}>
          <div className="v4-hero-grid" aria-hidden="true" />
          <div className="v4-hero-scan" aria-hidden="true" />
          <div className="v4-hero-ghost" aria-hidden="true">BECOME</div>
          <div className="v4-hero-index" aria-hidden="true"><span>PREPVISTA / CAREER SIGNAL SYSTEM</span><span>2026 / PROTOTYPE</span></div>

          <div className="v4-hero-layout">
            <div className="v4-hero-copy reveal">
              <div className="v4-audience-switch" role="group" aria-label="Choose your career stage">
                <button className={audience === "student" ? "is-active" : ""} onClick={() => setAudience("student")}><GraduationCap /> First role</button>
                <button className={audience === "professional" ? "is-active" : ""} onClick={() => setAudience("professional")}><BriefcaseBusiness /> Next role</button>
              </div>
              <p className="v4-kicker">{copy.kicker}</p>
              <h1>{copy.heroLead} <em>{copy.heroAccent}</em> {copy.heroEnd}</h1>
              <p className="v4-hero-lede">{copy.heroBody}</p>
              <div className="v4-hero-actions">
                <Button className="v4-primary-cta" disabled={!selectedRoleId} onClick={() => scrollToId("career-moment")}>
                  {selectedRoleId ? "Enter my career route" : "Choose your target role"} <ArrowRight />
                </Button>
                <button className="v4-text-action" onClick={() => scrollToId("gauntlet")}>I believe I am ready—test me <Play /></button>
              </div>
              <div className="v4-hero-trust">
                <span><ShieldCheck /> {copy.trustLine}</span>
                <span><BadgeCheck /> No placement guarantee. Real prototype boundaries.</span>
              </div>
              <div className="v6-hero-proofline" aria-label="How the PrepVista experience works">
                <span><b>01</b> Choose your role</span>
                <span><b>02</b> Perform live</span>
                <span><b>03</b> Find the weak link</span>
                <span><b>04</b> Train what matters</span>
              </div>
            </div>
            <div className="reveal"><CareerEngine role={role} locked={Boolean(selectedRoleId)} /></div>
          </div>

          <div id="role-deck" className="v4-role-deck reveal" aria-label="Choose a target role">
            <div className="v4-role-deck-label"><Compass /><span>PERSONALIZE THE EXPERIENCE<br />CHOOSE THE ROLE YOU WANT</span></div>
            {roles.map((item) => (
              <button
                key={item.id}
                className={"v4-role-card " + (selectedRoleId === item.id ? "is-selected" : "")}
                onClick={() => setSelectedRoleId(item.id)}
                onPointerMove={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  event.currentTarget.style.setProperty("--card-x", ((event.clientX - rect.left) / rect.width - 0.5) * 10 + "deg")
                  event.currentTarget.style.setProperty("--card-y", ((event.clientY - rect.top) / rect.height - 0.5) * -8 + "deg")
                }}
                onPointerLeave={(event) => {
                  event.currentTarget.style.setProperty("--card-x", "0deg")
                  event.currentTarget.style.setProperty("--card-y", "0deg")
                }}
              >
                <span>{item.index}</span>
                <strong>{item.name}</strong>
                <small>{item.description}</small>
                <i>{selectedRoleId === item.id ? "TARGET LOCKED" : "SELECT ROUTE"} <ArrowUpRight /></i>
              </button>
            ))}
          </div>
          <div className="v4-scroll-cue" aria-hidden="true"><MousePointer2 /><span>SCROLL INTO YOUR CAREER ROUTE</span><i /></div>
        </section>

        <section id="career-moment" data-chapter="02 / THE MOMENT" className="v4-moment-world">
          <V4SectionLabel number="02">THE MOMENT YOU ARE WORKING TOWARD</V4SectionLabel>
          <div className="v4-moment-layout">
            <div className="v4-moment-copy reveal">
              <p className="v4-kicker dark">{copy.momentLabel}</p>
              <h2>{copy.momentTitle}</h2>
              <p>The final decision may arrive in one email. The evidence behind it is built across hundreds of smaller decisions—how you solve, code, explain, recover and defend.</p>
              <blockquote>“I do not want another course. I want to know what could stop me—and how to fix it before it matters.”</blockquote>
            </div>
            <div className="v5-offer-film reveal">
              <CinematicFilm key={routeFilm.src} film={routeFilm} className="v5-film-featured" />
              <div className="v5-offer-glimpse">
                <MailCheck />
                <div><span>THE MOMENT BEYOND THE ROUTE</span><strong>{selectedRoleId ? role.name : "Your target role"}</strong></div>
                <small>Illustrative outcome · not a placement promise</small>
              </div>
            </div>
          </div>
          <div className="v4-backtrace reveal">
            {[
              ["04", "OFFER", "A hiring decision is made"],
              ["03", "INTERVIEW", "Your evidence is challenged"],
              ["02", "PREPARATION", "Your habits become visible"],
              ["01", "TODAY", "The weak link is still trainable"],
            ].map(([number, title, text], index) => (
              <article key={title} className={index === 3 ? "is-now" : ""}>
                <span>{number}</span><i /><div><strong>{title}</strong><p>{text}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section id="career-reality" ref={journeyRef} data-chapter="03 / PLACEMENT REALITY" className="v4-journey-world">
          <div className="v4-journey-sticky">
            <V4SectionLabel number="03" light>YOUR CAREER ROUTE</V4SectionLabel>
            <div className="v4-journey-copy">
              <p className="v4-kicker">{selectedRoleId ? role.name.toUpperCase() : "SELECTED CAREER PATH"}</p>
              <h2>The route does not ask the same question twice.</h2>
              <p>{activeGate.demand}</p>
              <div className="v4-journey-counter"><strong>{String(activeStage + 1).padStart(2, "0")}</strong><span>/ {String(journeyGates.length).padStart(2, "0")}</span><small>{activeGate.stage.toUpperCase()} · {activeGate.verb}</small></div>
            </div>
            <div className="v4-journey-stage">
              <div className="v4-destination-orb"><Trophy /><span>DESTINATION</span><strong>{role.short}</strong></div>
              <div className="v4-journey-line" aria-hidden="true"><i /></div>
              <div className="v4-gate-track" style={{ "--journey-shift": journeyProgress * -74 + "%" } as CSSProperties}>
                {journeyGates.map((gate, index) => {
                  return (
                    <article key={gate.stage} className={"v4-career-gate v5-career-gate " + (index === activeStage ? "is-active" : "") + (index < activeStage ? " is-passed" : "")}>
                      <div className="v5-gate-top"><span>{String(index + 1).padStart(2, "0")}</span><div>{index === 0 ? <TimerReset /> : index === 1 ? <Code2 /> : index === 2 ? <Volume2 /> : index === 3 ? <Fingerprint /> : <Trophy />}</div></div>
                      <small>{gate.stage.toUpperCase()}</small>
                      <h3>{gate.verb}</h3>
                      <p>{gate.demand}</p>
                      <dl>
                        <div><dt>OBSERVES</dt><dd>{gate.signal}</dd></div>
                        <div><dt>HIDDEN RISK</dt><dd>{gate.risk}</dd></div>
                        <div><dt>PROOF TO PASS</dt><dd>{gate.proof}</dd></div>
                      </dl>
                      <i />
                    </article>
                  )
                })}
              </div>
              <div className={"v4-route-break " + (journeyProgress > 0.72 ? "is-visible" : "")}>
                <span><Zap /></span><strong>ONE UNPROVEN CAPABILITY CAN STOP THE ROUTE</strong>
              </div>
            </div>
          </div>
        </section>

        <section data-chapter="04 / WHEN IT BECOMES REAL" className="v5-placement-day-world">
          <V4SectionLabel number="04" light>THE DAY A HIDDEN WEAKNESS BECOMES VISIBLE</V4SectionLabel>
          <div className="v5-placement-day-heading reveal">
            <p className="v4-kicker">AN ILLUSTRATIVE PLACEMENT-DAY SEQUENCE · NOT A TESTIMONIAL</p>
            <h2>You rarely lose confidence all at once.<br /><em>It leaks out one unexplained moment at a time.</em></h2>
          </div>
          <div className="v5-day-timeline reveal">
            {journeyGates.slice(0, 4).map((gate, index) => {
              const times = audience === "student" ? ["09:03", "10:48", "12:16", "14:02"] : ["08:42", "10:10", "11:35", "13:20"]
              return (
                <article key={gate.stage} className={index === activeStage ? "is-current" : ""}>
                  <time>{times[index]}</time>
                  <span>{gate.stage.toUpperCase()}</span>
                  <h3>{gate.risk}</h3>
                  <div><small>A RESULT SCREEN MAY SHOW</small><strong>{index % 2 === 0 ? "Score / status" : "Passed / not passed"}</strong></div>
                  <div><small>PREPVISTA NEEDS TO FIND</small><strong>{gate.signal}</strong></div>
                </article>
              )
            })}
            <div className="v5-day-playhead" aria-hidden="true"><i /></div>
          </div>
          <div className="v5-day-climax reveal">
            <CircleDotDashed />
            <p>The painful part is not one weak attempt.</p>
            <h3>It is leaving the round with no idea what to change tomorrow.</h3>
          </div>
          <div className="v5-readiness-gap reveal">
            <div className="v5-gap-side is-student"><span>STUDENTS WHO BELIEVE THEY ARE JOB-READY FROM DAY ONE</span><strong>68<small>%</small></strong></div>
            <div className="v5-gap-bridge"><i /><span>PERCEPTION GAP</span><strong>Belief and employer evidence are not the same thing.</strong><i /></div>
            <div className="v5-gap-side is-employer"><span>CORPORATES THAT AGREE</span><strong>9<small>%</small></strong></div>
            <div className="v5-gap-source">
              <p>HirePro’s 2026 India survey covered 10,000+ students, 80+ corporates, 100+ colleges and 100+ campus recruiters. This does not mean 91% of graduates cannot succeed; it shows why readiness needs evidence beyond self-belief.</p>
              <a href="https://hirepro.in/resources/research-reports/the-state-of-college-hiring-in-india-2026" target="_blank" rel="noreferrer">SOURCE · THE STATE OF COLLEGE HIRING IN INDIA 2026 <ArrowUpRight /></a>
            </div>
          </div>
        </section>

        <section id="career-fork" data-chapter="05 / TWO FUTURES" className="v5-fork-world">
          <V4SectionLabel number="05">THE SAME AMBITION CAN PRODUCE TWO PREPARATION FUTURES</V4SectionLabel>
          <div className="v5-fork-heading reveal">
            <div><p className="v4-kicker dark">SAME PERSON · SAME TARGET · SAME HOURS</p><h2>The difference is whether the weak link stays invisible.</h2></div>
            <p>This does not compare “failure” with a guaranteed offer. It compares unfocused preparation with a measurable development loop before {copy.deadline}.</p>
          </div>
          <div className="v5-fork-switch reveal" role="group" aria-label="Compare two preparation futures">
            <button className={futureMode === "unguided" ? "is-active" : ""} onClick={() => setFutureMode("unguided")}><Split /> Future A · prepare by guesswork</button>
            <button className={futureMode === "guided" ? "is-active" : ""} onClick={() => setFutureMode("guided")}><Waypoints /> Future B · prepare from evidence</button>
          </div>
          <div className={`v5-fork-stage reveal mode-${futureMode}`}>
            <div className="v5-fork-destination"><span>TARGET</span><strong>{role.name}</strong><small>{weeksToMoment} WEEKS TO {copy.deadline.toUpperCase()}</small></div>
            <div className="v5-fork-lanes">
              <div className="v5-fork-lane lane-unguided">
                <div className="v5-lane-head"><span>A</span><div><small>ACTIVITY WITHOUT DIAGNOSIS</small><strong>Work harder. Still guess.</strong></div></div>
                {[
                  ["WEEK 01", "Open five resources", "Every topic feels equally urgent."],
                  ["WEEK 04", "Collect completion", "Activity increases; the weak signal stays hidden."],
                  ["WEEK 08", "Repeat familiar practice", activeGate.risk],
                  [copy.deadline.toUpperCase(), "Meet the changed condition", "The risk becomes visible when feedback is hardest to recover."],
                ].map(([time, title, text], index) => <article key={time}><b>{String(index + 1).padStart(2, "0")}</b><small>{time}</small><strong>{title}</strong><p>{text}</p></article>)}
                <div className="v5-lane-outcome"><CircleAlert /><span>ENDING STATE</span><strong>More preparation completed. The blocker is still uncertain.</strong></div>
              </div>
              <div className="v5-fork-lane lane-guided">
                <div className="v5-lane-head"><span>B</span><div><small>EVIDENCE BEFORE ACTIVITY</small><strong>Find it. Train it. Prove it.</strong></div></div>
                {[
                  ["WEEK 01", "Observe a real attempt", activeGate.signal],
                  ["WEEK 02", "Name the weak link", activeGate.risk],
                  ["WEEK 03", "Run one focused mission", activeGate.proof],
                  ["BEFORE " + copy.deadline.toUpperCase(), "Change the condition", "Re-test before the capability is called improved."],
                ].map(([time, title, text], index) => <article key={time}><b>{String(index + 1).padStart(2, "0")}</b><small>{time}</small><strong>{title}</strong><p>{text}</p></article>)}
                <div className="v5-lane-outcome"><BadgeCheck /><span>ENDING STATE</span><strong>The risk is known, trained and re-tested—not guaranteed away.</strong></div>
              </div>
            </div>
            <div className="v5-fork-center" aria-hidden="true"><span>NOW</span><i /><strong>YOUR PREPARATION SYSTEM CHANGES THE ROUTE</strong></div>
          </div>
          <p className="v5-fork-boundary"><ShieldCheck /> Hiring remains the employer’s decision. PrepVista changes the quality and visibility of preparation—not the hiring rules.</p>
        </section>

        <section data-chapter="06 / THE CAREER MIRROR" className="v4-mirror-world">
          <V4SectionLabel number="06">THE CAREER MIRROR</V4SectionLabel>
          <div className="v4-mirror-heading reveal">
            <p className="v4-kicker dark">WHAT YOU BELIEVE × WHAT THE ROUND REQUIRES</p>
            <h2>The sentence you tell yourself can hide the risk.</h2>
            <p>Choose the belief that sounds most like you. PrepVista turns it into a question that performance—not confidence alone—must answer.</p>
          </div>
          <div className="v4-belief-console reveal">
            <div className="v4-belief-list" role="tablist" aria-label="Common readiness beliefs">
              {careerBeliefs.map((item, index) => (
                <button key={item.belief} role="tab" aria-selected={activeBelief === index} className={activeBelief === index ? "is-active" : ""} onClick={() => setActiveBelief(index)}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item.belief}</strong>
                  <ChevronRight />
                </button>
              ))}
            </div>
            <div className="v4-belief-reveal" role="tabpanel">
              <div className="v4-belief-icon"><BeliefIcon /></div>
              <span>THE HIRING ROUND ASKS</span>
              <h3>{belief.recruiter}</h3>
              <div className="v4-belief-signal"><Activity /><small>SIGNAL TO PROVE</small><strong>{belief.signal}</strong></div>
              <Button className="v4-dark-cta" onClick={() => scrollToId("gauntlet")}>Test this belief <ArrowRight /></Button>
            </div>
          </div>

          <div className="v4-root-cause reveal">
            <div className="v4-root-heading">
              <span>ILLUSTRATIVE COMPARISON</span>
              <h3>Same score. Two different career risks.</h3>
              <p>Drag the divider. A mark groups these students together; their behaviour tells PrepVista where to intervene.</p>
            </div>
            <div className="v4-root-stage" style={{ "--comparison": comparison + "%" } as CSSProperties}>
              <div className="v4-student-half half-a">
                <div className="v4-student-id"><span>A</span><div><small>6 / 10</small><strong>Concept gap</strong></div></div>
                <div className="v4-trace-lines"><i /><i /><i className="break" /><i className="break" /></div>
                <ul><li>Stable decision time</li><li>Repeated error in one concept</li><li>High confidence on wrong answers</li></ul>
                <div className="v4-action-note"><small>USEFUL NEXT MOVE</small><strong>Rebuild concept → explain → transfer</strong></div>
              </div>
              <div className="v4-student-half half-b">
                <div className="v4-student-id"><span>B</span><div><small>6 / 10</small><strong>Pressure instability</strong></div></div>
                <div className="v4-trace-lines late"><i /><i /><i className="break" /><i className="break" /></div>
                <ul><li>Correct first reasoning path</li><li>Answer changed near timeout</li><li>Errors cluster under pressure</li></ul>
                <div className="v4-action-note"><small>USEFUL NEXT MOVE</small><strong>Pacing → confidence lock → re-test</strong></div>
              </div>
              <input type="range" min="28" max="72" value={comparison} onChange={(event) => setComparison(Number(event.target.value))} aria-label="Compare root causes behind the same score" />
              <div className="v4-root-divider"><span><ChevronRight /><ChevronRight /></span></div>
            </div>
            <div className="v4-root-climax"><span>A score records the past.</span><strong>PrepVista decides what should happen next.</strong></div>
          </div>
        </section>

        <section data-chapter="07 / SEE IT WORK" className="v5-film-world">
          <V4SectionLabel number="07" light>DO NOT IMAGINE THE PRODUCT · WATCH THE CAUSE AND EFFECT</V4SectionLabel>
          <div className="v5-film-heading reveal">
            <p className="v4-kicker">THREE SHORT PRODUCT FILMS · REAL DESIGN LOGIC · ILLUSTRATIVE DATA</p>
            <h2>From career risk<br /><em>to a visible next move.</em></h2>
            <p>These films show the intended product behaviour: where evidence comes from, how a weak signal becomes an intervention, and why the system refuses to call one score “readiness.”</p>
          </div>
          <div className="v5-film-studio reveal">
            <div className="v5-film-selector" role="tablist" aria-label="Choose a PrepVista product film">
              {(Object.keys(filmLibrary) as FilmId[]).map((filmId, index) => {
                const item = filmId === "route" ? routeFilm : filmLibrary[filmId]
                return (
                  <button key={filmId} role="tab" aria-selected={activeFilm === filmId} className={activeFilm === filmId ? "is-active" : ""} onClick={() => setActiveFilm(filmId)}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><small>{item.eyebrow}</small><strong>{item.title}</strong></div>
                    {activeFilm === filmId ? <Pause /> : <Play />}
                  </button>
                )
              })}
            </div>
            <div className="v5-film-stage" role="tabpanel">
              <CinematicFilm key={activeFilmData.src} film={activeFilmData} />
              <div className="v5-film-meaning">
                <span><Clapperboard /> WHAT THIS MOMENT PROVES</span>
                <h3>{activeFilmData.takeaway}</h3>
                <p>{activeFilmData.body}</p>
                <div><i /><small>NO STOCK STUDENT STORY</small><i /><small>NO INVENTED OUTCOME</small><i /><small>NO AUDIO REQUIRED</small></div>
              </div>
            </div>
          </div>
          <div className="v5-film-sequence reveal" aria-label="PrepVista product sequence">
            <span>CAREER RISK</span><FastForward /><span>LIVE ATTEMPT</span><FastForward /><span>ROOT CAUSE</span><FastForward /><span>FOCUSED REPAIR</span><FastForward /><strong>CHANGED EVIDENCE</strong>
          </div>
        </section>

        <section id="gauntlet" data-chapter="08 / PROVE IT LIVE" className="v4-gauntlet-world">
          <V4SectionLabel number="08" light>THE PREPVISTA PLACEMENT GAUNTLET</V4SectionLabel>
          <div className="v4-gauntlet-heading reveal">
            <div><p className="v4-kicker">NO SIGNUP · REAL INTERACTION · EVIDENCE FROM THIS SESSION</p><h2>You believe you are ready.<br /><em>Find where the evidence breaks first.</em></h2></div>
            <p>Choose the round where you feel strongest. In under three minutes, see whether that belief survives time, complexity, clarity or deeper follow-up pressure.</p>
          </div>
          <div className="v4-gauntlet-observatory reveal">
            <div className="v4-observatory-grid" aria-hidden="true" />
            <div className="v4-gauntlet-core">
              <span>LIVE SIGNALS</span>
              <strong>{resultList.length}<small>/4</small></strong>
              <Progress value={(resultList.length / 4) * 100} className="v4-core-progress" />
              <p>{resultList.length === 0 ? "Your evidence starts at zero." : resultList.length === 4 ? "Gauntlet complete." : "Your Placement Twin is forming."}</p>
            </div>
            {(Object.keys(roundMeta) as RoundKey[]).map((key, index) => {
              const meta = roundMeta[key]
              const Icon = meta.icon
              const result = results[key]
              return (
                <button key={key} className={"v4-round-portal portal-" + (index + 1) + (result ? " is-complete" : "")} onClick={() => setActiveRound(key)}>
                  <div className="v4-portal-orbit" aria-hidden="true"><i /><i /><Icon /></div>
                  <span>ROUND {meta.number} · {meta.duration}</span>
                  <h3>{meta.label}</h3>
                  <p>{meta.promise}</p>
                  <div className="v6-portal-signals" aria-label={`${meta.label} evidence signals`}>
                    {roundSignals[key].map((signal) => <span key={signal}>{signal}</span>)}
                  </div>
                  <strong>{result ? "Review my evidence" : "Enter live round"} {result ? <Check /> : <ArrowUpRight />}</strong>
                  {result && <small className={resultClass(result.status)}>{result.status}</small>}
                </button>
              )
            })}
            <div className="v4-signal-route route-a" aria-hidden="true"><i /></div>
            <div className="v4-signal-route route-b" aria-hidden="true"><i /></div>
            <div className="v4-signal-route route-c" aria-hidden="true"><i /></div>
            <div className="v4-signal-route route-d" aria-hidden="true"><i /></div>
          </div>
          <div className="v4-gauntlet-contract reveal">
            <span><ScanLine /> REAL BROWSER-SIDE INTERACTION</span>
            <span><ShieldCheck /> PRELIMINARY SESSION EVIDENCE</span>
            <span><CircleAlert /> NOT A COMPLETE PLACEMENT ASSESSMENT</span>
          </div>
        </section>

        <section id="career-proof" data-chapter="09 / YOUR CAREER PROOF" className="v4-proof-world">
          <V4SectionLabel number="09">YOUR CAREER PROOF</V4SectionLabel>
          <div className="v4-proof-heading reveal">
            <p className="v4-kicker dark">NO UNIVERSAL READINESS NUMBER</p>
            <h2>Not another score.<br /><em>A decision about what you do next.</em></h2>
            <p>The short session below changes only when you perform. Blank evidence stays blank; one attempt never becomes a complete profile.</p>
          </div>
          <div className="v4-proof-grid reveal">
            <div className="v4-proof-passport">
              <div className="v4-passport-head"><Logo /><span>CAREER PROOF / SESSION</span><small>{role.short.toUpperCase()}</small></div>
              <div className="v4-passport-target"><small>CAREER DIRECTION</small><h3>{selectedRoleId ? role.name : "Choose a target role"}</h3><span>{copy.shortLabel}</span></div>
              {resultList.length === 0 ? (
                <div className="v4-proof-empty">
                  <Fingerprint />
                  <span>NO EVIDENCE PRODUCED YET</span>
                  <h3>PrepVista will not pretend it knows you.</h3>
                  <p>Complete one live round. Your attempt will become the first signal in this session.</p>
                  <Button className="v4-dark-cta" onClick={() => scrollToId("gauntlet")}>Produce my first signal <ArrowRight /></Button>
                </div>
              ) : (
                <div className="v4-proof-results">
                  <small>WHAT THIS SESSION OBSERVED</small>
                  {resultList.map((result) => (
                    <article key={result.round}>
                      <span className={resultClass(result.status)}>{result.status}</span>
                      <div><strong>{result.label}</strong><p>{result.strongest}</p></div>
                    </article>
                  ))}
                  <div className="v4-current-mission">
                    <small>YOUR CURRENT USEFUL MOVE</small>
                    <h3>{focusResult?.mission}</h3>
                  </div>
                </div>
              )}
              <div className="v4-passport-foot"><span>Browser session only</span><span>Not a hiring prediction</span></div>
            </div>
            <div className="v4-twin-panel">
              <div className="v4-twin-panel-head"><div><span>PLACEMENT TWIN</span><h3>Your route should move only when evidence moves.</h3></div><small>{resultList.length} LIVE SIGNALS</small></div>
              <PlacementTwin results={results} role={role} />
              <div className="v4-twin-caption"><Orbit /><span>Reasoning, technical capability, communication and interview execution converge around one role.</span></div>
            </div>
          </div>

          <div className="v4-consequence-engine reveal">
            <div className="v4-consequence-title"><Route /><div><span>FROM SIGNAL TO CAREER CONSEQUENCE</span><h3>Fine. PrepVista found something. What changes now?</h3></div></div>
            <div className="v4-consequence-flow">
              {[
                ["01", "OBSERVED ISSUE", focusResult?.label ?? "Technical decisions are hard to defend"],
                ["02", "WHERE IT HURTS", focusResult?.round === "aptitude" ? "Online assessment" : focusResult?.round === "communication" ? "Project explanation" : "Technical interview / project defence"],
                ["03", "CAREER RISK", focusResult?.focus ?? "The project may be strong, but the reasoning becomes uncertain under deeper questions."],
                ["04", "NEXT MISSION", focusResult?.mission ?? "Why → alternative → evidence → failure → trade-off"],
                ["05", "PROOF REQUIRED", "Repeat the capability under a changed condition before calling it improved."],
              ].map(([number, label, text], index) => (
                <article key={label} className={index === 3 ? "is-mission" : ""}><span>{number}</span><small>{label}</small><p>{text}</p>{index < 4 && <ArrowRight />}</article>
              ))}
            </div>
          </div>
        </section>

        <section data-chapter="10 / THE DEVELOPMENT SYSTEM" id="system" className="v4-system-world">
          <V4SectionLabel number="10" light>WHAT USING PREPVISTA SHOULD FEEL LIKE</V4SectionLabel>
          <div className="v4-system-heading reveal">
            <p className="v4-kicker">NOT A CONTENT CATALOGUE · A CAREER DEVELOPMENT LOOP</p>
            <h2>Every session should change the next one.</h2>
            <p>You should not leave with five graphs and more uncertainty. You should leave knowing the weak link, the mission, the proof standard and when to re-test.</p>
          </div>
          <div className="v4-system-console reveal">
            <div className="v4-system-tabs" role="tablist" aria-label="PrepVista development loop">
              {systemSteps.map((step, index) => (
                <button key={step.title} role="tab" aria-selected={systemStep === index} className={systemStep === index ? "is-active" : ""} onClick={() => setSystemStep(index)}>
                  <span>{step.number}</span><strong>{step.title}</strong><ChevronRight />
                </button>
              ))}
            </div>
            <div className="v4-system-active" role="tabpanel">
              <div className="v4-system-number">{systemSteps[systemStep].number}</div>
              <span>{systemSteps[systemStep].title.toUpperCase()}</span>
              <h3>{systemSteps[systemStep].line}</h3>
              <p>{systemSteps[systemStep].detail}</p>
              <div className="v4-system-animation" aria-hidden="true">
                <span>ATTEMPT</span><div><i /><i /><i /><i /></div><span>NEXT ACTION</span>
              </div>
              <div className="v4-system-domains"><span>Aptitude</span><span>Technical</span><span>Communication</span><span>Interview</span></div>
            </div>
          </div>
          <div className="v4-future-week reveal">
            <div className="v4-week-intro">
              <Sparkles />
              <span>IF PREPVISTA WERE GUIDING YOU TODAY</span>
              <h3>Your preparation would become a sequence of proof—not a pile of unfinished courses.</h3>
            </div>
            {[
              ["TODAY", "Find the weak link", focusResult?.label ?? "Baseline the capability most likely to block " + role.short],
              ["NEXT", "Train one behaviour", focusResult?.mission ?? "Complete one focused 12-minute mission"],
              ["THEN", "Change the condition", "Re-test with a new problem, prompt or follow-up"],
              ["BEFORE " + copy.deadline.toUpperCase(), "Know what remains uncertain", "Walk in with evidence, not a motivational guess"],
            ].map(([time, title, text], index) => (
              <article key={time}><span>{String(index + 1).padStart(2, "0")}</span><small>{time}</small><strong>{title}</strong><p>{text}</p></article>
            ))}
          </div>
        </section>

        <section data-chapter="11 / WHY THIS IS WORTH USING" className="v4-value-world">
          <V4SectionLabel number="11">THE VALUE IS NOT MORE CONTENT</V4SectionLabel>
          <div className="v4-value-heading reveal">
            <p className="v4-kicker dark">WHY SOMEONE WOULD KEEP USING—AND EVENTUALLY PAY FOR—PREPVISTA</p>
            <h2>A paid product should reduce wasted preparation, not sell you more of it.</h2>
            <p>PrepVista becomes valuable when it shortens the distance between “I practised” and “I can prove this capability when the hiring round changes.”</p>
          </div>
          <div className="v5-time-value reveal">
            <div className="v5-time-value-copy">
              <CalendarRange />
              <span>YOUR FINITE PREPARATION WINDOW</span>
              <h3>The question is not whether you will work hard.<br />It is what your next hour should change.</h3>
              <p>Adjust the inputs. This is not a claim that PrepVista saves a fixed percentage of time; it makes the amount of career preparation currently at stake visible.</p>
            </div>
            <div className="v5-time-controls">
              <label>
                <span>HOURS YOU CAN PREPARE EACH WEEK</span>
                <strong>{hoursPerWeek}<small> HOURS</small></strong>
                <Slider min={2} max={30} step={1} value={[hoursPerWeek]} onValueChange={(value) => setHoursPerWeek(value[0] ?? 8)} aria-label="Hours available for preparation each week" />
              </label>
              <label>
                <span>WEEKS BEFORE {copy.deadline.toUpperCase()}</span>
                <strong>{weeksToMoment}<small> WEEKS</small></strong>
                <Slider min={1} max={26} step={1} value={[weeksToMoment]} onValueChange={(value) => setWeeksToMoment(value[0] ?? 12)} aria-label={`Weeks before ${copy.deadline}`} />
              </label>
            </div>
            <div className="v5-time-total">
              <small>PREPARATION TIME AT STAKE</small>
              <strong>{preparationHours}<span>h</span></strong>
              <p>PrepVista’s value is deciding which capability deserves the next hour, what proof it needs, and when to stop repeating the same kind of practice.</p>
              <div className="v5-time-route"><span>DIAGNOSE</span><i /><span>FOCUS</span><i /><span>RE-TEST</span><i /><strong>CARRY PROOF FORWARD</strong></div>
            </div>
          </div>
          <div className="v4-contrast-table reveal">
            <div className="v4-contrast-head"><span>WITHOUT A READINESS SYSTEM</span><span>WITH PREPVISTA</span></div>
            {preparationContrast.map(([before, after], index) => (
              <article key={before}><b>{String(index + 1).padStart(2, "0")}</b><p><X />{before}</p><i /><p><Check />{after}</p></article>
            ))}
          </div>
          <div className="v4-value-outcome reveal">
            <div className="v4-value-orbit" aria-hidden="true"><i /><i /><span><Crosshair /></span></div>
            <div><span>THE PRODUCT PROMISE WE ARE WORKING TOWARD</span><h3>Do not prepare for everything.<br />Prepare for what is stopping you.</h3><p>Find it → train it → test it again → carry the evidence forward.</p></div>
            <Button className="v4-dark-cta" onClick={() => scrollToId("gauntlet")}>Experience the difference <ArrowRight /></Button>
          </div>
        </section>

        <section id="trust" data-chapter="12 / WHAT IS REAL" className="v4-trust-world">
          <V4SectionLabel number="12" light>TRUST IS PART OF THE PRODUCT</V4SectionLabel>
          <div className="v4-trust-heading reveal">
            <p className="v4-kicker">IF THIS WERE JUST A MARKETING CLAIM, WE WOULD HIDE THE BOUNDARIES</p>
            <h2>See what works today.<br /><em>See what is still being built.</em></h2>
          </div>
          <div className="v4-build-state reveal">
            <article className="is-live"><div><span><i /> WORKING PROTOTYPE</span><small>REAL TODAY</small></div><InterviewRoundVisual /><h3>Candidate interview experience</h3><p>Candidate-side interview flow with answer-aware follow-up logic and observable response evidence.</p></article>
            <article className="is-building"><div><span><Workflow /> IN DEVELOPMENT / INTEGRATION</span><small>BUILDING</small></div><div className="v4-module-stack" aria-hidden="true"><i>APT</i><i>CODE</i><i>VOICE</i><i>ONE TWIN</i></div><h3>Unified aptitude, technical and communication systems</h3><p>Deep capability concepts exist across modules; broader unified product integration remains in progress.</p></article>
            <article className="is-boundary"><div><span><ShieldCheck /> TRUTH BOUNDARY</span><small>NOT CLAIMED</small></div><div className="v4-zero-proof"><strong>0</strong><span>INVENTED USERS<br />INVENTED OUTCOMES<br />INVENTED TESTIMONIALS</span></div><h3>Early-stage means early-stage</h3><p>No invented colleges, customers, placement outcomes, revenue or social-proof theatre.</p></article>
          </div>
          <div className="v4-trust-contract reveal">
            <article><ShieldCheck /><strong>No placement guarantee</strong><p>Employers make hiring decisions. PrepVista helps you prepare and produce evidence.</p></article>
            <article><Mic /><strong>Permission before voice</strong><p>Microphone access starts only when you explicitly choose it. Typed paths remain available.</p></article>
            <article><Eye /><strong>Narrow evidence, narrow conclusion</strong><p>A short session never becomes a complete readiness or hiring prediction.</p></article>
            <article><LockKeyhole /><strong>No signup to explore</strong><p>The live landing experience delivers value before it asks for commitment.</p></article>
          </div>
        </section>

        <section id="vote" data-chapter="13 / THE DECISION" className="v4-vote-world">
          <div className="v4-vote-grid" aria-hidden="true" />
          <div className="v4-vote-route" aria-hidden="true"><i /><i /><i /><span><Target /></span></div>
          <div className="v4-vote-role"><span>YOUR DIRECTION</span><strong>{selectedRoleId ? role.name : "A career worth preparing for"}</strong></div>
          <div className="v4-vote-content reveal">
            <span className="v4-vote-kicker">YOU HAVE NOT SEEN A PLACEMENT PROMISE · YOU HAVE SEEN HOW THE IDEA THINKS</span>
            <h2>Would you want this between you and {copy.deadline}?</h2>
            <p>We are building PrepVista so students and professionals do not have to guess what is blocking them, waste time preparing for everything, or discover the weak link only after the recruiter does.</p>
            <div className="v5-vote-summary">
              <article><span>YOUR DIRECTION</span><strong>{selectedRoleId ? role.name : "Choose your target role"}</strong></article>
              <article><span>LIVE EVIDENCE</span><strong>{resultList.length === 0 ? "Nothing invented" : `${resultList.length} signal${resultList.length === 1 ? "" : "s"} produced`}</strong></article>
              <article><span>CURRENT USEFUL MOVE</span><strong>{focusResult?.mission ?? activeGate.proof}</strong></article>
            </div>
            <div className="v4-vote-actions">
              <Button className="v4-vote-primary" onClick={() => setVoteNotice(true)}>Yes — Vote for PrepVista <ArrowUpRight /></Button>
              <Button variant="ghost" className="v4-vote-secondary" onClick={() => scrollToId("gauntlet")}>I want to test another round <RotateCcw /></Button>
            </div>
            <small>Your vote supports the idea. It does not enrol you, charge you or share your challenge responses.</small>
          </div>
        </section>

        <section className="v4-faq-world">
          <div className="v4-faq-heading reveal"><p className="v4-kicker dark">BEFORE YOU DECIDE</p><h2>Clear questions.<br />Honest answers.</h2></div>
          <Accordion type="single" collapsible className="v4-faq-list reveal">
            {faqItems.map((item, index) => (
              <AccordionItem key={item.q} value={"item-" + index} className="v4-faq-item">
                <AccordionTrigger className="v4-faq-trigger"><span>{String(index + 1).padStart(2, "0")}</span>{item.q}</AccordionTrigger>
                <AccordionContent className="v4-faq-content">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <footer className="v4-footer">
          <div className="v4-footer-top"><Logo inverse /><h2>Find the weak link.<br />Change the outcome.</h2></div>
          <div className="v4-footer-mid">
            <div><span>EXPLORE</span><button onClick={() => scrollToId("gauntlet")}>Live experience</button><button onClick={() => scrollToId("career-proof")}>Career proof</button><button onClick={() => scrollToId("trust")}>Prototype status</button></div>
            <div><span>PRINCIPLES</span><p>Evidence before confidence</p><p>One blocker before ten tasks</p><p>Re-test before claiming progress</p></div>
            <div><span>STATUS</span><p>Early-stage prototype</p><p>Startupthon 2026</p><p>No placement guarantee</p></div>
          </div>
          <div className="v4-footer-bottom"><span>© 2026 PREPVISTA</span><span>APTITUDE × TECHNICAL × COMMUNICATION × INTERVIEW</span><span>CAREER READINESS, MADE VISIBLE</span></div>
        </footer>

        <ChallengeDialog round={activeRound} role={role} onClose={() => setActiveRound(null)} onComplete={completeRound} />
        <Dialog open={voteNotice} onOpenChange={setVoteNotice}>
          <DialogContent className="vote-notice-dialog">
            <DialogHeader>
              <DialogTitle>Official voting link not connected yet</DialogTitle>
              <DialogDescription>This local V4 keeps the vote action truthful. Connect PrepVista’s official Startupthon voting URL before public release.</DialogDescription>
            </DialogHeader>
            <Button className="primary-button" onClick={() => setVoteNotice(false)}>Return to PrepVista</Button>
          </DialogContent>
        </Dialog>
      </main>
    </TooltipProvider>
  )
}

function InterviewRoundVisual() {
  return (
    <div className="v4-interview-visual" aria-hidden="true">
      <span>YOUR ANSWER</span><i /><strong>WHY?</strong><i /><strong>PROVE IT.</strong><i /><b>DEFEND</b>
    </div>
  )
}
