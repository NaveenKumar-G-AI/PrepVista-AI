// Heuristic-only. Deliberately never concludes "this is a scam" -- only ever
// surfaces signals for the student to verify, per spec section 39/40.

const HIGH_RISK_PATTERNS = [
  { re: /registration fee|training fee|processing fee|security deposit|refundable deposit/i, signal: 'Requests a fee or deposit', detail: 'The posting mentions a fee or deposit. Legitimate employers do not charge candidates to apply or to be hired.' },
  { re: /pay\s*(₹|rs\.?|inr|\$)\s?\d/i, signal: 'Asks the candidate to pay money', detail: 'The posting asks the candidate to pay an amount. Treat this as a strong warning sign.' },
  { re: /\botp\b|one[- ]time password|aadhaar (number|card)|bank account (number|details)|credit card (number|details)|cvv/i, signal: 'Requests sensitive personal or financial data upfront', detail: 'Sharing OTPs, bank details, ID numbers, or card details before any formal offer is a common fraud pattern.' },
  { re: /100% job guarantee|guaranteed placement|no interview required|instant hire|earn ₹?\$?\d[\d,]* ?\/ ?day/i, signal: 'Makes guarantee or instant-hire claims', detail: 'Guaranteed jobs, instant hiring, or unrealistic daily earnings claims are common in fraudulent postings.' },
];

const VERIFY_PATTERNS = [
  { re: /bit\.ly|tinyurl|t\.co\//i, signal: 'Uses a shortened application link', detail: 'Shortened links make it hard to verify where an application actually goes.' },
  { re: /gmail\.com|yahoo\.com|outlook\.com|hotmail\.com/i, signal: 'Recruiter contact uses a personal email domain', detail: 'A personal email address is unusual for a company\'s official hiring communication -- worth confirming independently.' },
  { re: /limited seats|urgent hiring|apply immediately|only \d+ (spots|seats) left/i, signal: 'Uses urgency or scarcity pressure', detail: 'Artificial urgency is sometimes used to discourage candidates from verifying details before acting.' },
];

function checkOpportunitySafety({ raw_jd_text = '', company = '', source_url = '', compensation_text = '', source_type = 'STUDENT_ADDED' }) {
  const haystack = `${raw_jd_text}\n${company}\n${source_url}\n${compensation_text}`;
  const signals = [];

  for (const p of HIGH_RISK_PATTERNS) {
    if (p.re.test(haystack)) signals.push({ signal: p.signal, detail: p.detail, severity: 'HIGH' });
  }
  for (const p of VERIFY_PATTERNS) {
    if (p.re.test(haystack)) signals.push({ signal: p.signal, detail: p.detail, severity: 'VERIFY' });
  }

  if (!company || company.trim().length < 2) {
    signals.push({ signal: 'Company identity is unclear', detail: 'No clear company name was provided -- verify who is actually hiring before applying.', severity: 'VERIFY' });
  }

  if (source_type === 'UNKNOWN' || source_type === 'STUDENT_ADDED') {
    signals.push({ signal: 'Source not independently verified', detail: 'This opportunity was added manually and has not been cross-checked against an official source yet.', severity: 'VERIFY' });
  }

  const hasHigh = signals.some((s) => s.severity === 'HIGH');
  const hasVerify = signals.some((s) => s.severity === 'VERIFY');
  const concern_level = hasHigh ? 'HIGH' : hasVerify ? 'VERIFY' : 'LOW';

  const summary = concern_level === 'HIGH'
    ? 'Multiple signals suggest you should independently verify this opportunity before doing anything else -- including before sharing any personal information.'
    : concern_level === 'VERIFY'
      ? 'A few details couldn\'t be independently confirmed. Verify the company and application channel before applying.'
      : 'No obvious concern signals were detected. This is not a guarantee of legitimacy -- always verify independently.';

  return { concern_level, signals, summary };
}

module.exports = { checkOpportunitySafety };
