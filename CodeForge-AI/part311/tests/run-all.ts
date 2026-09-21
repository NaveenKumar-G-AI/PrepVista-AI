import "./executor.test.js";
import "./mistakeClassifier.test.js";
import "./difficultyPolicy.test.js";
import "./challengeSelector.test.js";
import "./generationPipeline.test.js";
import { runAll } from "./harness.js";

console.log("CodeForge engine test suite\n");
await runAll();
