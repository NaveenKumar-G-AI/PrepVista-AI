const API_BASE = "/api/socratic";
const SESSION_STORAGE_KEY = "aceapt_session_id";
const STUDENT_STORAGE_KEY = "aceapt_student_id";

function getStudentId() {
  let id = localStorage.getItem(STUDENT_STORAGE_KEY);
  if (!id) {
    id = "student-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(STUDENT_STORAGE_KEY, id);
  }
  return id;
}

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-student-id": getStudentId(),
      ...(options.headers || {}),
    },
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    // no body - leave data as {}
  }
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const state = {
  session: null,
  tutorTurns: [], // local ledger of tutor turns only, for the margin rail
};

const els = {
  workspace: document.getElementById("workspace"),
  skillLabel: document.getElementById("skill-label"),
  goalText: document.getElementById("goal-text"),
  progressDots: document.getElementById("progress-dots"),
  progressCaption: document.getElementById("progress-caption"),
  ledger: document.getElementById("ledger"),
  newSessionButton: document.getElementById("new-session-button"),
  previousResponse: document.getElementById("previous-response"),
  coachMessage: document.getElementById("coach-message"),
  whyToggle: document.getElementById("why-toggle"),
  whyText: document.getElementById("why-text"),
  responseForm: document.getElementById("response-form"),
  responseInput: document.getElementById("response-input"),
  submitButton: document.getElementById("submit-button"),
  stepCaption: document.getElementById("step-caption"),
  controlRow: document.getElementById("control-row"),
  completionPanel: document.getElementById("completion-panel"),
  completionSkill: document.getElementById("completion-skill"),
  completionDemonstrated: document.getElementById("completion-demonstrated"),
  completionDevelopingWrap: document.getElementById("completion-developing-wrap"),
  completionDeveloping: document.getElementById("completion-developing"),
  completionVerification: document.getElementById("completion-verification"),
  completionNewButton: document.getElementById("completion-new-button"),
  errorBanner: document.getElementById("error-banner"),
  liveRegion: document.getElementById("live-region"),
};

const CONTROL_VISIBLE_STATES = new Set(["IDENTIFICATION", "GUIDED_REASONING", "HINT"]);

function formatLabel(raw) {
  return (raw || "").replace(/_/g, " ").toLowerCase();
}

function dotColor(classification) {
  if (classification === "CORRECT_REASONING") return "var(--accent-verified)";
  if (classification === "MISCONCEPTION") return "var(--accent-focus)";
  if (classification === "CORRECT_GUESS" || classification === "PARTIALLY_CORRECT") return "var(--accent-caution)";
  return "var(--rule)";
}

function progressForState(teachingState) {
  const map = {
    INTRODUCTION: 0,
    OBJECTIVE_SETUP: 0,
    IDENTIFICATION: 0,
    GUIDED_REASONING: 1,
    MISCONCEPTION_CHECK: 1,
    HINT: 1,
    PARTIAL_EXPLANATION: 1,
    INDEPENDENT_ATTEMPT: 2,
    TRANSFER_VERIFICATION: 3,
    TEACH_BACK: 3,
    COMPLETED: 4,
    ESCALATED: 1,
  };
  return map[teachingState] ?? 0;
}

function captionForState(teachingState) {
  const map = {
    IDENTIFICATION: "Just getting started",
    GUIDED_REASONING: "Working through the reasoning",
    MISCONCEPTION_CHECK: "Testing an idea against an example",
    HINT: "Working through the reasoning",
    PARTIAL_EXPLANATION: "Reviewing the idea together",
    INDEPENDENT_ATTEMPT: "Trying it without help",
    TRANSFER_VERIFICATION: "Verifying with a new example",
    TEACH_BACK: "Explaining the idea back",
    COMPLETED: "Understanding demonstrated",
    ESCALATED: "Bringing in more support",
  };
  return map[teachingState] || "";
}

function setBusy(busy) {
  els.workspace.setAttribute("aria-busy", String(busy));
  els.responseInput.disabled = busy;
  els.submitButton.disabled = busy;
  els.controlRow.querySelectorAll("button").forEach((b) => (b.disabled = busy));
}

function showError(message) {
  els.errorBanner.textContent = message;
  els.errorBanner.hidden = false;
  setTimeout(() => {
    els.errorBanner.hidden = true;
  }, 5000);
}

function renderProgressDots(filled) {
  els.progressDots.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const dot = document.createElement("span");
    if (i < filled) dot.classList.add("filled");
    els.progressDots.appendChild(dot);
  }
}

function renderLedger() {
  els.ledger.innerHTML = "";
  for (const turn of state.tutorTurns) {
    const li = document.createElement("li");
    li.style.setProperty("--dot-color", dotColor(turn.responseClassification));
    const intent = document.createElement("span");
    intent.className = "ledger-intent";
    intent.textContent = formatLabel(turn.intent || turn.targetStep || "step");
    li.appendChild(intent);
    li.appendChild(document.createTextNode(truncate(turn.content, 70)));
    els.ledger.appendChild(li);
  }
  els.ledger.scrollTop = els.ledger.scrollHeight;
}

function truncate(text, max) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function renderTutorTurn(turn) {
  els.coachMessage.textContent = turn.content;
  if (turn.whyThisQuestion) {
    els.whyToggle.hidden = false;
    els.whyText.textContent = turn.whyThisQuestion;
  } else {
    els.whyToggle.hidden = true;
    els.whyText.hidden = true;
    els.whyToggle.setAttribute("aria-expanded", "false");
  }
  els.stepCaption.textContent = formatLabel(turn.intent || turn.targetStep || "");
  els.liveRegion.textContent = turn.content;
}

function renderSession() {
  const session = state.session;
  if (!session) return;

  els.skillLabel.textContent = formatLabel(session.problem.skill.split(".").pop());
  els.goalText.textContent = humanizeObjective(session.objective.objective);
  renderProgressDots(progressForState(session.state));
  els.progressCaption.textContent = captionForState(session.state);
  renderLedger();

  const active = session.status === "active";
  els.responseForm.hidden = !active;
  els.controlRow.hidden = !active || !CONTROL_VISIBLE_STATES.has(session.state);
  els.completionPanel.hidden = active;

  if (!active) {
    renderCompletion(session);
  }
}

function humanizeObjective(objective) {
  return formatLabel(objective).replace(/_/g, " ");
}

function renderCompletion(session) {
  const summary = session.completionSummary;
  els.completionSkill.textContent = formatLabel(session.problem.skill.split(".").pop());
  els.completionDemonstrated.innerHTML = "";
  els.completionDeveloping.innerHTML = "";

  if (!summary) {
    els.completionVerification.textContent =
      session.status === "escalated"
        ? "This one needs a worked explanation with a tutor - that's alright, not every problem resolves through questions alone."
        : "Session ended before verification.";
    els.completionDevelopingWrap.hidden = true;
    return;
  }

  for (const item of summary.demonstrated) {
    const li = document.createElement("li");
    li.textContent = item;
    els.completionDemonstrated.appendChild(li);
  }
  if (summary.stillDeveloping.length === 0) {
    els.completionDevelopingWrap.hidden = true;
  } else {
    els.completionDevelopingWrap.hidden = false;
    for (const item of summary.stillDeveloping) {
      const li = document.createElement("li");
      li.textContent = item;
      els.completionDeveloping.appendChild(li);
    }
  }

  const verificationText = {
    independent_problem_solved: "Verification: solved a new, independent problem without hints.",
    not_verified: "Verification: not yet completed.",
    verification_failed: "Verification: a gap remains - a tutor can help close it.",
  };
  els.completionVerification.textContent = verificationText[summary.verification] || "";
}

function applyOutcome(outcome, studentText) {
  state.session = outcome.session;
  state.tutorTurns.push(outcome.tutorTurn);
  if (studentText !== undefined) {
    els.previousResponse.hidden = false;
    els.previousResponse.innerHTML = "";
    const strong = document.createElement("strong");
    strong.textContent = "You wrote: ";
    els.previousResponse.appendChild(strong);
    els.previousResponse.appendChild(document.createTextNode(studentText));
  }
  renderTutorTurn(outcome.tutorTurn);
  renderSession();
  els.responseInput.value = "";
  if (!els.responseForm.hidden) els.responseInput.focus();
}

async function startNewSession() {
  setBusy(true);
  try {
    const outcome = await api("/sessions", { method: "POST" });
    localStorage.setItem(SESSION_STORAGE_KEY, outcome.session.id);
    state.tutorTurns = [];
    els.previousResponse.hidden = true;
    applyOutcome(outcome);
  } catch (err) {
    showError("Could not start a session: " + err.message);
  } finally {
    setBusy(false);
  }
}

async function resumeSession(id) {
  setBusy(true);
  try {
    const data = await api(`/sessions/${id}`);
    state.session = data.session;
    state.tutorTurns = data.turns.filter((t) => t.speaker === "tutor");
    const lastTutorTurn = state.tutorTurns[state.tutorTurns.length - 1];
    if (lastTutorTurn) renderTutorTurn(lastTutorTurn);
    renderSession();
  } catch {
    await startNewSession();
  } finally {
    setBusy(false);
  }
}

async function sendResponse(text) {
  if (!text.trim() || !state.session) return;
  setBusy(true);
  try {
    const outcome = await api(`/sessions/${state.session.id}/respond`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    applyOutcome(outcome, text);
  } catch (err) {
    if (err.status === 409) {
      showError("That crossed with another update - refreshing.");
      await resumeSession(state.session.id);
    } else {
      showError("Could not send your answer: " + err.message);
    }
  } finally {
    setBusy(false);
  }
}

async function runControlAction(action) {
  if (!state.session) return;
  const endpoints = {
    hint: `/sessions/${state.session.id}/hint`,
    explain: `/sessions/${state.session.id}/explain`,
    simplify: `/sessions/${state.session.id}/simplify`,
    independent: `/sessions/${state.session.id}/solve-independently`,
  };
  const path = endpoints[action];
  if (!path) return;
  setBusy(true);
  try {
    const outcome = await api(path, { method: "POST" });
    applyOutcome(outcome);
  } catch (err) {
    showError("That didn't go through: " + err.message);
  } finally {
    setBusy(false);
  }
}

// ---- wire up events ----

els.responseForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendResponse(els.responseInput.value);
});

els.responseInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendResponse(els.responseInput.value);
  }
});

els.controlRow.addEventListener("click", (e) => {
  const button = e.target.closest("button[data-action]");
  if (button) runControlAction(button.dataset.action);
});

els.whyToggle.addEventListener("click", () => {
  const expanded = els.whyToggle.getAttribute("aria-expanded") === "true";
  els.whyToggle.setAttribute("aria-expanded", String(!expanded));
  els.whyText.hidden = expanded;
});

els.newSessionButton.addEventListener("click", startNewSession);
els.completionNewButton.addEventListener("click", startNewSession);

// ---- boot ----

const existingSessionId = localStorage.getItem(SESSION_STORAGE_KEY);
if (existingSessionId) {
  resumeSession(existingSessionId);
} else {
  startNewSession();
}
