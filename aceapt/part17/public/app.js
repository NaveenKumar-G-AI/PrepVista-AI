(() => {
  const API = '/api';

  const el = (id) => document.getElementById(id);

  const dom = {
    modeSelect: el('modeSelect'),
    toggleIntel: el('toggleIntel'),
    layout: document.querySelector('.layout'),

    setupView: el('setupView'),
    studentIdInput: el('studentIdInput'),
    startBlankBtn: el('startBlankBtn'),
    startDemoBtn: el('startDemoBtn'),

    practiceView: el('practiceView'),
    studentIdReadout: el('studentIdReadout'),
    skillReadout: el('skillReadout'),
    timer: el('timer'),

    purposeStamp: el('purposeStamp'),
    sourceTag: el('sourceTag'),
    whyText: el('whyText'),
    questionStem: el('questionStem'),
    optionsList: el('optionsList'),
    targetsRow: el('targetsRow'),

    submitBtn: el('submitBtn'),
    continueBtn: el('continueBtn'),

    resultCard: el('resultCard'),
    resultVerdict: el('resultVerdict'),
    resultExplanation: el('resultExplanation'),
    resultLearned: el('resultLearned'),

    practiceSetBtn: el('practiceSetBtn'),
    practiceSetList: el('practiceSetList'),

    intelPanel: el('intelPanel'),
    meters: el('meters'),
    journeyReadout: el('journeyReadout'),
    arcReadout: el('arcReadout'),
    eventsFeed: el('eventsFeed'),

    generationModeReadout: el('generationModeReadout'),
  };

  const state = {
    studentId: null,
    mode: 'LEARNING',
    currentQuestion: null,
    currentPurpose: null,
    selectedOptionId: null,
    questionStartedAt: null,
    timerHandle: null,
    answered: false,
    intelVisible: false,
    lastSkillSnapshot: null,
  };

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  async function api(path, opts) {
    const res = await fetch(`${API}${path}`, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`);
    return data;
  }

  function fmtClock(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const s = String(totalSeconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function humanizeSkill(skillId) {
    if (!skillId) return '—';
    return skillId.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  }

  function startTimer() {
    stopTimer();
    state.questionStartedAt = Date.now();
    dom.timer.textContent = '00:00';
    state.timerHandle = setInterval(() => {
      dom.timer.textContent = fmtClock(Date.now() - state.questionStartedAt);
    }, 250);
  }

  function stopTimer() {
    if (state.timerHandle) clearInterval(state.timerHandle);
    state.timerHandle = null;
  }

  // ---------------------------------------------------------------------
  // Session start
  // ---------------------------------------------------------------------

  async function startSession(preset) {
    const typed = dom.studentIdInput.value.trim();
    const studentId = typed || `student-${Date.now().toString(36)}`;
    const body = { studentId, name: typed || undefined };
    if (preset) body.preset = preset;

    await api('/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    state.studentId = studentId;
    dom.setupView.hidden = true;
    dom.practiceView.hidden = false;
    dom.toggleIntel.hidden = false;
    dom.studentIdReadout.textContent = studentId;

    checkGenerationMode();
    await loadNextQuestion();
  }

  async function checkGenerationMode() {
    try {
      const health = await api('/health');
      dom.generationModeReadout.textContent = health.generationMode;
    } catch {
      dom.generationModeReadout.textContent = 'unknown';
    }
  }

  // ---------------------------------------------------------------------
  // Question flow
  // ---------------------------------------------------------------------

  async function loadNextQuestion() {
    resetQuestionUI();
    dom.questionStem.textContent = 'Selecting the right question…';

    const query = new URLSearchParams({ mode: state.mode });
    const data = await api(`/question/next/${encodeURIComponent(state.studentId)}?${query.toString()}`);

    state.currentQuestion = data.question;
    state.currentPurpose = data.purpose;

    dom.skillReadout.textContent = humanizeSkill(data.question.microSkill);
    dom.purposeStamp.textContent = `⌁ ${data.purpose.replace(/_/g, ' ')}`;
    dom.sourceTag.textContent = data.source ? `source: ${data.source}` : '';
    dom.whyText.textContent = data.why;
    dom.questionStem.textContent = data.question.stem;

    renderOptions(data.question.options);
    renderTargets(data.targets);
    updateMeters(data.skillSnapshot);

    startTimer();
    refreshIntel();
  }

  function resetQuestionUI() {
    stopTimer();
    state.selectedOptionId = null;
    state.answered = false;
    dom.optionsList.innerHTML = '';
    dom.targetsRow.innerHTML = '';
    dom.resultCard.hidden = true;
    dom.submitBtn.hidden = false;
    dom.submitBtn.disabled = true;
    dom.continueBtn.hidden = true;
  }

  function renderOptions(options) {
    dom.optionsList.innerHTML = '';
    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.className = 'option';
      btn.dataset.optionId = opt.id;
      btn.innerHTML = `<span class="option-id">${opt.id}</span><span>${opt.text}</span>`;
      btn.addEventListener('click', () => selectOption(opt.id));
      dom.optionsList.appendChild(btn);
    });
  }

  function selectOption(optionId) {
    if (state.answered) return;
    state.selectedOptionId = optionId;
    [...dom.optionsList.children].forEach((b) => b.classList.toggle('selected', b.dataset.optionId === optionId));
    dom.submitBtn.disabled = false;
  }

  function renderTargets(targets) {
    dom.targetsRow.innerHTML = '';
    (targets || []).forEach((t) => {
      const chip = document.createElement('span');
      chip.className = `target-chip${t.active ? ' active' : ''}`;
      chip.innerHTML = `<span class="glyph">${t.active ? '✓' : '○'}</span>${t.label}`;
      dom.targetsRow.appendChild(chip);
    });
  }

  async function submitAnswer() {
    if (!state.selectedOptionId || state.answered) return;
    state.answered = true;
    stopTimer();
    const responseTimeMs = Date.now() - state.questionStartedAt;

    dom.submitBtn.disabled = true;

    const result = await api('/question/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: state.studentId,
        questionId: state.currentQuestion.id,
        optionId: state.selectedOptionId,
        responseTimeMs,
      }),
    });

    [...dom.optionsList.children].forEach((b) => {
      b.classList.add('locked');
      b.disabled = true;
      if (b.dataset.optionId === result.correctOptionId) b.classList.add('correct-reveal');
      else if (b.dataset.optionId === state.selectedOptionId) b.classList.add('incorrect-reveal');
    });

    dom.resultVerdict.textContent = result.correct ? 'Correct' : 'Not quite';
    dom.resultExplanation.textContent = result.officialExplanation;
    dom.resultLearned.textContent = result.whatWeLearned;
    dom.resultCard.hidden = false;

    dom.submitBtn.hidden = true;
    dom.continueBtn.hidden = false;

    updateMeters(result.skillSnapshot);
    refreshIntel();
  }

  // ---------------------------------------------------------------------
  // Meters (System Intelligence)
  // ---------------------------------------------------------------------

  const DIMENSIONS = ['concept', 'strategy', 'transfer', 'speed'];

  function updateMeters(snapshot) {
    if (!snapshot) return;
    const prev = state.lastSkillSnapshot;
    dom.meters.innerHTML = '';

    DIMENSIONS.forEach((dim) => {
      const value = snapshot[dim] ?? 0;
      const wrap = document.createElement('div');
      wrap.className = 'meter';

      const delta = prev ? Math.round((value - (prev[dim] ?? value)) * 100) / 100 : 0;
      const deltaHtml = delta !== 0
        ? `<span class="meter-delta${delta < 0 ? ' negative' : ''}">${delta > 0 ? '+' : ''}${delta.toFixed(2)}</span>`
        : '';

      wrap.innerHTML = `
        <div class="meter-label"><span>${dim}</span><span><span class="meter-value mono">${value.toFixed(2)}</span>${deltaHtml}</span></div>
        <div class="meter-track"><div class="meter-fill" style="width:0%"></div></div>
      `;
      dom.meters.appendChild(wrap);

      // Force a layout pass so the width transition actually animates from 0.
      const fill = wrap.querySelector('.meter-fill');
      requestAnimationFrame(() => { fill.style.width = `${Math.round(value * 100)}%`; });
    });

    state.lastSkillSnapshot = snapshot;
  }

  // ---------------------------------------------------------------------
  // Intel panel (student state + events)
  // ---------------------------------------------------------------------

  async function refreshIntel() {
    if (!state.studentId) return;
    try {
      const [{ student }, { events }] = await Promise.all([
        api(`/student/${encodeURIComponent(state.studentId)}/state`),
        api(`/events/${encodeURIComponent(state.studentId)}?limit=12`),
      ]);

      dom.journeyReadout.textContent = `${student.journey.stage} → ${humanizeSkill(student.journey.currentObjectiveSkill)}`;
      dom.arcReadout.textContent = student.activeArc
        ? `${student.activeArc.diagnosis} · step ${student.activeArc.stepIndex + 1}/${student.activeArc.steps.length} · next: ${student.activeArc.steps[student.activeArc.stepIndex]}`
        : (student.pendingDiagnostic ? 'pending diagnostic follow-up' : 'none');

      dom.eventsFeed.innerHTML = '';
      events.forEach((e) => {
        const li = document.createElement('li');
        const detail = e.payload.purpose || e.payload.branch || e.payload.diagnosis?.gapType || e.payload.reason || '';
        li.innerHTML = `<span>${e.type}</span><span class="evt-detail">${detail}</span>`;
        dom.eventsFeed.appendChild(li);
      });
    } catch (e) {
      // Non-fatal — the intel panel is a bonus view, not core flow.
      console.warn('intel refresh failed', e);
    }
  }

  function toggleIntelPanel() {
    state.intelVisible = !state.intelVisible;
    dom.intelPanel.hidden = !state.intelVisible;
    dom.layout.classList.toggle('with-intel', state.intelVisible);
    dom.toggleIntel.textContent = state.intelVisible ? 'Hide System Intelligence' : 'System Intelligence';
    if (state.intelVisible) refreshIntel();
  }

  // ---------------------------------------------------------------------
  // Practice set
  // ---------------------------------------------------------------------

  async function buildPracticeSet() {
    dom.practiceSetList.hidden = false;
    dom.practiceSetList.innerHTML = '<p class="setup-hint">Composing your set…</p>';
    const data = await api(`/question/practice-set/${encodeURIComponent(state.studentId)}`);

    dom.practiceSetList.innerHTML = '';
    if (data.items.length === 0) {
      dom.practiceSetList.innerHTML = '<p class="setup-hint">Not enough distinct questions in the bank yet for this student\'s current skills — answer a few more to unlock a fuller set.</p>';
      return;
    }
    data.items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'practice-set-item';
      row.innerHTML = `<span class="ps-purpose">${item.purpose.replace(/_/g, ' ')}</span><span class="ps-stem">${item.question.stem}</span>`;
      dom.practiceSetList.appendChild(row);
    });
  }

  // ---------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------

  dom.startBlankBtn.addEventListener('click', () => startSession(null).catch(showError));
  dom.startDemoBtn.addEventListener('click', () => startSession('percentage-demo').catch(showError));
  dom.submitBtn.addEventListener('click', () => submitAnswer().catch(showError));
  dom.continueBtn.addEventListener('click', () => loadNextQuestion().catch(showError));
  dom.toggleIntel.addEventListener('click', toggleIntelPanel);
  dom.practiceSetBtn.addEventListener('click', () => buildPracticeSet().catch(showError));
  dom.modeSelect.addEventListener('change', () => { state.mode = dom.modeSelect.value; });
  dom.studentIdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') dom.startBlankBtn.click(); });

  function showError(e) {
    console.error(e);
    dom.questionStem.textContent = `Something went wrong: ${e.message}`;
  }

  checkGenerationMode();
})();
