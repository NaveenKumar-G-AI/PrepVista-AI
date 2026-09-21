import { spawn } from 'child_process';
import * as path from 'path';
import { ParsedModule, NormalizedNode } from './ir';
import { LanguageAdapter } from './types';

const SCRIPT_PATH = path.join(__dirname, 'python', 'extract_ast.py');

function runPython(source: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // spawn (not exec) with an argv array: the source is never interpolated into a shell
    // string, so it cannot be used for shell/argument injection. Source is passed via stdin.
    const child = spawn('python3', [SCRIPT_PATH], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(stderr || `python3 exited with code ${code}`));
      } else {
        resolve(stdout);
      }
    });
    child.stdin.write(source);
    child.stdin.end();
  });
}

export const pythonAdapter: LanguageAdapter = {
  language: 'python',
  async parse(source: string): Promise<ParsedModule> {
    const raw = await runPython(source);
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new Error(`ParserFailure: could not parse extractor output: ${String(err)}`);
    }
    if (data.error) {
      throw new Error(`MalformedSource: ${data.error} at line ${data.line}: ${data.message}`);
    }
    return {
      language: 'python',
      root: data.root as NormalizedNode,
      comments: (data.comments || []) as NormalizedNode[],
      sourceLines: data.sourceLines || [],
    };
  },
};
