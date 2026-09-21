import * as crypto from 'crypto';

export function sourceHash(source: string, language: string): string {
  return crypto.createHash('sha256').update(language + '\u0000' + source).digest('hex');
}
