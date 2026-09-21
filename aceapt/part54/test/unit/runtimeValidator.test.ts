import { describe, it, expect } from "vitest";
import { RuntimeValidator } from "../../src/validators/RuntimeValidator.js";
import { baselineSnapshot, makeInput } from "../fixtures/baseline.js";

describe("RuntimeValidator", () => {
  const validator = new RuntimeValidator();

  it("PASSes clean render blocks", async () => {
    const result = await validator.validate(makeInput(baselineSnapshot()));
    expect(result.status).toBe("PASS");
  });

  it("FAILs on unbalanced LaTeX delimiters", async () => {
    const snapshot = baselineSnapshot({ renderBlocks: [{ kind: "LATEX", content: "$x^2 + y^2 = z^2" }] });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("LATEX_RENDER_FAILURE");
  });

  it("FAILs LATEX_UNSAFE_COMMAND on shell-escape-shaped commands", async () => {
    const snapshot = baselineSnapshot({ renderBlocks: [{ kind: "LATEX", content: "$x$ \\write18{rm -rf /}" }] });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("LATEX_UNSAFE_COMMAND");
    expect(result.severity).toBe("CRITICAL");
  });

  it("FAILs UNSAFE_MARKUP on an embedded script tag", async () => {
    const snapshot = baselineSnapshot({ renderBlocks: [{ kind: "HTML", content: "<p>Hi</p><script>alert(1)</script>" }] });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("UNSAFE_MARKUP");
    expect(result.severity).toBe("CRITICAL");
  });

  it("FAILs UNSAFE_MARKUP on an onerror handler smuggled into an img tag", async () => {
    const snapshot = baselineSnapshot({ renderBlocks: [{ kind: "HTML", content: '<img src="x" onerror="alert(1)">' }] });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("UNSAFE_MARKUP");
  });

  it("PASSes benign HTML formatting", async () => {
    const snapshot = baselineSnapshot({ renderBlocks: [{ kind: "HTML", content: "<p>Consider <strong>x</strong> and <em>y</em>.</p>" }] });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("PASS");
  });

  it("FAILs on pathological LaTeX brace nesting", async () => {
    const deeplyNested = "\\frac{".repeat(40) + "1" + "}".repeat(40);
    const snapshot = baselineSnapshot({ renderBlocks: [{ kind: "LATEX", content: `$${deeplyNested}$` }] });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("LATEX_RENDER_FAILURE");
  });
});
