import { SupportedLanguage } from '../types';
import { ParsedModule } from './ir';

export interface LanguageAdapter {
  language: SupportedLanguage | SupportedLanguage[];
  parse(source: string): Promise<ParsedModule>;
}
