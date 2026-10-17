// Maia-3 tensor/output contract: CSSLab/maia-platform-frontend.
// Inference uses the official model; no search or simulated rating adjustment.
(function (root) {
  const mirrorMove = move => move.replace(/[1-8]/g, rank => String(9 - Number(rank)));
  function tokens(fen) {
    const [placement, turn] = fen.split(' ');
    const result = new Float32Array(64 * 12);
    placement.split('/').forEach((row, rowIndex) => {
      let file = 0;
      for (let piece of row) {
        if (/\d/.test(piece)) { file += Number(piece); continue; }
        const rank = turn === 'b' ? rowIndex : 7 - rowIndex;
        if (turn === 'b') piece = piece === piece.toLowerCase() ? piece.toUpperCase() : piece.toLowerCase();
        result[(rank * 8 + file) * 12 + 'PNBRQKpnbrqk'.indexOf(piece)] = 1;
        file++;
      }
    });
    return result;
  }
  function decode(fen, legalMoves, dictionary, logits, value) {
    const moves = legalMoves.map(move => {
      const index = dictionary[fen.split(' ')[1] === 'b' ? mirrorMove(move) : move];
      if (index === undefined || !Number.isFinite(logits[index])) throw new Error('Invalid Maia move output');
      return { move, logit: logits[index] };
    });
    if (!moves.length) return { moves: [], value: null };
    const max = Math.max(...moves.map(move => move.logit));
    const sum = moves.reduce((sum, move) => sum + Math.exp(move.logit - max), 0);
    const probabilities = moves.map(({move, logit}) => ({move, probability: Math.exp(logit - max) / sum}));
    const valueMax = Math.max(...value);
    const wdl = Array.from(value, x => Math.exp(x - valueMax));
    const expectedScore = (wdl[2] + wdl[1] / 2) / wdl.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(expectedScore)) throw new Error('Invalid Maia value output');
    return { moves: probabilities.sort((a, b) => b.probability - a.probability), value: expectedScore };
  }
  root.MaiaCore = { tokens, decode, mirrorMove };
})(globalThis);
