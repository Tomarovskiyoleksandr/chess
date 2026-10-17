# MonsterChess

Static chess analysis with Stockfish and Maia Chess (official Maia-3 model).

Run `python -m http.server 8765` in this directory and open
http://localhost:8765. Serve over HTTP or HTTPS; workers cannot run reliably
from a `file://` URL. No backend or API key is required.

Maia loads on first opening its tab. The model download is about 46 MB;
ONNX Runtime adds about 12 MB. The browser caches the model when Cache Storage
is available. Internet access is required for the initial download and CDN
dependencies. Inference runs locally in a worker with single-threaded WASM,
so hosting does not need cross-origin isolation headers.

Select a rating from 600 to 2600 (applied to both players) and 1, 3 or 5 moves.
Maia ranks legal moves by predicted human choice probability, not objective
playing strength. Its evaluation is expected score (win probability plus half
draw probability), shown from the selected player's perspective. Click an
alternative to highlight it without playing it. Position and history are shared
between engine tabs. Stockfish retains its depth-based analysis. Both engines
automatically calculate a move whenever it is the selected player's turn.

Checks: `node i18n.test.cjs` and `node maia.test.cjs`.
See THIRD_PARTY.md for model and dependency sources.
