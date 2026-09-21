import { JSDOM } from "jsdom";
import fs from "fs";

const html = fs.readFileSync("/home/claude/codeforge-eval-engine/frontend/index.html", "utf8");

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function freshDom() {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    resources: "usable",
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  dom.window.fetch = fetch;
  await wait(200);
  return dom;
}

async function testDefaultOrderingAndConnect() {
  const dom = await freshDom();
  const doc = dom.window.document;
  doc.getElementById("api-base").value = "http://127.0.0.1:8811";
  doc.getElementById("student-id").value = "stu_demo_1";
  doc.getElementById("connect-btn").dispatchEvent(new dom.window.Event("click"));
  await wait(1200);

  console.log("[connect] error:", JSON.stringify(doc.getElementById("connect-error").textContent.trim()));
  console.log("[connect] workspace active:", doc.getElementById("workspace").classList.contains("active"));
  console.log("[connect] default-loaded challenge (should be easiest = Sum Two Numbers):",
    doc.getElementById("challenge-title").textContent);
  const pickerOptions = [...doc.getElementById("challenge-picker").options].map(o => o.textContent);
  console.log("[connect] picker order:", pickerOptions);
  dom.window.close();
}

async function testBadApiBaseShowsError() {
  const dom = await freshDom();
  const doc = dom.window.document;
  doc.getElementById("api-base").value = "http://127.0.0.1:59999"; // nothing listening here
  doc.getElementById("student-id").value = "stu_demo_1";
  doc.getElementById("connect-btn").dispatchEvent(new dom.window.Event("click"));
  await wait(1500);
  const err = doc.getElementById("connect-error").textContent.trim();
  console.log("[bad-api-base] error shown:", JSON.stringify(err));
  console.log("[bad-api-base] workspace still hidden:", !doc.getElementById("workspace").classList.contains("active"));
  dom.window.close();
}

async function testFullRetryAndNextChallengeFlow() {
  const dom = await freshDom();
  const doc = dom.window.document;
  doc.getElementById("api-base").value = "http://127.0.0.1:8811";
  doc.getElementById("student-id").value = "stu_frontend_retry_" + Date.now();
  doc.getElementById("connect-btn").dispatchEvent(new dom.window.Event("click"));
  await wait(1200);

  const picker = doc.getElementById("challenge-picker");
  picker.value = "most-frequent-element";
  picker.dispatchEvent(new dom.window.Event("change"));
  await wait(600);

  const buggy = `import sys, json
d = json.loads(sys.stdin.read())
counts = {}
for item in d['items']:
    counts[item] = 1
best = min((k for k in counts), key=lambda k: (-counts[k], k))
print(json.dumps(best))
`;
  const fixed = `import sys, json
d = json.loads(sys.stdin.read())
counts = {}
for item in d['items']:
    counts[item] = counts.get(item, 0) + 1
best = min((k for k in counts), key=lambda k: (-counts[k], k))
print(json.dumps(best))
`;

  // Attempt 1: buggy.
  doc.getElementById("code-editor").value = buggy;
  doc.getElementById("submit-btn").dispatchEvent(new dom.window.Event("click"));
  let ledgerHtml = "";
  for (let i = 0; i < 40; i++) {
    await wait(250);
    ledgerHtml = doc.getElementById("ledger").innerHTML;
    if (ledgerHtml.includes("Feedback")) break;
  }
  console.log("[retry-flow] attempt1 result line present:", ledgerHtml.includes("result-line fail"));

  // Attempt 2: fixed, via the SAME editor+submit button (simulating a real retry).
  doc.getElementById("code-editor").value = fixed;
  doc.getElementById("submit-btn").dispatchEvent(new dom.window.Event("click"));
  for (let i = 0; i < 40; i++) {
    await wait(250);
    ledgerHtml = doc.getElementById("ledger").innerHTML;
    if (ledgerHtml.includes("Retry comparison")) break;
  }
  console.log("[retry-flow] attempt2 result line pass:", ledgerHtml.includes("result-line pass"));
  console.log("[retry-flow] retry comparison rendered:", ledgerHtml.includes("Retry comparison"));
  console.log("[retry-flow] IMPROVED tag rendered:", ledgerHtml.includes("IMPROVED"));

  const nextBtn = [...doc.querySelectorAll(".actions-row button")].find(b => b.textContent.startsWith("Next:"));
  console.log("[retry-flow] next-challenge button rendered:", !!nextBtn, nextBtn ? nextBtn.textContent : null);

  if (nextBtn) {
    nextBtn.dispatchEvent(new dom.window.Event("click"));
    await wait(600);
    console.log("[retry-flow] after clicking next-challenge, title is now:", doc.getElementById("challenge-title").textContent);
  }
  dom.window.close();
}

async function main() {
  console.log("=== Test 1: default ordering + connect ===");
  await testDefaultOrderingAndConnect();
  console.log("\n=== Test 2: bad API base -> error shown, workspace stays hidden ===");
  await testBadApiBaseShowsError();
  console.log("\n=== Test 3: full retry + next-challenge flow ===");
  await testFullRetryAndNextChallengeFlow();
}

main().then(() => process.exit(0)).catch((e) => { console.error("DRIVER ERROR:", e); process.exit(1); });
