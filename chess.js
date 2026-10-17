(async () => {
  const { t, text, literal } = window.i18n;
  // ==========================================
  // CHESS.JS
  // ==========================================

  const { Chess } = await import(
    "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm"
  );

  const chess = new Chess();

  // ==========================================
  // ELEMENTS
  // ==========================================

  const boardEl = document.getElementById("board");
  const resetBtn = document.getElementById("resetBtn");
  const undoBtn = document.getElementById("undoBtn");
  const flipBtn = document.getElementById("flipBtn");

  const evaluationEl = document.getElementById("evaluation");
  const bestMoveEl = document.getElementById("bestMove");
  const engineStatus = document.getElementById("engineStatus");
  const statusDot = document.getElementById("statusDot");

  const depthSlider = document.getElementById("depth");
  const depthValue = document.getElementById("depthValue");
  const depthText = document.getElementById("depthText");

  const turnText = document.getElementById("turnText");
  const playerInfo = document.getElementById("playerInfo");
  const moveOwnerText = document.getElementById("moveOwnerText");

  const fenInput = document.getElementById("fenInput");
  const loadFenBtn = document.getElementById("loadFenBtn");
  const movesEl = document.getElementById("moves");

  const playWhiteBtn = document.getElementById("playWhiteBtn");
  const playBlackBtn = document.getElementById("playBlackBtn");
  const stockfishTab = document.getElementById('stockfishTab');
  const maiaTab = document.getElementById('maiaTab');
  const maiaLevel = document.getElementById('maiaLevel');
  const maiaCount = document.getElementById('maiaCount');
  const variantList = document.getElementById('variantList');
  let activeEngine = 'stockfish';
  let maiaWorker = null;
  let maiaState = 'idle';
  let maiaProgress = null;
  let maiaRequest = 0;
  let maiaResults = [];
  let stockfishState = 'loading';
  let stockfishStopping = false;

  function refreshEngineStatus() {
    const isMaia = activeEngine === 'maia';
    text(engineStatus, isMaia ? ({idle:'maiaLoading', loading:'maiaLoading', ready:'maiaReady', error:'maiaError'}[maiaState]) : stockfishState);
    if (isMaia && maiaState === 'loading' && maiaProgress !== null) text(engineStatus, 'maiaProgress', {value: maiaProgress});
    statusDot.classList.toggle('ready', isMaia ? maiaState === 'ready' : engineReady);
  }

  function createMaia() {
    maiaState = 'loading';
    maiaProgress = null;
    refreshEngineStatus();
    try {
      maiaWorker = new Worker('./maia-worker.js');
      maiaWorker.onmessage = ({data}) => {
        if (data.type === 'progress') {
          maiaProgress = data.progress;
        } else if (data.type === 'ready') {
          maiaState = 'ready';
          requestAutomaticAnalysis();
        } else if (data.type === 'error') {
          if (data.id !== undefined && data.id !== maiaRequest) return;
          console.error('Maia:', data.message);
          maiaState = 'error';
          maiaWorker.terminate();
          maiaWorker = null;
          if (activeEngine === 'maia') { analyzing = false; literal(bestMoveEl, '—'); literal(evaluationEl, '—'); }
        } else if (data.type === 'result') {
          if (activeEngine !== 'maia' || data.id !== maiaRequest) return;
          analyzing = false;
          maiaResults = data.moves;
          literal(evaluationEl, ((isPlayersTurn() ? data.value : 1 - data.value) * 100).toFixed(1) + '%');
          text(depthText, 'maiaDepth', {value: maiaLevel.value});
          renderVariants();
          if (maiaResults.length) selectMaiaMove(maiaResults[0].move);
          else text(bestMoveEl, 'noMoves');
        }
        refreshEngineStatus();
      };
      maiaWorker.onerror = () => {
        maiaState = 'error';
        maiaWorker.terminate();
        maiaWorker = null;
        if (activeEngine === 'maia') { analyzing = false; literal(bestMoveEl, '—'); literal(evaluationEl, '—'); }
        refreshEngineStatus();
      };
      maiaWorker.postMessage({type: 'init'});
    } catch (error) {
      maiaState = 'error';
      refreshEngineStatus();
    }
  }

  function selectMaiaMove(move) {
    bestFrom = move.slice(0, 2);
    bestTo = move.slice(2, 4);
    displayMove(move);
    renderVariants(move);
    renderBoard();
  }

  function renderVariants(selected = maiaResults[0]?.move) {
    variantList.innerHTML = '';
    for (const {move, probability} of maiaResults.slice(0, Number(maiaCount.value))) {
      const button = document.createElement('button');
      button.className = 'variant-row' + (move === selected ? ' active' : '');
      button.setAttribute('aria-pressed', String(move === selected));
      const notation = document.createElement('span');
      const preview = new Chess(chess.fen());
      notation.textContent = preview.move({from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4]}).san;
      const chance = document.createElement('strong');
      chance.textContent = (probability * 100).toFixed(1) + '%';
      button.appendChild(notation);
      button.appendChild(chance);
      button.addEventListener('click', () => selectMaiaMove(move));
      variantList.appendChild(button);
    }
  }

  function switchEngine(next) {
    if (activeEngine === next) return;
    stopEngine();
    activeEngine = next;
    const isMaia = next === 'maia';
    stockfishTab.classList.toggle('active', !isMaia);
    maiaTab.classList.toggle('active', isMaia);
    stockfishTab.setAttribute('aria-pressed', String(!isMaia));
    maiaTab.setAttribute('aria-pressed', String(isMaia));
    document.getElementById('stockfishSettings').hidden = isMaia;
    document.getElementById('maiaSettings').hidden = !isMaia;
    document.getElementById('maiaVariants').hidden = !isMaia;
    text(document.getElementById('bestLabel'), isMaia ? 'maiaBest' : 'best');
    text(document.getElementById('scoreLabel'), isMaia ? 'maiaScore' : 'score');
    clearAnalysis();
    renderBoard();
    if (isMaia && (maiaState === 'idle' || maiaState === 'error')) createMaia();
    else requestAutomaticAnalysis();
    refreshEngineStatus();
  }
  stockfishTab.addEventListener('click', () => switchEngine('stockfish'));
  maiaTab.addEventListener('click', () => switchEngine('maia'));
  maiaLevel.addEventListener('input', () => {
    document.getElementById('maiaLevelValue').textContent = maiaLevel.value;
    clearAnalysis();
    renderBoard();
    requestAutomaticAnalysis();
  });
  maiaCount.addEventListener('change', () => renderVariants());

  // ==========================================
  // BOARD STATE
  // ==========================================

  let selectedSquare = null;
  let possibleSquares = [];
  let flipped = false;
  let bestFrom = null;
  let bestTo = null;

  // твоя сторона
  let playerColor = "w";

  // ==========================================
  // ONLINE PIECES
  // ==========================================

  const pieceImages = {
    wp: "https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg",
    wn: "https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg",
    wb: "https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg",
    wr: "https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg",
    wq: "https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg",
    wk: "https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg",

    bp: "https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg",
    bn: "https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg",
    bb: "https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg",
    br: "https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg",
    bq: "https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg",
    bk: "https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg"
  };

  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

  // ==========================================
  // HELPERS
  // ==========================================

  function setPlayerColor(color) {
    playerColor = color;
    flipped = color === "b";

    playWhiteBtn.classList.toggle("active", color === "w");
    playBlackBtn.classList.toggle("active", color === "b");

    clearAnalysis();
    renderBoard();
    requestAutomaticAnalysis();
  }

  function isPlayersTurn() {
    return chess.turn() === playerColor;
  }

  function squareCoordColorClass(isLightSquare) {
    return isLightSquare ? "on-light" : "on-dark";
  }

  // ==========================================
  // RENDER BOARD
  // ==========================================

  function renderBoard() {
    boardEl.innerHTML = "";

    const board = chess.board();

    const rankIndexes = flipped
      ? [7, 6, 5, 4, 3, 2, 1, 0]
      : [0, 1, 2, 3, 4, 5, 6, 7];

    const fileIndexes = flipped
      ? [7, 6, 5, 4, 3, 2, 1, 0]
      : [0, 1, 2, 3, 4, 5, 6, 7];

    rankIndexes.forEach((rowIndex) => {
      fileIndexes.forEach((colIndex) => {
        const piece = board[rowIndex][colIndex];
        const file = files[colIndex];
        const rank = 8 - rowIndex;
        const squareName = file + rank;

        const square = document.createElement("div");
        square.classList.add("square");

        const isLight = (rowIndex + colIndex) % 2 === 0;

        square.classList.add(isLight ? "light" : "dark");

        if (squareName === selectedSquare) {
          square.classList.add("selected");
        }

        if (squareName === bestFrom) {
          square.classList.add("best-from");
        }

        if (squareName === bestTo) {
          square.classList.add("best-to");
        }

        const possible = possibleSquares.find(
          (move) => move.to === squareName
        );

        if (possible) {
          square.classList.add(piece ? "capture" : "possible");
        }

        if (piece) {
          const img = document.createElement("img");
          img.className = "piece-img";
          img.src = pieceImages[piece.color + piece.type];
          img.alt = piece.color + piece.type;
          square.appendChild(img);
        }

        const coordColorClass = squareCoordColorClass(isLight);

        if ((!flipped && rowIndex === 7) || (flipped && rowIndex === 0)) {
          const fileEl = document.createElement("span");
          fileEl.className = `coord file ${coordColorClass}`;
          fileEl.textContent = file;
          square.appendChild(fileEl);
        }

        if ((!flipped && colIndex === 0) || (flipped && colIndex === 7)) {
          const rankEl = document.createElement("span");
          rankEl.className = `coord rank ${coordColorClass}`;
          rankEl.textContent = rank;
          square.appendChild(rankEl);
        }

        square.addEventListener("click", () => handleSquareClick(squareName));
        boardEl.appendChild(square);
      });
    });

    updateInfo();
  }

  // ==========================================
  // BOARD CLICK
  // ==========================================

  function handleSquareClick(square) {
    bestFrom = null;
    bestTo = null;

    if (!selectedSquare) {
      const piece = chess.get(square);

      if (!piece) return;
      if (piece.color !== chess.turn()) return;

      selectedSquare = square;

      possibleSquares = chess.moves({
        square,
        verbose: true
      });

      renderBoard();
      return;
    }

    if (selectedSquare === square) {
      selectedSquare = null;
      possibleSquares = [];
      renderBoard();
      return;
    }

    const clickedPiece = chess.get(square);

    if (clickedPiece && clickedPiece.color === chess.turn()) {
      selectedSquare = square;

      possibleSquares = chess.moves({
        square,
        verbose: true
      });

      renderBoard();
      return;
    }

    try {
      const move = chess.move({
        from: selectedSquare,
        to: square,
        promotion: "q"
      });

      if (move) {
        selectedSquare = null;
        possibleSquares = [];
        clearAnalysis();
        renderBoard();
        requestAutomaticAnalysis();
      }
    } catch (error) {
      selectedSquare = null;
      possibleSquares = [];
      renderBoard();
    }
  }

  // ==========================================
  // INFO
  // ==========================================

  function updateInfo() {
    fenInput.value = chess.fen();

    text(turnText, chess.turn() === "w" ? "turnWhite" : "turnBlack");
    text(playerInfo, playerColor === "w" ? "playerWhite" : "playerBlack");
    text(moveOwnerText, isPlayersTurn() ? "yourTurn" : "opponentTurn");

    const history = chess.history();

    if (history.length === 0) {
      text(movesEl, "empty");
      return;
    }

    let historyText = "";

    history.forEach((move, index) => {
      if (index % 2 === 0) {
        historyText += `${Math.floor(index / 2) + 1}. `;
      }
      historyText += move + " ";
    });

    literal(movesEl, historyText);
  }

  // ==========================================
  // CLEAR ANALYSIS
  // ==========================================

  function clearAnalysis() {
    stopEngine();
    maiaResults = [];
    variantList.innerHTML = '';
    bestFrom = null;
    bestTo = null;
    evaluationEl.textContent = "—";
    literal(bestMoveEl, "—");
    text(depthText, activeEngine === 'maia' ? 'maiaDepth' : 'depthValue', { value: activeEngine === 'maia' ? maiaLevel.value : '—' });
  }

  // ==========================================
  // HUMAN MOVE NAME
  // ==========================================

  function displayMove(move) {
    const from = move.substring(0, 2);
    const to = move.substring(2, 4);
    const piece = chess.get(from);
    if (piece) text(bestMoveEl, "move", { piece: { key: piece.type }, from, to, promotion: move[4] ? ' = ' + move[4].toUpperCase() : '' });
    else literal(bestMoveEl, `${from} → ${to}`);
  }

  // ==========================================
  // BUTTONS
  // ==========================================

  playWhiteBtn.addEventListener("click", () => {
    setPlayerColor("w");
  });

  playBlackBtn.addEventListener("click", () => {
    setPlayerColor("b");
  });

  resetBtn.addEventListener("click", () => {
    stopEngine();
    chess.reset();
    selectedSquare = null;
    possibleSquares = [];
    clearAnalysis();
    renderBoard();
    requestAutomaticAnalysis();
  });

  undoBtn.addEventListener("click", () => {
    stopEngine();
    chess.undo();
    selectedSquare = null;
    possibleSquares = [];
    clearAnalysis();
    renderBoard();
    requestAutomaticAnalysis();
  });

  flipBtn.addEventListener("click", () => {
    flipped = !flipped;
    renderBoard();
  });

  depthSlider.addEventListener("input", () => {
    depthValue.textContent = depthSlider.value;
    clearAnalysis();
    requestAutomaticAnalysis();
  });

  // ==========================================
  // FEN
  // ==========================================

  loadFenBtn.addEventListener("click", () => {
    const fen = fenInput.value.trim();

    if (!fen) return;

    try {
      chess.load(fen);
      selectedSquare = null;
      possibleSquares = [];
      clearAnalysis();
      renderBoard();
      requestAutomaticAnalysis();
    } catch (error) {
      alert(t("invalidFen"));
    }
  });

  // ==========================================
  // STOCKFISH
  // ==========================================

  let engine = null;
  let engineReady = false;
  let analyzing = false;

  const STOCKFISH_URL =
    "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.min.js";

  async function createEngine() {
    try {
      stockfishState = 'loading';
      refreshEngineStatus();

      const response = await fetch(STOCKFISH_URL);

      if (!response.ok) {
        throw new Error("HTTP error " + response.status);
      }

      const source = await response.text();

      const blob = new Blob([source], {
        type: "application/javascript"
      });

      const blobURL = URL.createObjectURL(blob);

      engine = new Worker(blobURL);

      engine.onmessage = handleEngineMessage;

      engine.onerror = (event) => {
        console.error("Stockfish error:", event);
        engineReady = false;
        stockfishState = 'engineError';
        if (activeEngine === 'stockfish') analyzing = false;
        refreshEngineStatus();
      };

      engine.postMessage("uci");
    } catch (error) {
      console.error("Stockfish load error:", error);
      stockfishState = 'engineFailed';
      refreshEngineStatus();
    }
  }

  // ==========================================
  // STOCKFISH MESSAGE
  // ==========================================

  function handleEngineMessage(event) {
    const message =
      typeof event.data === "string"
        ? event.data
        : event.data.data;

    console.log("Stockfish:", message);

    if (message.includes("uciok")) {
      engine.postMessage("isready");
    }

    if (message.includes("readyok")) {
      engineReady = true;
      stockfishState = 'ready';
      refreshEngineStatus();
      requestAutomaticAnalysis();
    }

    if (message.startsWith('bestmove') && stockfishStopping) {
      stockfishStopping = false;
      refreshEngineStatus();
      requestAutomaticAnalysis();
      return;
    }
    if (activeEngine !== 'stockfish' || !analyzing || stockfishStopping) return;
    if (message.startsWith("info ")) {
      parseAnalysis(message);
    }

    if (message.startsWith("bestmove")) {
      parseBestMove(message);
    }
  }

  // ==========================================
  // ANALYSIS SCORE FOR PLAYER
  // ==========================================

  function convertScoreToPlayerPerspective(rawValue) {
    // rawValue from Stockfish = score for side to move
    // if side to move == playerColor -> keep sign
    // else invert sign

    return chess.turn() === playerColor ? rawValue : -rawValue;
  }

  function parseAnalysis(message) {
    const depthMatch = message.match(/\bdepth (\d+)/);

    if (depthMatch) {
      text(depthText, "depthValue", { value: depthMatch[1] });
    }

    const mateMatch = message.match(/\bscore mate (-?\d+)/);

    if (mateMatch) {
      let mate = Number(mateMatch[1]);
      mate = convertScoreToPlayerPerspective(mate);

      if (mate > 0) {
        evaluationEl.textContent = "M" + mate;
      } else {
        evaluationEl.textContent = "-M" + Math.abs(mate);
      }

      return;
    }

    const cpMatch = message.match(/\bscore cp (-?\d+)/);

    if (!cpMatch) return;

    let cp = Number(cpMatch[1]);
    cp = convertScoreToPlayerPerspective(cp);

    const score = cp / 100;

    evaluationEl.textContent =
      score > 0
        ? "+" + score.toFixed(2)
        : score.toFixed(2);
  }

  // ==========================================
  // BEST MOVE
  // ==========================================

  function parseBestMove(message) {
    analyzing = false;

    const match = message.match(
      /bestmove\s([a-h][1-8][a-h][1-8][qrbn]?)/
    );

    if (!match) {
      text(bestMoveEl, "noMoves");
      return;
    }

    const move = match[1];

    bestFrom = move.substring(0, 2);
    bestTo = move.substring(2, 4);

    displayMove(move);

    renderBoard();
  }

  // ==========================================
  // AUTOMATIC ANALYSIS FOR THE SELECTED SIDE
  // ==========================================

  function requestAutomaticAnalysis() {
    if (!isPlayersTurn() || analyzing || chess.isGameOver()) {
      if (chess.isGameOver()) text(bestMoveEl, "gameOver");
      return;
    }
    if (activeEngine === 'maia') {
      if (maiaState === 'idle') { createMaia(); return; }
      if (maiaState !== 'ready') return;
      analyzing = true;
      text(bestMoveEl, 'analyzing');
      literal(evaluationEl, '…');
      refreshEngineStatus();
      maiaWorker.postMessage({type: 'analyze', id: ++maiaRequest, fen: chess.fen(), elo: Number(maiaLevel.value), legalMoves: chess.moves({verbose:true}).map(move => move.from + move.to + (move.promotion || ''))});
      return;
    }
    if (stockfishStopping || !engineReady) return;

    bestFrom = null;
    bestTo = null;

    evaluationEl.textContent = "…";
    text(bestMoveEl, "analyzing");
    analyzing = true;

    const depth = Number(depthSlider.value);

    engine.postMessage("stop");
    engine.postMessage("position fen " + chess.fen());
    engine.postMessage("go depth " + depth);
  }

  // ==========================================
  // STOP ENGINE
  // ==========================================

  function stopEngine() {
    maiaRequest++;
    if (engine && analyzing && activeEngine === 'stockfish') {
      stockfishStopping = true;
      engine.postMessage('stop');
    }
    analyzing = false;
    refreshEngineStatus();
  }

  // ==========================================
  // START
  // ==========================================

  text(depthText, "depthValue", { value: "—" });
  renderBoard();
  createEngine();
})();
