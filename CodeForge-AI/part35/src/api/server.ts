import Fastify from "fastify";
import { createPgPool, PostgresInterviewRepository } from "../repository/interviewRepository.postgres.js";
import { InterviewOrchestrator } from "../orchestration/interviewOrchestrator.js";
import { registerTechnicalInterviewRoutes } from "./routes.js";
import {
  InMemoryRoleSkillModel,
  InMemoryCandidateEvidenceSource,
  RecordingSkillSignalEngine,
  SimulatedAIGateway,
  NoopVoice,
  ConsoleAuditLog,
} from "../integration/devAdapters.js";
import { GroqAIGatewayAdapter } from "../integration/aiGatewayAdapter.groq.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://app_conn_service:@localhost:5432/codeforge_dev";
const GROQ_API_KEY = process.env.GROQ_API_KEY; // intentionally left unset — see README

const pool = createPgPool(DATABASE_URL);
const repo = new PostgresInterviewRepository(pool);

const orchestrator = new InterviewOrchestrator({
  repo,
  // §9/§10/§46 — every port below is a DEV stand-in; see TRUTH_TABLE.md for
  // exactly what each one needs to become in the real CodeForge codebase.
  roleSkillModel: new InMemoryRoleSkillModel(),
  candidateEvidence: new InMemoryCandidateEvidenceSource(),
  skillSignalEngine: new RecordingSkillSignalEngine(),
  aiGateway: GROQ_API_KEY ? new GroqAIGatewayAdapter(GROQ_API_KEY) : new SimulatedAIGateway(),
  voice: new NoopVoice(),
  auditLog: new ConsoleAuditLog(),
});

const app = Fastify({ logger: true });
registerTechnicalInterviewRoutes(app, orchestrator);

app.get("/health", async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 8035);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
