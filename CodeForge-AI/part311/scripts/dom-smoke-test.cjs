const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "src", "web", "index.html"), "utf8");
const scriptMatch = html.match(/<script>\s*\n([\s\S]*?)\n<\/script>/);
const script = scriptMatch[1];

const idAttrs = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);

class FakeElement {
  constructor(tag, id) {
    this.tagName = (tag || "div").toUpperCase();
    this.id = id || "";
    this._text = "";
    this._html = "";
    this._value = "";
    this.className = "";
    this.hidden = false;
    this.disabled = false;
    this.children = [];
    this._listeners = {};
    this.style = {};
    this.selectionStart = 0;
    this.selectionEnd = 0;
  }
  addEventListener(evt, fn) {
    (this._listeners[evt] = this._listeners[evt] || []).push(fn);
  }
  dispatchEvent(evt, obj) {
    (this._listeners[evt] || []).forEach((fn) => fn(obj || { preventDefault() {} }));
  }
  get textContent() {
    return this._text;
  }
  set textContent(v) {
    this._text = String(v);
    // Real browsers keep innerHTML in sync (HTML-escaped) when textContent is set —
    // needed because the page's esc() helper relies on exactly this round-trip.
    this._html = String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  get innerHTML() {
    return this._html;
  }
  set innerHTML(v) {
    this._html = String(v);
  }
  get value() {
    return this._value;
  }
  set value(v) {
    this._value = String(v);
  }
  appendChild(c) {
    this.children.push(c);
    return c;
  }
  prepend(c) {
    this.children.unshift(c);
    return c;
  }
  removeAttribute() {}
  setAttribute() {}
}

const registry = new Map();
for (const id of idAttrs) registry.set(id, new FakeElement("div", id));

const fakeDocument = {
  getElementById(id) {
    return registry.get(id) || null;
  },
  createElement(tag) {
    return new FakeElement(tag, "");
  },
};

let errors = [];
const sandbox = {
  document: fakeDocument,
  console: { log: (...a) => console.log("[page]", ...a), error: (...a) => errors.push(a.join(" ")) },
  fetch: () => Promise.reject(new Error("fetch stub — live mode not exercised in this DOM-stub test")),
  JSON,
  Object,
  Array,
  String,
  Number,
  Math,
  Promise,
  setTimeout,
};
vm.createContext(sandbox);

try {
  vm.runInContext(script, sandbox, { filename: "index.html:script" });
  console.log("\u2713 script executed to completion (init() ran without throwing)");
} catch (e) {
  console.log("\u2717 SCRIPT THREW:", e.message);
  console.log(e.stack);
  process.exit(1);
}

// --- exercise the actual wired-up interactions, same as a real user would ---
const editor = registry.get("editor");
const gutter = registry.get("gutter");
const btnRun = registry.get("btn-run");
const btnSubmit = registry.get("btn-submit");
const btnHint = registry.get("btn-hint");
const languageSelect = registry.get("language-select");
const useLive = registry.get("use-live");
const resultsStatus = registry.get("results-status");
const testGrid = registry.get("test-grid");
const evidenceScore = registry.get("evidence-score");
const challengeTitle = registry.get("challenge-title");
const historyStrip = registry.get("history-strip");
const hintList = registry.get("hint-list");

console.log("\ninitial challenge title:", JSON.stringify(challengeTitle.textContent));
if (!challengeTitle.textContent.includes("Deduplicating")) throw new Error("challenge title did not render");

console.log("initial evidence score:", evidenceScore.textContent);
if (evidenceScore.textContent !== "0.823") throw new Error("evidence score did not render as expected (0.823), got: " + evidenceScore.textContent);

console.log("initial gutter (should be '1' for the single starting line count matching starter code lines):", JSON.stringify(gutter.textContent).slice(0, 20) + "...");
const starterLineCount = editor.value.split("\n").length;
const gutterLineCount = gutter.textContent.split("\n").length;
if (starterLineCount !== gutterLineCount) throw new Error(`gutter line count (${gutterLineCount}) does not match editor line count (${starterLineCount})`);
console.log(`\u2713 gutter line count matches editor (${gutterLineCount} lines)`);

console.log("\n--- clicking Run on unmodified buggy starter (mock mode) ---");
btnRun.dispatchEvent("click");
console.log("results-status html:", resultsStatus.innerHTML);
console.log("test-grid html:", testGrid.innerHTML);
if (!resultsStatus.innerHTML.includes("3/4")) throw new Error("expected 3/4 public tests passed for the buggy starter's Run, got: " + resultsStatus.innerHTML);
console.log("\u2713 Run correctly shows 3/4 public tests passing (p4 fails, matching the real captured data)");

console.log("\n--- clicking Submit on unmodified buggy starter (mock mode) ---");
btnSubmit.dispatchEvent("click");
console.log("results-status html:", resultsStatus.innerHTML);
if (!resultsStatus.innerHTML.includes("8/10")) throw new Error("expected 8/10 on submit, got: " + resultsStatus.innerHTML);
console.log("\u2713 Submit correctly shows 8/10 (the real captured result)");
console.log("history-strip children after submit:", historyStrip.children.length);
if (historyStrip.children.length !== 1) throw new Error("expected exactly one history chip after one submit");

console.log("\n--- clicking Get a hint ---");
btnHint.dispatchEvent("click");
console.log("hint-list children:", hintList.children.length);
if (hintList.children.length !== 1) throw new Error("expected exactly one hint rendered");
if (!hintList.children[0].innerHTML.includes("range")) throw new Error("hint text did not render correctly");
console.log("\u2713 hint rendered:", hintList.children[0].innerHTML.slice(0, 60) + "...");

console.log("\n--- editing the code to something arbitrary (not a known snapshot) then clicking Submit ---");
editor.value = "def dedupe_vectors(vectors):\n    return vectors\n";
editor.dispatchEvent("input");
btnSubmit.dispatchEvent("click");
console.log("results-status html:", resultsStatus.innerHTML);
if (!resultsStatus.innerHTML.toLowerCase().includes("mock mode shows real")) throw new Error("expected the honest mock-limitation message for an arbitrary edit, got: " + resultsStatus.innerHTML);
console.log("\u2713 correctly refuses to fabricate a result for an unrecognized edit in mock mode");

console.log("\n--- pasting in the exact fixed/reference code then Submit ---");
const fixedCode = "def dedupe_vectors(vectors):\n    seen = set()\n    result = []\n    for v in vectors:\n        key = tuple(v)\n        if key not in seen:\n            seen.add(key)\n            result.append(v)\n    return result\n";
editor.value = fixedCode;
editor.dispatchEvent("input");
btnSubmit.dispatchEvent("click");
console.log("results-status html:", resultsStatus.innerHTML);
if (!resultsStatus.innerHTML.includes("10/10")) throw new Error("expected 10/10 for the exact reference solution, got: " + resultsStatus.innerHTML);
console.log("\u2713 exact reference solution correctly shows 10/10 (the real captured result)");
console.log("history-strip children after second submit:", historyStrip.children.length);
if (historyStrip.children.length !== 2) throw new Error("expected two history chips after two submits");

console.log("\n--- switching language to Java ---");
languageSelect.value = "java";
languageSelect.dispatchEvent("change");
console.log("editor now contains Java:", editor.value.includes("class Solution"));
if (!editor.value.includes("class Solution")) throw new Error("language switch to Java did not load Java starter code");
console.log("badge-lang:", registry.get("badge-lang").textContent);

console.log("\n--- toggling live mode on (without a real server — checking it does not throw, connection error path) ---");
useLive.checked = true;
useLive.dispatchEvent("change");
console.log("conn-pill:", registry.get("conn-pill").textContent);
if (registry.get("conn-pill").textContent !== "Live API") throw new Error("conn-pill did not update on live toggle");

console.log("\n" + (errors.length ? "\u2717 console.error was called: " + errors.join(" | ") : "\u2713 no console.error calls during the whole run"));
console.log("\n=== ALL FRONTEND LOGIC CHECKS PASSED (against a real DOM-stub execution, not just static review) ===");
