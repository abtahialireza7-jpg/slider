import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, query, where, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let db = null;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (e) {
  console.warn("Firebase not configured yet — leaderboards will be disabled.", e);
}

const app = document.getElementById('app');
const NAME_KEY = 'sp_player_name';

let state = {
  screen: localStorage.getItem(NAME_KEY) ? 'home' : 'name',
  rows: 3, cols: 3,
  board: [], moves: 0, startTime: null, elapsed: 0, timerId: null, won: false,
  lbSize: '3x3', lbEntries: null, lbLoading: false
};

function sizeKey(r, c) { return r + 'x' + c; }

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m + ':' + String(rem).padStart(2, '0');
}

// ---------- puzzle logic ----------
function newBoard(rows, cols) {
  const n = rows * cols;
  const arr = [...Array(n - 1).keys()].map(i => i + 1);
  arr.push(0); // 0 = blank
  // Shuffle via random valid moves from the solved state so it's always solvable.
  let blank = n - 1;
  const shuffleMoves = Math.max(80, n * 10);
  for (let i = 0; i < shuffleMoves; i++) {
    const neighbors = getNeighbors(blank, rows, cols);
    const pick = neighbors[Math.floor(Math.random() * neighbors.length)];
    [arr[blank], arr[pick]] = [arr[pick], arr[blank]];
    blank = pick;
  }
  return arr;
}
function getNeighbors(idx, rows, cols) {
  const r = Math.floor(idx / cols), c = idx % cols;
  const res = [];
  if (r > 0) res.push(idx - cols);
  if (r < rows - 1) res.push(idx + cols);
  if (c > 0) res.push(idx - 1);
  if (c < cols - 1) res.push(idx + 1);
  return res;
}
function isSolved(arr) {
  for (let i = 0; i < arr.length - 1; i++) if (arr[i] !== i + 1) return false;
  return arr[arr.length - 1] === 0;
}
function startPuzzle(rows, cols) {
  state.rows = rows; state.cols = cols;
  state.board = newBoard(rows, cols);
  state.moves = 0; state.startTime = null; state.elapsed = 0; state.won = false;
  clearInterval(state.timerId);
  state.screen = 'puzzle';
  render();
}
function tapTile(idx) {
  if (state.won) return;
  const blank = state.board.indexOf(0);
  const neighbors = getNeighbors(blank, state.rows, state.cols);
  if (!neighbors.includes(idx)) return;
  if (state.startTime === null) {
    state.startTime = Date.now();
    state.timerId = setInterval(() => {
      state.elapsed = Date.now() - state.startTime;
      const el = document.getElementById('timerVal');
      if (el) el.textContent = fmtTime(state.elapsed);
    }, 250);
  }
  [state.board[blank], state.board[idx]] = [state.board[idx], state.board[blank]];
  state.moves++;
  if (isSolved(state.board)) {
    state.won = true;
    state.elapsed = Date.now() - state.startTime;
    clearInterval(state.timerId);
    submitScore();
  }
  render();
}
async function submitScore() {
  if (!db) return;
  const name = localStorage.getItem(NAME_KEY) || 'Player';
  const size = sizeKey(state.rows, state.cols);
  try {
    await addDoc(collection(db, 'scores'), {
      size, name, timeMs: state.elapsed, moves: state.moves, ts: Date.now()
    });
  } catch (e) {
    console.warn('Could not save score:', e);
  }
}

// ---------- leaderboard ----------
async function loadLeaderboard(size) {
  state.screen = 'lb';
  state.lbSize = size;
  state.lbEntries = null;
  state.lbLoading = true;
  render();
  if (!db) { state.lbLoading = false; render(); return; }
  try {
    const q = query(
      collection(db, 'scores'),
      where('size', '==', size),
      orderBy('timeMs', 'asc'),
      limit(10)
    );
    const snap = await getDocs(q);
    state.lbEntries = snap.docs.map(d => d.data());
  } catch (e) {
    console.warn('Could not load leaderboard:', e);
    state.lbEntries = [];
  }
  state.lbLoading = false;
  render();
}

// ---------- screens ----------
function screenName() {
  return `
  <h1>🧩 Slider Puzzle</h1>
  <p class="sub">What should we call you?</p>
  <div class="card">
    <input type="text" id="nameInput" placeholder="Your name" maxlength="20" autofocus>
    <div style="height:10px"></div>
    <button class="btn-accent" style="width:100%" id="startBtn">Start playing</button>
  </div>`;
}
function screenHome() {
  const name = localStorage.getItem(NAME_KEY) || 'Player';
  let sizeButtons = '';
  for (let n = 2; n <= 10; n++) sizeButtons += `<button data-size="${n}">${n}×${n}</button>`;
  return `
  <h1>🧩 Slider Puzzle</h1>
  <p class="sub">Hi, ${escapeHtml(name)} — pick a size</p>
  <div class="card">
    <div class="size-grid">${sizeButtons}</div>
  </div>
  <div class="card">
    <b>Custom level</b>
    <div class="row" style="margin-top:10px">
      <div class="field"><label>Rows</label><input type="number" id="customRows" value="4" min="2" max="10"></div>
      <div class="field"><label>Columns</label><input type="number" id="customCols" value="3" min="2" max="10"></div>
    </div>
    <div style="height:10px"></div>
    <button class="btn-accent" style="width:100%" id="customBtn">Build & play</button>
  </div>
  <button class="linkbtn" id="viewLbBtn">View leaderboards →</button>
  `;
}
function clampInt(v, lo, hi) { v = parseInt(v, 10); if (isNaN(v)) v = lo; return Math.max(lo, Math.min(hi, v)); }

function screenPuzzle() {
  const { rows, cols, board } = state;
  let tiles = '';
  board.forEach((v, i) => {
    if (v === 0) tiles += `<div class="tile blank"></div>`;
    else tiles += `<div class="tile" data-idx="${i}">${v}</div>`;
  });
  const win = state.won
    ? `<div class="winbox">🎉 Solved in ${fmtTime(state.elapsed)} with ${state.moves} moves!</div>`
    : '';
  return `
  <div class="top">
    <button class="linkbtn" id="backBtn">← Back</button>
    <b>${rows}×${cols}</b>
    <button id="reshuffleBtn">🔄 Reshuffle</button>
  </div>
  <div class="statbar card">
    <span>Time: <b id="timerVal">${fmtTime(state.elapsed)}</b></span>
    <span>Moves: <b>${state.moves}</b></span>
  </div>
  ${win}
  <div id="board" style="grid-template-columns:repeat(${cols},1fr); grid-template-rows:repeat(${rows},1fr); aspect-ratio:${cols}/${rows}">${tiles}</div>
  ${state.won ? `<button class="btn-accent" style="width:100%" id="seeLbBtn">See leaderboard for ${rows}×${cols} →</button>` : ''}
  `;
}
function screenLeaderboard() {
  let sizeButtons = '';
  for (let n = 2; n <= 10; n++) {
    const active = state.lbSize === n + 'x' + n;
    sizeButtons += `<button data-lbsize="${n}x${n}" style="${active ? 'background:var(--accent);color:var(--accent-ink)' : ''}">${n}×${n}</button>`;
  }
  let body;
  if (!db) {
    body = `<p class="msg">Leaderboards aren't configured yet — add your Firebase keys to firebase-config.js.</p>`;
  } else if (state.lbLoading) {
    body = `<p class="msg">Loading…</p>`;
  } else if (!state.lbEntries || state.lbEntries.length === 0) {
    body = `<p class="msg">No times yet for ${state.lbSize} — be the first!</p>`;
  } else {
    body = `<table class="lbtable"><thead><tr><th>#</th><th>Name</th><th>Time</th><th>Moves</th></tr></thead><tbody>`
      + state.lbEntries.map((e, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(e.name || 'Player')}</td><td>${fmtTime(e.timeMs)}</td><td>${e.moves}</td></tr>`).join('')
      + `</tbody></table>`;
  }
  return `
  <div class="top">
    <button class="linkbtn" id="backBtn">← Back</button>
    <b>Leaderboards</b>
    <span style="width:60px"></span>
  </div>
  <div class="card">
    <div class="size-grid">${sizeButtons}</div>
  </div>
  <div class="card">
    <p class="pill">${state.lbSize}</p>
    ${body}
  </div>
  <p class="msg">Custom levels get ranked the same way — their leaderboard just isn't listed as a button here.</p>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function saveName() {
  const v = document.getElementById('nameInput').value.trim();
  if (!v) return;
  localStorage.setItem(NAME_KEY, v.slice(0, 20));
  state.screen = 'home';
  render();
}

// ---------- render + event delegation ----------
function render() {
  let html = '';
  if (state.screen === 'name') html = screenName();
  else if (state.screen === 'home') html = screenHome();
  else if (state.screen === 'puzzle') html = screenPuzzle();
  else if (state.screen === 'lb') html = screenLeaderboard();
  app.innerHTML = html;

  if (state.screen === 'name') {
    const inp = document.getElementById('nameInput');
    document.getElementById('startBtn').addEventListener('click', saveName);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') saveName(); });
  }
  if (state.screen === 'home') {
    document.querySelectorAll('[data-size]').forEach(btn => {
      const n = parseInt(btn.dataset.size, 10);
      btn.addEventListener('click', () => startPuzzle(n, n));
    });
    document.getElementById('customBtn').addEventListener('click', () => {
      const r = clampInt(document.getElementById('customRows').value, 2, 10);
      const c = clampInt(document.getElementById('customCols').value, 2, 10);
      startPuzzle(r, c);
    });
    document.getElementById('viewLbBtn').addEventListener('click', () => loadLeaderboard('3x3'));
  }
  if (state.screen === 'puzzle') {
    document.querySelectorAll('[data-idx]').forEach(el => {
      el.addEventListener('click', () => tapTile(parseInt(el.dataset.idx, 10)));
    });
    document.getElementById('backBtn').addEventListener('click', () => { state.screen = 'home'; render(); });
    document.getElementById('reshuffleBtn').addEventListener('click', () => startPuzzle(state.rows, state.cols));
    const seeLb = document.getElementById('seeLbBtn');
    if (seeLb) seeLb.addEventListener('click', () => loadLeaderboard(sizeKey(state.rows, state.cols)));
  }
  if (state.screen === 'lb') {
    document.getElementById('backBtn').addEventListener('click', () => { state.screen = 'home'; render(); });
    document.querySelectorAll('[data-lbsize]').forEach(btn => {
      btn.addEventListener('click', () => loadLeaderboard(btn.dataset.lbsize));
    });
  }
}

render();
