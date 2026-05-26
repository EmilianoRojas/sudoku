'use strict';
const $ = id => document.getElementById(id);
const board = $('board'), timerEl = $('timer'), statusEl = $('statusMsg'), errorsEl = $('errorCount');
const newGameBtn = $('newGameBtn'), undoBtn = $('undoBtn'), redoBtn = $('redoBtn'), notesBtn = $('notesBtn');
const diffRow = $('difficultyRow'), gameInfoEl = $('gameInfo');
const state = { solution:[], puzzle:[], userGrid:[], notes:[], fixed:[], history:[], historyIndex:-1, selected:null, notesMode:false, difficulty:'medium', errors:0, solved:false, timerSeconds:0, timerInterval:null };

const TEMPLATE = '534678912672195348198342567859761423426853791713924856961537284287146935348219675';

function candidates(g, i) {
  const r = Math.floor(i / 9), c = i % 9, br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  const used = new Set();
  for (let k = 0; k < 9; k++) { used.add(g[r * 9 + k]); used.add(g[k * 9 + c]); }
  for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) used.add(g[rr * 9 + cc]);
  return [1,2,3,4,5,6,7,8,9].filter(n => !used.has(n));
}

function countSol(g, limit) {
  const i = g.indexOf(0);
  if (i === -1) return 1;
  let count = 0;
  for (const n of candidates(g, i)) {
    g[i] = n;
    count += countSol(g, limit - count);
    g[i] = 0;
    if (count >= limit) break;
  }
  return count;
}

function makeRng(seed) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => { s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0; s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0; return (s >>> 0) / 0xffffffff; };
}

function fisherYates(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

function generate(diff) {
  const seed = Date.now() ^ (diff.charCodeAt(0) * 12345);
  const rng = makeRng(seed);
  const sol = TEMPLATE.split('').map(Number);

  // Shuffle bands
  for (let b = 0; b < 3; b++) {
    const band = sol.slice(b * 27, b * 27 + 27);
    const order = fisherYates([0, 1, 2], rng);
    const reordered = [].concat(...order.map(o => band.slice(o * 9, o * 9 + 9)));
    for (let k = 0; k < 27; k++) sol[b * 27 + k] = reordered[k];
  }

  // Shuffle stacks
  for (let st = 0; st < 3; st++) {
    for (let r = 0; r < 9; r++) {
      const col0 = st * 3;
      const vals = [sol[r * 9 + col0], sol[r * 9 + col0 + 1], sol[r * 9 + col0 + 2]];
      fisherYates(vals, rng);
      sol[r * 9 + col0] = vals[0]; sol[r * 9 + col0 + 1] = vals[1]; sol[r * 9 + col0 + 2] = vals[2];
    }
  }

  // Swap digits
  const dMap = {1:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9};
  for (let i = 0; i < 6; i++) {
    const a = Math.floor(rng() * 9) + 1, b = Math.floor(rng() * 9) + 1;
    if (a !== b) { for (let k = 1; k <= 9; k++) { if (dMap[k] === a) dMap[k] = b; else if (dMap[k] === b) dMap[k] = a; } }
  }
  const solution = sol.map(v => dMap[v]);

  // Create puzzle
  const target = {easy:42, medium:34, hard:28, evil:22}[diff] || 34;
  const toRemove = 81 - target;
  const puzzle = [...solution];
  const idxs = fisherYates([...Array(81).keys()], rng);

  for (let removed = 0, tries = 0; removed < toRemove && tries < 5000; tries++) {
    const i = idxs[tries % 81];
    if (puzzle[i] === 0) continue;
    const bak = puzzle[i];
    puzzle[i] = 0;
    const copy = [...puzzle];
    if (!copy.includes(0) || countSol(copy, 1) === 1) { removed++; } else { puzzle[i] = bak; }
  }

  return { solution, puzzle };
}

function startTimer() { stopTimer(); state.timerSeconds = 0; updateTimerDisplay(); state.timerInterval = setInterval(() => { state.timerSeconds++; updateTimerDisplay(); save(); }, 1000); }
function stopTimer() { if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; } }
function updateTimerDisplay() { const s = state.timerSeconds; timerEl.textContent = String(Math.floor(s / 60)).padStart(2,'0') + ':' + String(s % 60).padStart(2,'0'); }

function pushHistory() {
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push({ userGrid: [...state.userGrid], notes: state.notes.map(s => new Set(s)), errors: state.errors });
  state.historyIndex = state.history.length - 1;
  if (state.history.length > 500) { state.history.shift(); state.historyIndex--; }
}

function undo() { if (state.historyIndex <= 0) return; state.historyIndex--; const h = state.history[state.historyIndex]; state.userGrid = [...h.userGrid]; state.notes = h.notes.map(s => new Set(s)); state.errors = h.errors; renderBoard(); updateErrors(); save(); }
function redo() { if (state.historyIndex >= state.history.length - 1) return; state.historyIndex++; const h = state.history[state.historyIndex]; state.userGrid = [...h.userGrid]; state.notes = h.notes.map(s => new Set(s)); state.errors = h.errors; renderBoard(); updateErrors(); save(); }

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
    if (val !== 0) { cell.textContent = val; }
    else if (noteSet && noteSet.size > 0) {
      const ne = cell.querySelector('.notes');
      for (let n = 1; n <= 9; n++) { const sp = document.createElement('span'); sp.textContent = noteSet.has(n) ? n : ''; ne.appendChild(sp); }
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

function placeNumber(n) {
  if (state.selected === null || state.solved) return;
  const idx = state.selected;
  if (state.fixed[idx]) return;
  pushHistory();
  if (state.notesMode) {
    const ns = state.notes[idx];
    ns.has(n) ? ns.delete(n) : ns.add(n);
    state.userGrid[idx] = 0;
  } else {
    state.notes[idx].clear();
    state.userGrid[idx] = n;
    const cell = board.children[idx];
    cell.classList.remove('error', 'correct');
    if (n !== 0 && n !== state.solution[idx]) { state.errors++; cell.classList.add('error'); updateErrors(); }
    else if (n !== 0) { cell.classList.add('correct'); }
  }
  renderBoard(); save(); checkWin();
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

const STORAGE_KEY = 'sudoku_v1';
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ solution: state.solution, puzzle: state.puzzle, userGrid: state.userGrid, notes: state.notes.map(s => [...s]), fixed: state.fixed, difficulty: state.difficulty, errors: state.errors, solved: state.solved, timerSeconds: state.timerSeconds, history: state.history.map(h => ({ userGrid: h.userGrid, notes: h.notes.map(s => [...s]), errors: h.errors })), historyIndex: state.historyIndex })); } catch (e) {} }
function load() { try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return false; const d = JSON.parse(raw); state.solution = d.solution; state.puzzle = d.puzzle; state.userGrid = d.userGrid; state.notes = d.notes.map(s => new Set(s)); state.fixed = d.fixed; state.difficulty = d.difficulty; state.errors = d.errors ?? 0; state.solved = d.solved; state.timerSeconds = d.timerSeconds ?? 0; state.history = (d.history ?? []).map(h => ({ userGrid: h.userGrid, notes: h.notes.map(s => new Set(s)), errors: h.errors })); state.historyIndex = d.historyIndex ?? -1; return true; } catch (e) { return false; } }

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
