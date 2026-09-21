// Runs with: npx tsx test/render-smoke.tsx
// Mounts each component into a real (jsdom) DOM and exercises basic
// interactions — this catches runtime errors (undefined access, bad hook
// usage, degenerate SVG math, etc.) that `tsc` and `vite build` cannot,
// since both of those only check that the code is well-typed and bundles,
// not that it actually runs without throwing.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
(globalThis as any).localStorage = dom.window.localStorage;
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0);
(globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");

const { Dial, DifficultyDial } = await import("../src/components/Dial");
const { AdaptationBanner } = await import("../src/components/AdaptationBanner");
const { ConfidenceSelector } = await import("../src/components/ConfidenceSelector");
const { SessionSummaryView } = await import("../src/components/SessionSummary");

let failures = 0;

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures++;
    console.error(`FAIL  ${name}`);
    console.error(err);
  }
}

await check("Dial renders with a mid-range value", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Dial value={74} label="Accuracy" sublabel="rolling" />));
  if (!container.querySelector("svg")) throw new Error("no svg rendered");
  if (!container.querySelector("text")) throw new Error("no numeric readout rendered");
  act(() => root.unmount());
});

await check("Dial handles boundary values 0 and 100 without NaN in the path", () => {
  for (const v of [0, 100, -5, 250]) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Dial value={v} label="x" />));
    const path = container.querySelector("path");
    if (path?.getAttribute("d")?.includes("NaN")) throw new Error(`NaN in path for value=${v}`);
    act(() => root.unmount());
  }
});

await check("DifficultyDial renders at every ladder position 0-7", () => {
  for (let level = 0; level <= 7; level++) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<DifficultyDial level={level} />));
    if (!container.querySelector("svg")) throw new Error(`no svg at level ${level}`);
    act(() => root.unmount());
  }
});

await check("AdaptationBanner renders a calc-error style adaptation event", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <AdaptationBanner
        event={{
          atQuestionIndex: 3,
          trigger: "test",
          previousDifficulty: 5,
          newDifficulty: 4,
          focusDimension: "CALCULATION",
          message: "Concept understanding appears strong, but a calculation slip affected the result.",
        }}
      />
    )
  );
  if (!container.textContent?.includes("Recalibrated")) throw new Error("missing 'Recalibrated' label");
  if (!container.textContent?.includes("calculation slip")) throw new Error("message text not rendered");
  act(() => root.unmount());
});

await check("ConfidenceSelector renders 5 options and reports clicks", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let picked: number | null = null;
  act(() => root.render(<ConfidenceSelector value={null} onChange={(v) => (picked = v)} />));
  const buttons = container.querySelectorAll("button");
  if (buttons.length !== 5) throw new Error(`expected 5 confidence buttons, got ${buttons.length}`);
  act(() => (buttons[3] as HTMLButtonElement).click());
  if (picked !== 4) throw new Error(`expected picked=4, got ${picked}`);
  act(() => root.unmount());
});

await check("SessionSummaryView renders every section without a real backend", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <SessionSummaryView
        summary={{
          sessionId: "s1",
          whatImproved: ["Basic Percentage Calculation"],
          whatRemainsWeak: ["Percentage Application"],
          mainErrorPattern: "CALCULATION_ERROR",
          speedStatus: "Fast",
          accuracyStatus: "Developing",
          masteryStatus: "APPROACHING_MASTERY",
          nextBestAction: "A short calculation-accuracy drill before moving on.",
          totalQuestions: 8,
          correctCount: 5,
          adaptationCount: 2,
        }}
        onDone={() => {}}
      />
    )
  );
  if (!container.textContent?.includes("5/8 correct")) throw new Error("score header missing");
  if (!container.textContent?.includes("What improved")) throw new Error("improved section missing");
  if (!container.textContent?.includes("recalibrated 2 times")) throw new Error("adaptation count sentence missing");
  act(() => root.unmount());
});

console.log(failures === 0 ? "\nALL RENDER CHECKS PASSED" : `\n${failures} RENDER CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
