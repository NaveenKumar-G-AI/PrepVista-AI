import { Response } from "express";
import {
  ConcurrentModificationError,
  ForbiddenError,
  SessionEngine,
  SessionNotActiveError,
  SessionNotFoundError,
} from "../domain/sessionEngine";
import { SocraticSession, SocraticTurn } from "../domain/types";
import { AuthedRequest } from "./middleware";

/**
 * Never send the trusted answer / solution steps to the client while a
 * session is still active - that would hand the student the answer through
 * the API even though the tutor is withholding it in conversation. Once a
 * session is completed, escalated, or abandoned it's safe (and useful) to
 * reveal the worked solution.
 */
function toPublicSession(session: SocraticSession) {
  const revealSolution = session.status !== "active";
  return {
    id: session.id,
    objective: session.objective,
    state: session.state,
    status: session.status,
    thinkingState: session.thinkingState,
    problem: {
      skill: session.problemContext.skill,
      prompt: session.problemContext.prompt,
      ...(revealSolution
        ? { trustedAnswer: session.problemContext.trustedAnswer, trustedSolutionSteps: session.problemContext.trustedSolutionSteps }
        : {}),
    },
    completionSummary: session.completionSummary ?? null,
    updatedAt: session.updatedAt,
    createdAt: session.createdAt,
  };
}

function toPublicTurn(turn: SocraticTurn) {
  return turn;
}

function handleError(res: Response, err: unknown): void {
  if (err instanceof SessionNotFoundError) {
    res.status(404).json({ error: "session_not_found" });
  } else if (err instanceof ForbiddenError) {
    res.status(403).json({ error: "forbidden" });
  } else if (err instanceof ConcurrentModificationError) {
    res.status(409).json({ error: "concurrent_modification_retry" });
  } else if (err instanceof SessionNotActiveError) {
    res.status(400).json({ error: "session_not_active" });
  } else {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
}

export function createSocraticController(engine: SessionEngine) {
  return {
    async startSession(req: AuthedRequest, res: Response) {
      try {
        const { session, tutorTurn } = await engine.startSession(req.studentId);
        res.status(201).json({ session: toPublicSession(session), tutorTurn: toPublicTurn(tutorTurn) });
      } catch (err) {
        handleError(res, err);
      }
    },

    async getSession(req: AuthedRequest, res: Response) {
      try {
        const { session, turns } = await engine.getSession(String(req.params.id), req.studentId);
        res.json({ session: toPublicSession(session), turns: turns.map(toPublicTurn) });
      } catch (err) {
        handleError(res, err);
      }
    },

    async respond(req: AuthedRequest, res: Response) {
      const text = typeof req.body?.text === "string" ? req.body.text : "";
      try {
        const { session, tutorTurn } = await engine.respond(String(req.params.id), req.studentId, text);
        res.json({ session: toPublicSession(session), tutorTurn: toPublicTurn(tutorTurn) });
      } catch (err) {
        handleError(res, err);
      }
    },

    async requestHint(req: AuthedRequest, res: Response) {
      try {
        const { session, tutorTurn } = await engine.requestHint(String(req.params.id), req.studentId);
        res.json({ session: toPublicSession(session), tutorTurn: toPublicTurn(tutorTurn) });
      } catch (err) {
        handleError(res, err);
      }
    },

    async requestExplanation(req: AuthedRequest, res: Response) {
      try {
        const { session, tutorTurn } = await engine.requestExplanation(String(req.params.id), req.studentId);
        res.json({ session: toPublicSession(session), tutorTurn: toPublicTurn(tutorTurn) });
      } catch (err) {
        handleError(res, err);
      }
    },

    async requestSimplify(req: AuthedRequest, res: Response) {
      try {
        const { session, tutorTurn } = await engine.requestSimplify(String(req.params.id), req.studentId);
        res.json({ session: toPublicSession(session), tutorTurn: toPublicTurn(tutorTurn) });
      } catch (err) {
        handleError(res, err);
      }
    },

    async requestIndependent(req: AuthedRequest, res: Response) {
      try {
        const { session, tutorTurn } = await engine.requestIndependent(String(req.params.id), req.studentId);
        res.json({ session: toPublicSession(session), tutorTurn: toPublicTurn(tutorTurn) });
      } catch (err) {
        handleError(res, err);
      }
    },

    async requestNewQuestion(req: AuthedRequest, res: Response) {
      try {
        const { session, tutorTurn } = await engine.requestNewQuestion(req.studentId);
        res.status(201).json({ session: toPublicSession(session), tutorTurn: toPublicTurn(tutorTurn) });
      } catch (err) {
        handleError(res, err);
      }
    },

    async complete(req: AuthedRequest, res: Response) {
      try {
        const session = await engine.complete(String(req.params.id), req.studentId);
        res.json({ session: toPublicSession(session) });
      } catch (err) {
        handleError(res, err);
      }
    },
  };
}
