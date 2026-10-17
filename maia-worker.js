importScripts('./maia-core.js');
const REVISION = 'a6e52f5c811ee18863cb2f0e81f2433a5b9905de';
const MODEL = `https://raw.githubusercontent.com/CSSLab/maia-platform-frontend/${REVISION}/public/maia3/maia3_simplified.onnx`;
const RUNTIME = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
let session;
let dictionary;
let loading;
async function initialize() {
  importScripts(RUNTIME + 'ort.wasm.min.js');
  ort.env.wasm.wasmPaths = RUNTIME;
  ort.env.wasm.numThreads = 1;
  const mapping = await fetch('./maia-moves.json');
  if (!mapping.ok) throw new Error('Move dictionary unavailable');
  dictionary = await mapping.json();
  let cache;
  try { cache = await caches.open('monsterchess-maia-v1'); } catch { /* Caching is optional. */ }
  let response = cache && await cache.match(MODEL);
  if (!response) {
    response = await fetch(MODEL, { signal: AbortSignal.timeout(600000) });
    if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
  }
  const reader = response.body.getReader();
  const chunks = [];
  const total = Number(response.headers.get('Content-Length')) || 45683686;
  let received = 0;
  let lastProgress = -1;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const progress = Math.min(100, Math.floor(received / total * 100));
    if (progress !== lastProgress) { postMessage({type:'progress', progress}); lastProgress = progress; }
  }
  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  if (cache) { try { await cache.put(MODEL, new Response(buffer)); } catch {} }
  session = await ort.InferenceSession.create(buffer, { executionProviders: ['wasm'] });
}
self.onmessage = async ({data}) => {
  try {
    if (!loading) loading = initialize().catch(error => { loading = null; throw error; });
    await loading;
    if (data.type === 'init') { postMessage({type: 'ready'}); return; }
    const result = await session.run({
      tokens: new ort.Tensor('float32', MaiaCore.tokens(data.fen), [1, 64, 12]),
      elo_self: new ort.Tensor('float32', Float32Array.of(data.elo), [1]),
      elo_oppo: new ort.Tensor('float32', Float32Array.of(data.elo), [1])
    });
    const output = MaiaCore.decode(data.fen, data.legalMoves, dictionary, result.logits_move.data, result.logits_value.data);
    Object.values(result).forEach(tensor => tensor.dispose());
    postMessage({type: 'result', id: data.id, ...output});
  } catch (error) {
    postMessage({type: 'error', id: data.id, message: error.message});
  }
};
