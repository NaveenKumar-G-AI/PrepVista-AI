import { SupportedLanguage } from '../types';
import { LanguageAdapter } from './types';
import { pythonAdapter } from './python_adapter';
import { jsAdapter } from './js_adapter';

const registry: Record<SupportedLanguage, LanguageAdapter> = {
  python: pythonAdapter,
  javascript: jsAdapter,
  typescript: jsAdapter,
};

export function getAdapter(language: SupportedLanguage): LanguageAdapter {
  const adapter = registry[language];
  if (!adapter) throw new Error(`UnsupportedLanguage: ${language}`);
  return adapter;
}

export { LanguageAdapter } from './types';
