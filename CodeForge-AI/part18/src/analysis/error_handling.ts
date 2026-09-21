import { NormalizedNode, walk, findAll } from '../parsers/ir';

export interface SwallowedExceptionHit {
  loc: { startLine: number; endLine: number };
  exceptionType: string | null;
  isBare: boolean;
}

export interface ResourceLeakHit {
  loc: { startLine: number; endLine: number };
  resourceCall: string;
}

/** Purely structural, driven by facts the adapters already computed (isBare / isEmptyOrTrivial),
 * not semantic guessing — hence HIGH confidence at the rule layer. */
export function detectSwallowedExceptions(root: NormalizedNode): SwallowedExceptionHit[] {
  const hits: SwallowedExceptionHit[] = [];
  for (const c of findAll(root, 'Catch')) {
    const meta = (c.meta || {}) as any;
    if (meta.isEmptyOrTrivial || meta.isBare) {
      hits.push({ loc: c.loc, exceptionType: meta.exceptionType || null, isBare: !!meta.isBare });
    }
  }
  return hits;
}

const RESOURCE_ACQUISITION_CALLS = new Set(['open']);

/** Heuristic: a resource-acquiring call (currently: Python's open()) not nested anywhere
 * under a `with` block. Static analysis can't prove a runtime leak in every dynamic case,
 * so this is intentionally MEDIUM confidence at the rule layer, not a hard fact. */
export function detectResourceLeaks(root: NormalizedNode): ResourceLeakHit[] {
  const hits: ResourceLeakHit[] = [];
  walk(root, (node, parents) => {
    if (node.kind !== 'Call' || !node.name || !RESOURCE_ACQUISITION_CALLS.has(node.name)) return;
    const insideWith = parents.some((p) => p.kind === 'With');
    if (!insideWith) hits.push({ loc: node.loc, resourceCall: node.name });
  });
  return hits;
}
