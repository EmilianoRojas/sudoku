'use strict';
const $ = id => document.getElementById(id);
const board = $('board'), timerEl = $('timer'), statusEl = $('statusMsg'), errorsEl = $('errorCount');
const newGameBtn = $('newGameBtn'), undoBtn = $('undoBtn'), redoBtn = $('redoBtn'), notesBtn = $('notesBtn');
const diffRow = $('difficultyRow'), gameInfoEl = $('gameInfo');
const state = { solution:[], puzzle:[], userGrid:[], notes:[], fixed:[], history:[], historyIndex:-1, selected:null, notesMode:false, difficulty:'medium', errors:0, solved:false, timerSeconds:0, timerInterval:null };

const TEMPLATE = '817642359325179468649853721572438196934516287168927543756384912483291675291765834';
const DIFFICULTY_CLUES = { easy: 42, medium: 34, hard: 28, evil: 22 };
const MAX_GENERATION_ATTEMPTS = 10;

/* ═══ Helper ═══ */
function fisherYates(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

function makeRng(seed) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => { s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0; s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0; return (s >>> 0) / 0xffffffff; };
}

/* ═══ Candidates / MRV solver ═══ */
function candidates(g, i) {
  const r = Math.floor(i / 9), c = i % 9, br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  const used = new Set();
  for (let k = 0; k < 9; k++) { used.add(g[r * 9 + k]); used.add(g[k * 9 + c]); }
  for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) used.add(g[rr * 9 + cc]);
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(n => !used.has(n));
}

function findBestEmptyCell(g) {
  let best = -1, bestCand = null;
  for (let i = 0; i < 81; i++) {
    if (g[i] !== 0) continue;
    const cand = candidates(g, i);
    if (!cand.length) return { idx: i, cand: [] };
    if (!bestCand || cand.length < bestCand.length) { best = i; bestCand = cand; }
    if (cand.length === 1) break;
  }
  return { idx: best, cand: bestCand || [] };
}

function countSol(g, limit) {
  const { idx, cand } = findBestEmptyCell(g);
  if (idx === -1) return 1;
  if (!cand.length) return 0;
  let count = 0;
  for (const n of cand) {
    g[idx] = n;
    count += countSol(g, limit - count);
    g[idx] = 0;
    if (count >= limit) break;
  }
  return count;
}

/* ═══ Grid builder ═══ */
function buildSolvedGrid(rng) {
  const base = TEMPLATE.split('').map(Number);

  // Map rows: shuffle whole bands, then rows within bands
  const rowMap = [];
  for (const band of fisherYates([0, 1, 2], rng)) {
    for (const rowInBand of fisherYates([0, 1, 2], rng)) {
      rowMap.push(band * 3 + rowInBand);
    }
  }

  // Map columns: shuffle whole stacks, then cols within stacks
  const colMap = [];
  for (const stack of fisherYates([0, 1, 2], rng)) {
    for (const colInStack of fisherYates([0, 1, 2], rng)) {
      colMap.push(stack * 3 + colInStack);
    }
  }

  // Full digit remap
  const digitMap = [0, ...fisherYates([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)];

  const solution = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      solution.push(digitMap[base[rowMap[r] * 9 + colMap[c]]]);
    }
  }
  return solution;
}

/* ═══ Generator ═══ */
function generateAttempt(diff, seed) {
  const target = DIFFICULTY_CLUES[diff] || DIFFICULTY_CLUES.medium;
  const rng = makeRng(seed);
  const solution = buildSolvedGrid(rng);
  const puzzle = [...solution];
  const idxs = fisherYates([...Array(81).keys()], rng);
  let removed = 0;

  for (const i of idxs) {
    if (81 - removed <= target) break;
    const bak = puzzle[i];
    puzzle[i] = 0;
    if (countSol([...puzzle], 2) === 1) {
      removed++;
    } else {
      puzzle[i] = bak;
    }
  }

  return { solution, puzzle, clues: puzzle.filter(v => v !== 0).length, target };
}

function generate(diff) {
  const baseSeed = Date.now() ^ (diff.charCodeAt(0) * 12345);
  let best = null;
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const candidate = generateAttempt(diff, baseSeed + attempt * 9973);
    if (!best || candidate.clues < best.clues) best = candidate;
    if (candidate.clues <= candidate.target) {
      return { solution: candidate.solution, puzzle: candidate.puzzle };
    }
  }
  return { solution: best.solution, puzzle: best.puzzle };
}

/* ═══ Timer ═══ */
function startTimer() { stopTimer(); state.timerSeconds = 0; updateTimerDisplay(); state.timerInterval = setInterval(() => { state.timerSeconds++; updateTimerDisplay(); save(); }, 1000); }
function stopTimer() { if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; } }
function updateTimerDisplay() { const s = state.timerSeconds; timerEl.textContent = String(Math.floor(s / 60)).padStart(2,'0') + ':' + String(s % 60).padStart(2,'0'); }

/* ═══ History ═══ */
function pushHistory() {
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push({ userGrid: [...state.userGrid], notes: state.notes.map(s => new Set(s)), errors: state.errors });
  state.historyIndex = state.history.length - 1;
  if (state.history.length > 500) { state.history.shift(); state.historyIndex--; }
}

function undo() { if (state.historyIndex <= 0) return; state.historyIndex--; const h = state.history[state.historyIndex]; state.userGrid = [...h.userGrid]; state.notes = h.notes.map(s => new Set(s)); state.errors = h.errors; renderBoard(); updateErrors(); save(); }
function redo() { if (state.historyIndex >= state.history.length - 1) return; state.historyIndex++; const h = state.history[state.historyIndex]; state.userGrid = [...h.userGrid]; state.notes = h.notes.map(s => new Set(s)); state.errors = h.errors; renderBoard(); updateErrors(); save(); }

/* ═══ Board ═══ */
function buildBoardDOM() {
  board.innerHTML = '';
  for (let i = 0; i < 81; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.idx = i;
    cell.dataset.row = Math.floor(i / 9);
    cell.dataset.col = i % 9;
    cell.innerHTML = '<div class="notes"></div>';
    cell.addEventListener('click', () => selectCell(i));
    board.appendChild(cell);
  }
}

function renderBoard() {
  for (let i = 0; i < 81; i++) {
    const cell = board.children[i];
    const val = state.userGrid[i], noteSet = state.notes[i];
    cell.innerHTML = '<div class="notes"></div>';
    cell.className = 'cell';
    if (state.fixed[i]) cell.classList.add('fixed');

    if (val !== 0) {
      cell.textContent = val;
    } else if (noteSet && noteSet.size > 0) {
      const ne = cell.querySelector('.notes');
      for (let n = 1; n <= 9; n++) { const sp = document.createElement('span'); sp.textContent = noteSet.has(n) ? n : ''; ne.appendChild(sp); }
    }

    // Persistent error / correct highlighting
    if (!state.fixed[i] && val !== 0 && state.solution.length === 81) {
      if (val !== state.solution[i]) cell.classList.add('error');
      else cell.classList.add('correct');
    }

    if (state.selected !== null) {
      if (i === state.selected) { cell.classList.add('selected'); }
      else {
        const sr = Math.floor(state.selected / 9), sc = state.selected % 9, tr = Math.floor(i / 9), tc = i % 9;
        if (tr === sr || tc === sc || (Math.floor(sr / 3) === Math.floor(tr / 3) && Math.floor(sc / 3) === Math.floor(tc / 3))) cell.classList.add('related');
        if (state.userGrid[i] !== 0 && state.userGrid[i] === state.userGrid[state.selected]) cell.classList.add('same');
      }
    }
  }
}

function selectCell(idx) { if (state.solved) return; state.selected = idx; renderBoard(); }

/* ═══ Input ═══ */
function placeNumber(n) {
  if (state.selected === null || state.solved) return;
  const idx = state.selected;
  if (state.fixed[idx]) return;
  pushHistory();

  if (state.notesMode) {
    const ns = state.notes[idx];
    if (n === 0) { ns.clear(); }
    else { ns.has(n) ? ns.delete(n) : ns.add(n); }
    state.userGrid[idx] = 0;
  } else {
    state.notes[idx].clear();
    state.userGrid[idx] = n;
    if (n !== 0 && n !== state.solution[idx]) { state.errors++; updateErrors(); }
  }

  renderBoard();
  save();
  checkWin();
}

function updateErrors() { errorsEl.textContent = state.errors; }
function checkWin() { if (state.userGrid.every((v, i) => v === state.solution[i])) { state.solved = true; stopTimer(); statusEl.textContent = 'Solved!'; showWinScreen(); save(); } }

function showWinScreen() {
  const ov = document.createElement('div');
  ov.className = 'win-overlay';
  const mm = String(Math.floor(state.timerSeconds / 60)).padStart(2, '0'), ss = String(state.timerSeconds % 60).padStart(2, '0');
  ov.innerHTML = '<div class="win-card"><h2>Sudoku Complete!</h2><p>Time: ' + mm + ':' + ss + ' &nbsp;|&nbsp; Errors: ' + state.errors + '</p><button class="btn" id="playAgain">New Game</button></div>';
  document.body.appendChild(ov);
  $('playAgain').addEventListener('click', () => { ov.remove(); showDifficultyPicker(); });
}

/* ═══ Game flow ═══ */
function showDifficultyPicker() { diffRow.style.display = 'flex'; gameInfoEl.style.display = 'none'; stopTimer(); statusEl.textContent = ''; state.selected = null; state.solved = false; state.errors = 0; updateErrors(); clearBoard(); }

function startGame(diff) {
  const { solution, puzzle } = generate(diff);
  state.solution = solution; state.puzzle = puzzle; state.userGrid = [...puzzle];
  state.fixed = puzzle.map(v => v !== 0); state.notes = Array.from({ length: 81 }, () => new Set());
  state.history = []; state.historyIndex = -1; state.selected = null; state.solved = false; state.errors = 0;
  pushHistory();
  diffRow.style.display = 'none'; gameInfoEl.style.display = 'flex'; errorsEl.textContent = '0'; statusEl.textContent = '';
  buildBoardDOM(); renderBoard(); startTimer(); save();
}

function clearBoard() { board.innerHTML = '<div style="grid-column:1/10;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.9rem;padding:2rem;">Click "New Game" to start</div>'; }

/* ═══ Storage ═══ */
const STORAGE_KEY = 'sudoku_v1';
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ solution: state.solution, puzzle: state.puzzle, userGrid: state.userGrid, notes: state.notes.map(s => [...s]), fixed: state.fixed, difficulty: state.difficulty, errors: state.errors, solved: state.solved, timerSeconds: state.timerSeconds, history: state.history.map(h => ({ userGrid: h.userGrid, notes: h.notes.map(s => [...s]), errors: h.errors })), historyIndex: state.historyIndex })); } catch (e) {} }
function load() { try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return false; const d = JSON.parse(raw); state.solution = d.solution; state.puzzle = d.puzzle; state.userGrid = d.userGrid; state.notes = d.notes.map(s => new Set(s)); state.fixed = d.fixed; state.difficulty = d.difficulty; state.errors = d.errors ?? 0; state.solved = d.solved; state.timerSeconds = d.timerSeconds ?? 0; state.history = (d.history ?? []).map(h => ({ userGrid: h.userGrid, notes: h.notes.map(s => new Set(s)), errors: h.errors })); state.historyIndex = d.historyIndex ?? -1; return true; } catch (e) { return false; } }

/* ═══ Keyboard ═══ */
document.addEventListener('keydown', e => {
  if (state.selected === null || state.solved) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9) placeNumber(n);
  else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') placeNumber(0);
  else if (e.key === 'ArrowUp')    { if (state.selected >= 9)  { state.selected -= 9;  renderBoard(); } e.preventDefault(); }
  else if (e.key === 'ArrowDown')  { if (state.selected < 72) { state.selected += 9;  renderBoard(); } e.preventDefault(); }
  else if (e.key === 'ArrowLeft')  { if (state.selected % 9 > 0) { state.selected--; renderBoard(); } e.preventDefault(); }
  else if (e.key === 'ArrowRight') { if (state.selected % 9 < 8) { state.selected++; renderBoard(); } e.preventDefault(); }
  else if (e.key === 'n' || e.key === 'N') { state.notesMode = !state.notesMode; document.body.classList.toggle('notes-active', state.notesMode); }
  else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { undo(); e.preventDefault(); }
  else if (e.key === 'y' && (e.ctrlKey || e.metaKey)) { redo(); e.preventDefault(); }
});

newGameBtn.addEventListener('click', showDifficultyPicker);
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
notesBtn.addEventListener('click', () => { state.notesMode = !state.notesMode; document.body.classList.toggle('notes-active', state.notesMode); });
document.querySelectorAll('.num-btn').forEach(btn => { btn.addEventListener('click', () => { placeNumber(parseInt(btn.dataset.n, 10)); }); });
document.querySelectorAll('.btn--diff').forEach(btn => { btn.addEventListener('click', () => { document.querySelectorAll('.btn--diff').forEach(b => b.classList.remove('active')); btn.classList.add('active'); state.difficulty = btn.dataset.diff; }); });
$('difficultyRow').querySelector('.btn--start').addEventListener('click', () => { startGame(state.difficulty); });

function init() { if (load() && !state.solved && state.solution.length === 81) { diffRow.style.display = 'none'; gameInfoEl.style.display = 'flex'; buildBoardDOM(); renderBoard(); updateErrors(); updateTimerDisplay(); startTimer(); } else { clearBoard(); } }
init();