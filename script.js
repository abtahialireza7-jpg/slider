const app = document.getElementById('app');
const IMAGE_KEY = 'sp_puzzle_image';

let state = {
  screen: 'home',
  rows: 3, cols: 3,
  board: [], moves: 0, startTime: null, elapsed: 0, timerId: null, won: false,
  image: localStorage.getItem(IMAGE_KEY) || null
};

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m + ':' + String(rem).padStart(2, '0');
}

function newBoard(rows, cols) {
  const n = rows * cols;
  const arr = [...Array(n - 1).keys()].map(i => i + 1);
  arr.push(0);
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
  }
  render();
}

function handleImageFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.image = reader.result;
    try { localStorage.setItem(IMAGE_KEY, state.image); } catch (e) {}
    render();
  };
  reader.readAsDataURL(file);
}
function removeImage() {
  state.image = null;
  localStorage.removeItem(IMAGE_KEY);
  render();
}

function screenHome() {
  let sizeButtons = '';
  for (let n = 2; n <= 10; n++) sizeButtons += `<button data-size="${n}">${n}\u00d7${n}</button>`;

  const imageSection = state.image
    ? `<div class="img-preview"><img src="${state.image}" alt="Selected puzzle image"></div>
       <div class="row">
         <button id="changeImgBtn">Change image</button>
         <button id="removeImgBtn">Remove image</button>
       </div>
       <p class="msg">Tiles will show pieces of this image.</p>`
    : `<button class="btn-accent full" id="addImgBtn">Add image</button>
       <p class="msg">No image selected — tiles will show numbers.</p>`;

  return `
  <div>
    <h1>Slider</h1>
    <p class="sub">Slide the tiles to solve the puzzle.</p>
  </div>
  <div class="panel">
    <h2>Puzzle image</h2>
    ${imageSection}
    <input type="file" id="imgFileInput" accept="image/*" style="display:none">
  </div>
  <div class="panel">
    <h2>Choose a size</h2>
    <div class="size-grid">${sizeButtons}</div>
  </div>
  <div class="panel">
    <h2>Custom size</h2>
    <div class="row">
      <div class="field"><label>Rows</label><input type="number" id="customRows" value="4" min="2" max="10"></div>
      <div class="field"><label>Columns</label><input type="number" id="customCols" value="3" min="2" max="10"></div>
    </div>
    <button class="btn-accent full" id="customBtn">Build puzzle</button>
  </div>
  `;
}
function clampInt(v, lo, hi) { v = parseInt(v, 10); if (isNaN(v)) v = lo; return Math.max(lo, Math.min(hi, v)); }

function screenPuzzle() {
  const { rows, cols, board, image } = state;
  let tiles = '';
  board.forEach((v, i) => {
    if (v === 0) {
      tiles += `<div class="tile blank"></div>`;
    } else if (image) {
      const pos = v - 1;
      const r = Math.floor(pos / cols), c = pos % cols;
      const xPct = cols > 1 ? (c / (cols - 1)) * 100 : 0;
      const yPct = rows > 1 ? (r / (rows - 1)) * 100 : 0;
      tiles += `<div class="tile tile-img" data-idx="${i}" style="background-image:url('${image}'); background-size:${cols * 100}% ${rows * 100}%; background-position:${xPct}% ${yPct}%;"></div>`;
    } else {
      tiles += `<div class="tile" data-idx="${i}">${v}</div>`;
    }
  });
  const win = state.won
    ? `<div class="winbox">Solved in ${fmtTime(state.elapsed)}, ${state.moves} moves.</div>`
    : '';
  return `
  <div class="top">
    <button class="linkbtn" id="backBtn">← Back</button>
    <h2>${rows}\u00d7${cols}</h2>
    <button id="reshuffleBtn">New shuffle</button>
  </div>
  <div class="statbar panel">
    <span>Time <b id="timerVal">${fmtTime(state.elapsed)}</b></span>
    <span>Moves <b>${state.moves}</b></span>
  </div>
  ${win}
  <div id="board" style="grid-template-columns:repeat(${cols},1fr); grid-template-rows:repeat(${rows},1fr); aspect-ratio:${cols}/${rows}">${tiles}</div>
  `;
}

function render() {
  let html = '';
  if (state.screen === 'home') html = screenHome();
  else if (state.screen === 'puzzle') html = screenPuzzle();
  app.innerHTML = html;

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
    const fileInput = document.getElementById('imgFileInput');
    fileInput.addEventListener('change', e => handleImageFile(e.target.files[0]));
    const addBtn = document.getElementById('addImgBtn');
    if (addBtn) addBtn.addEventListener('click', () => fileInput.click());
    const changeBtn = document.getElementById('changeImgBtn');
    if (changeBtn) changeBtn.addEventListener('click', () => fileInput.click());
    const removeBtn = document.getElementById('removeImgBtn');
    if (removeBtn) removeBtn.addEventListener('click', removeImage);
  }
  if (state.screen === 'puzzle') {
    document.querySelectorAll('[data-idx]').forEach(el => {
      el.addEventListener('click', () => tapTile(parseInt(el.dataset.idx, 10)));
    });
    document.getElementById('backBtn').addEventListener('click', () => { state.screen = 'home'; render(); });
    document.getElementById('reshuffleBtn').addEventListener('click', () => startPuzzle(state.rows, state.cols));
  }
}

render();
