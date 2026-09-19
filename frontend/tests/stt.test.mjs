import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(options = {}) {
  const recorders = [], sockets = [];
  let stopped = 0;
  class Recorder {
    static isTypeSupported() { return true; }
    state = 'inactive'; mimeType = 'audio/webm';
    constructor() { recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(['audio']) }); this.onstop?.();
    }); }
  }
  class Socket {
    static OPEN = 1;
    readyState = 1; frames = [];
    constructor() { sockets.push(this); queueMicrotask(() => this.onopen?.()); }
    send(data) { this.frames.push(data); }
    close() { this.readyState = 3; this.onclose?.(); }
    final(id, text) { this.onmessage?.({ data: JSON.stringify({ type: 'final', turn_id: id, final_transcript: text }) }); }
  }
  const stream = { getTracks: () => [{ stop: () => stopped++ }] };
  const { ServerSttSession } = loadTs('../src/lib/serverStt.ts', {
    window: { WebSocket: Socket, setTimeout, clearTimeout }, WebSocket: Socket, MediaRecorder: Recorder,
    navigator: { mediaDevices: { getUserMedia: options.getUserMedia || (async () => stream) } },
    fetch: async () => { throw new Error('offline'); },
  });
  const session = new ServerSttSession({ sessionId: 'session', token: 'jwt', backendUrl: 'https://api.example.invalid', turnNumber: 1, windowMs: 100000, onTranscript() {} });
  return { session, recorders, sockets, stream, stopped: () => stopped };
}
test('recording continues while an earlier clip is being transcribed', async () => {
  const h = setup(); await h.session.start();
  h.recorders[0].stop(); await tick();
  assert.equal(h.recorders.length, 2);
  assert.equal(h.recorders[1].state, 'recording');
  h.sockets[0].final('1-0', 'first');
  const stopped = h.session.stop(); await tick();
  h.sockets[0].final('1-1', 'last');
  assert.equal(await stopped, 'first last');
});
test('stop waits for the final result rather than returning a partial answer', async () => {
  const h = setup(); await h.session.start();
  let settled = false;
  const stopped = h.session.stop().then(text => { settled = true; return text; });
  await tick();
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(settled, false);
  h.sockets[0].final('1-0', 'complete answer');
  assert.equal(await stopped, 'complete answer');
  assert.equal(h.stopped(), 1);
});
test('a stale transcription result cannot satisfy the current clip', async () => {
  const h = setup(); await h.session.start();
  const stopped = h.session.stop(); await tick();
  h.sockets[0].final('0-9', 'wrong answer');
  h.sockets[0].final('1-0', 'right answer');
  assert.equal(await stopped, 'right answer');
});
test('cancelled microphone permission cannot restart capture later', async () => {
  let grant;
  const h = setup({ getUserMedia: () => new Promise(resolve => { grant = resolve; }) });
  const start = h.session.start();
  await h.session.stop(); grant(h.stream); await start;
  assert.equal(h.recorders.length, 0);
  assert.equal(h.stopped(), 1);
});

test('answer capture preserves ordinary words, technical names, and decimals', () => {
  const { normalizeCapturedAnswer } = loadTs('../src/lib/interview-transcript.ts');
  const answer = 'I like group work. Node.js used 3.14 seconds. I mean exactly that.';
  assert.equal(normalizeCapturedAnswer(answer), answer);
  assert.equal(normalizeCapturedAnswer(' one\n two '), 'one two');
});
