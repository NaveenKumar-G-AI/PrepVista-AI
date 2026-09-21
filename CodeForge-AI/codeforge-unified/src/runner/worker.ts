import { evaluate, type RunRequest } from './sandbox';
globalThis.onmessage = async (event: MessageEvent<RunRequest>) => {
  try { globalThis.postMessage({ results: await evaluate(event.data) }); }
  catch { globalThis.postMessage({ error: 'The isolated runner could not complete these checks. Please retry.' }); }
};
