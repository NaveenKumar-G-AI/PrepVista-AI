import type { Request } from 'express';
import { DomainError } from '../domain/types';

/** Express route params are typed string|undefined under noUncheckedIndexedAccess; this
 *  asserts presence (routes only reach the handler once Express has matched the segment). */
export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw new DomainError(`Missing required URL parameter "${name}".`, 400, 'BAD_REQUEST');
  return value;
}
