import type { ExecutionResultRepository, AuthContext } from "../persistence/repository.js";
import { toExecutionResultDto, type ExecutionResultDto } from "../redaction/toDto.js";

export interface GetExecutionResultRequest {
  /** Client-supplied identifier — never trusted for authorization on its own. */
  submissionId: string;
  /** Whether the owning problem's configuration permits per-test visibility for this role. */
  perTestVisibilityAllowed: boolean;
}

export type GetExecutionResultResponse =
  | { status: 200; body: ExecutionResultDto }
  | { status: 404; body: { error: "NOT_FOUND" } }
  | { status: 403; body: { error: "FORBIDDEN" } };

/**
 * Handler contract: `ctx` (the authenticated caller's identity/role) must
 * come from the existing auth middleware/session — NEVER from request body
 * or query params. This is what makes changing `submissionId` in the
 * request harmless (IDOR protection): authorization is re-derived from
 * `ctx` on every call inside the repository, not trusted from the request.
 */
export async function getExecutionResultHandler(
  req: GetExecutionResultRequest,
  ctx: AuthContext,
  repo: ExecutionResultRepository,
): Promise<GetExecutionResultResponse> {
  try {
    const { result: finalized } = await repo.getResultForSubmission(req.submissionId, ctx);
    const dto = toExecutionResultDto(finalized, {
      role: ctx.role,
      perTestVisibilityAllowed: req.perTestVisibilityAllowed,
    });
    return { status: 200, body: dto };
  } catch (err) {
    const name = (err as Error).name;
    if (name === "ResultNotFoundError") return { status: 404, body: { error: "NOT_FOUND" } };
    if (name === "UnauthorizedResultAccessError") return { status: 403, body: { error: "FORBIDDEN" } };
    throw err;
  }
}
