// =============================================
//  🎮 消消乐 - 核心游戏逻辑
// =============================================

// ===== 配置 =====
const COLS = 8, ROWS = 8;
const TILE_TYPES = 6;
const TILE_EMOJIS = ['🍎', '🍊', '🍋', '🍇', '🫐', '🍏'];
const MAX_MOVES = 30;
const GAME_TIME = 60; // 秒

// ===== 状态 =====
let board = [];
let score = 0;
let combo = 0;
let maxCombo = 0;
let totalMatches = 0;
let movesLeft = MAX_MOVES;
let timeLeft = GAME_TIME;
let isProcessing = false;
let selectedTile = null;
let timerInterval = null;
let isGameOver = false;

// DOM 引用
const boardEl = document.getElementById('gameBoard');
const scoreDisplay = document.getElementById('scoreDisplay');
const comboDisplay = document.getElementById('comboDisplay');
const timerDisplay = document.getElementById('timerDisplay');
const movesDisplay = document.getElementById('movesDisplay');
const progressFill = document.getElementById('progressFill');

// ===== 自适应棋盘尺寸 =====
function resizeBoard() {
  const wrapper = boardEl.closest('.game-board-wrapper');
  if (!wrapper) return;
  // 用 wrapper 可用宽度算出正方形边长
  const w = wrapper.clientWidth;
  // 扣除 board-border 的 padding (4px*2) + game-board 的 padding (4px*2) + gap*(COLS-1)
  // 用单元格数量来简单估算：总宽 = COLS * 单元格尺寸 + (COLS-1)*gap + padding*2
  const gap = window.innerWidth < 420 ? 2 : (window.innerWidth >= 600 ? 4 : 3);
  const padding = window.innerWidth < 420 ? 4 : (window.innerWidth >= 600 ? 8 : 6);
  const borderPad = 4;
  const availW = w - borderPad * 2 - padding * 2;
  const tileSize = Math.floor((availW - gap * (COLS - 1)) / COLS);
  const boardSize = tileSize * COLS + gap * (COLS - 1) + padding * 2;
  boardEl.style.width = boardSize + 'px';
  boardEl.style.height = boardSize + 'px';
  // 设置格子尺寸 via CSS grid
  boardEl.style.gridTemplateColumns = `repeat(${COLS}, ${tileSize}px)`;
  boardEl.style.gridTemplateRows = `repeat(${ROWS}, ${tileSize}px)`;
  // 字体大小：tileSize 的 ~45%
  const fontSize = Math.round(tileSize * 0.5);
  boardEl.style.setProperty('--tile-font-size', fontSize + 'px');
  // 应用到每个 tile
  const tiles = boardEl.querySelectorAll('.tile .gem');
  tiles.forEach(el => el.style.fontSize = fontSize + 'px');
}

// 监听窗口变化
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resizeBoard, 150);
});

// =============================================
//  🎨 背景粒子系统
// =============================================
function initBackground() {
  const canvas = document.getElementById('bgCanvas');
  const ctx = canvas.getContext('2d');
  let W, H;
  const particles = [];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.size = Math.random() * 4 + 1;
      this.speedX = (Math.random() - 0.5) * 0.5;
      this.speedY = (Math.random() - 0.5) * 0.5 - 0.3;
      this.opacity = Math.random() * 0.5 + 0.2;
      this.hue = Math.random() * 60 + 270; // purple-blue range
      this.life = 0;
      this.maxLife = Math.random() * 300 + 200;
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      this.life++;
      if (this.life > this.maxLife || this.x < -10 || this.x > W + 10 || this.y < -10 || this.y > H + 10) {
        this.reset();
        this.life = 0;
      }
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${this.hue}, 80%, 70%, ${this.opacity * (1 - this.life / this.maxLife)})`;
      ctx.fill();
      // glow
      ctx.shadowBlur = 15;
      ctx.shadowColor = `hsla(${this.hue}, 80%, 70%, 0.3)`;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  for (let i = 0; i < 80; i++) particles.push(new Particle());

  // 连接线
  function drawLines() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(200, 160, 255, ${0.06 * (1 - dist / 150)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  function animate() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      p.update();
      p.draw();
    }
    drawLines();
    requestAnimationFrame(animate);
  }
  animate();
}

// =============================================
//  🎮 游戏核心
// =============================================

// 初始化棋盘
function initBoard() {
  board = [];
  for (let r = 0; r < ROWS; r++) {
    board[r] = [];
    for (let c = 0; c < COLS; c++) {
      board[r][c] = randomType();
    }
  }
  // 消除初始匹配，直到没有
  while (findAllMatches().length > 0) {
    for (const m of findAllMatches()) {
      board[m.r][m.c] = randomType();
    }
  }
}

function randomType() {
  return Math.floor(Math.random() * TILE_TYPES);
}

// ===== 匹配检测 =====
function findAllMatches() {
  const matched = new Set();

  // 水平匹配 (3+)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 2; c++) {
      const t = board[r][c];
      if (t < 0) continue;
      if (board[r][c + 1] === t && board[r][c + 2] === t) {
        let end = c + 2;
        while (end + 1 < COLS && board[r][end + 1] === t) end++;
        for (let k = c; k <= end; k++) matched.add(`${r},${k}`);
        c = end; // skip ahead
      }
    }
  }

  // 垂直匹配 (3+)
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS - 2; r++) {
      const t = board[r][c];
      if (t < 0) continue;
      if (board[r + 1][c] === t && board[r + 2][c] === t) {
        let end = r + 2;
        while (end + 1 < ROWS && board[end + 1][c] === t) end++;
        for (let k = r; k <= end; k++) matched.add(`${k},${c}`);
        r = end;
      }
    }
  }

  return [...matched].map(s => {
    const [r, c] = s.split(',').map(Number);
    return { r, c };
  });
}

// ===== 交换检测 =====
function isValidSwap(r1, c1, r2, c2) {
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}

// ===== 检查是否有可行的操作 =====
function hasValidMoves() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      // 尝试向右交换
      if (c + 1 < COLS) {
        [board[r][c], board[r][c + 1]] = [board[r][c + 1], board[r][c]];
        if (findAllMatches().length > 0) {
          [board[r][c], board[r][c + 1]] = [board[r][c + 1], board[r][c]];
          return true;
        }
        [board[r][c], board[r][c + 1]] = [board[r][c + 1], board[r][c]];
      }
      // 尝试向下交换
      if (r + 1 < ROWS) {
        [board[r][c], board[r + 1][c]] = [board[r + 1][c], board[r][c]];
        if (findAllMatches().length > 0) {
          [board[r][c], board[r + 1][c]] = [board[r + 1][c], board[r][c]];
          return true;
        }
        [board[r][c], board[r + 1][c]] = [board[r + 1][c], board[r][c]];
      }
    }
  }
  return false;
}

// ===== 找提示 =====
function findHint() {
  if (isProcessing || isGameOver) return;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS) {
        [board[r][c], board[r][c + 1]] = [board[r][c + 1], board[r][c]];
        if (findAllMatches().length > 0) {
          [board[r][c], board[r][c + 1]] = [board[r][c + 1], board[r][c]];
          // Highlight
          const tiles = boardEl.querySelectorAll('.tile');
          tiles[r * COLS + c]?.classList.add('hint-glow');
          tiles[r * COLS + c + 1]?.classList.add('hint-glow');
          setTimeout(() => {
            tiles[r * COLS + c]?.classList.remove('hint-glow');
            tiles[r * COLS + c + 1]?.classList.remove('hint-glow');
          }, 1500);
          return;
        }
        [board[r][c], board[r][c + 1]] = [board[r][c + 1], board[r][c]];
      }
    }
  }
}

// ===== 交换并处理 =====
async function trySwap(r1, c1, r2, c2) {
  if (isProcessing || isGameOver) return;
  if (!isValidSwap(r1, c1, r2, c2)) return;

  isProcessing = true;
  clearHintGlow();

  // 执行交换
  [board[r1][c1], board[r2][c2]] = [board[r2][c2], board[r1][c1]];

  // 检测匹配
  let matches = findAllMatches();
  if (matches.length === 0) {
    // 没有匹配，换回来
    [board[r1][c1], board[r2][c2]] = [board[r2][c2], board[r1][c1]];
    renderBoard();
    isProcessing = false;
    shakeBoard();
    return;
  }

  // 消耗步数
  movesLeft--;
  updateUI();

  // 连击处理
  combo = 0;

  // 链式消除循环
  while (matches.length > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;

    // 计算得分
    const matchScore = matches.length * 10 * combo;
    score += matchScore;
    totalMatches += matches.length;

    // 显示得分弹出
    const gridRect = boardEl.getBoundingClientRect();
    const centerX = gridRect.left + gridRect.width / 2;
    const centerY = gridRect.top + gridRect.height / 2;
    showScorePopup(matchScore, centerX, centerY);

    // 连击特效
    if (combo >= 2) {
      showComboEffect(combo);
    }

    // 标记消除动画
    const matchSet = new Set(matches.map(m => `${m.r},${m.c}`));
    const tileEls = boardEl.querySelectorAll('.tile');
    for (const m of matches) {
      const idx = m.r * COLS + m.c;
      tileEls[idx]?.classList.add('matched');
    }

    // 粒子爆发效果
    if (matches.length > 3) {
      createParticleBurst(centerX, centerY, matches.length);
    }

    await sleep(350);

    // 移除被消除的格子
    for (const m of matches) {
      board[m.r][m.c] = -1;
    }

    // 重力 - 下落
    applyGravity();

    // 填充新格子
    fillEmpty();

    renderBoard();

    // 每次填充后增加下落动画效果
    const fallingEls = boardEl.querySelectorAll('.tile.falling');
    fallingEls.forEach(el => {
      setTimeout(() => el.classList.remove('falling'), 300);
    });

    await sleep(300);

    // 检查新的匹配
    matches = findAllMatches();
  }

  updateUI();

  // 检查游戏结束条件
  if (movesLeft <= 0 || timeLeft <= 0) {
    gameOver();
    isProcessing = false;
    return;
  }

  // 检查是否还有可行操作
  if (!hasValidMoves()) {
    shuffleBoard();
  }

  isProcessing = false;
}

// ===== 重力 =====
function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    let writeRow = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c] !== -1) {
        board[writeRow][c] = board[r][c];
        if (writeRow !== r) board[r][c] = -1;
        writeRow--;
      }
    }
    // 上面剩余填充 -1
    for (let r = writeRow; r >= 0; r--) {
      board[r][c] = -1;
    }
  }
}

// ===== 填充空格 =====
function fillEmpty() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === -1) {
        board[r][c] = randomType();
      }
    }
  }
}

// ===== 洗牌 =====
function shuffleBoard() {
  // 收集所有非空类型
  const types = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      types.push(board[r][c]);
    }
  }
  // Fisher-Yates 洗牌
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  let idx = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      board[r][c] = types[idx++];
    }
  }
  // 确保没有初始匹配且有可行操作
  while (findAllMatches().length > 0 || !hasValidMoves()) {
    initBoard();
  }
  renderBoard();
  showToast('🔀 棋盘已重排！');
}

// ===== 渲染 =====
function renderBoard() {
  boardEl.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      const type = board[r][c];
      tile.dataset.type = type;
      tile.dataset.row = r;
      tile.dataset.col = c;

      const gem = document.createElement('span');
      gem.className = 'gem';
      gem.textContent = type >= 0 ? TILE_EMOJIS[type] : '';
      tile.appendChild(gem);

      initTileEvents(tile, r, c);

      // 如果是新填充的，加上下落动画
      boardEl.appendChild(tile);
    }
  }
  resizeBoard();
}

// =============================================
//  🖱️ 交互事件 — 滑动 + 点击
// =============================================

// ---- 滑动状态 ----
let swipeStartX = 0, swipeStartY = 0;
let swipeStartRow = -1, swipeStartCol = -1;
let isSwiping = false;
let swipeInputType = null; // 'touch' | 'mouse'
const SWIPE_THRESHOLD = 15; // 最小滑动距离（像素）

// ---- 全局事件：统一处理鼠标/触屏松开 ----
function onGlobalPointerUp(clientX, clientY, inputType) {
  if (!isSwiping || isProcessing || isGameOver || swipeInputType !== inputType) return;
  isSwiping = false;
  swipeInputType = null;

  const dx = clientX - swipeStartX;
  const dy = clientY - swipeStartY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (Math.max(absDx, absDy) < SWIPE_THRESHOLD) return; // 太短不算滑动

  let dr = 0, dc = 0;
  if (absDx > absDy) {
    dc = dx > 0 ? 1 : -1;
  } else {
    dr = dy > 0 ? 1 : -1;
  }

  const targetR = swipeStartRow + dr;
  const targetC = swipeStartCol + dc;
  clearSelectedHighlight();
  selectedTile = null;

  if (targetR < 0 || targetR >= ROWS || targetC < 0 || targetC >= COLS) return;
  trySwap(swipeStartRow, swipeStartCol, targetR, targetC);
}

document.addEventListener('mouseup', (e) => {
  onGlobalPointerUp(e.clientX, e.clientY, 'mouse');
});

document.addEventListener('touchend', (e) => {
  const touch = e.changedTouches[0];
  onGlobalPointerUp(touch.clientX, touch.clientY, 'touch');
}, { passive: true });

function initTileEvents(tile, r, c) {
  // 触屏开始
  tile.addEventListener('touchstart', (e) => {
    if (isProcessing || isGameOver) return;
    // 防止页面滚动
    e.preventDefault();
    const touch = e.touches[0];
    swipeStartX = touch.clientX;
    swipeStartY = touch.clientY;
    swipeStartRow = r;
    swipeStartCol = c;
    isSwiping = true;
    swipeInputType = 'touch';
    clearSelectedHighlight();
    selectedTile = { r, c };
    highlightTile(r, c, true);
  }, { passive: false });

  // 鼠标开始
  tile.addEventListener('mousedown', (e) => {
    if (isProcessing || isGameOver) return;
    e.preventDefault();
    swipeStartX = e.clientX;
    swipeStartY = e.clientY;
    swipeStartRow = r;
    swipeStartCol = c;
    isSwiping = true;
    swipeInputType = 'mouse';
    clearSelectedHighlight();
    selectedTile = { r, c };
    highlightTile(r, c, true);
  });

  // 简单点击（tap）— 通过 click 事件处理，但需要区分滑动和点击
  tile.addEventListener('click', (e) => {
    if (isProcessing || isGameOver) return;
    // 如果刚才滑动了，忽略此 click
    if (isSwiping) return;
    onTileClick(r, c);
  });
}

// ---- 点击后备方案 ----
function onTileClick(r, c) {
  if (isProcessing || isGameOver) return;

  if (selectedTile === null) {
    selectedTile = { r, c };
    highlightTile(r, c, true);
  } else {
    const sr = selectedTile.r;
    const sc = selectedTile.c;

    if (sr === r && sc === c) {
      highlightTile(sr, sc, false);
      selectedTile = null;
      return;
    }

    const dr = Math.abs(sr - r);
    const dc = Math.abs(sc - c);
    if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
      clearHintGlow();
      highlightTile(sr, sc, false);
      selectedTile = null;
      trySwap(sr, sc, r, c);
    } else {
      highlightTile(sr, sc, false);
      selectedTile = { r, c };
      highlightTile(r, c, true);
    }
  }
}

function highlightTile(r, c, state) {
  const idx = r * COLS + c;
  const tile = boardEl.children[idx];
  if (tile) {
    tile.classList.toggle('selected', state);
  }
}

function clearHighlight(r, c) {
  const idx = r * COLS + c;
  const tile = boardEl.children[idx];
  if (tile) tile.classList.remove('selected');
}

function clearSelectedHighlight() {
  boardEl.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
}

function clearHintGlow() {
  boardEl.querySelectorAll('.hint-glow').forEach(el => el.classList.remove('hint-glow'));
}

function shakeBoard() {
  boardEl.style.animation = 'none';
  void boardEl.offsetWidth;
  boardEl.style.animation = 'shake 0.3s ease';
  setTimeout(() => boardEl.style.animation = '', 300);

  // Show toast
  showToast('❌ 无法消除，再试试！');
}

// =============================================
//  🎨 特效
// =============================================

function showScorePopup(points, x, y) {
  const el = document.createElement('div');
  el.className = 'score-popup';
  el.textContent = `+${points}`;
  el.style.left = (x - 30) + 'px';
  el.style.top = (y - 20) + 'px';
  document.getElementById('popupContainer').appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

function showComboEffect(comboLevel) {
  comboDisplay.textContent = `🔥 ${comboLevel}x`;
  comboDisplay.classList.add('pop');
  setTimeout(() => comboDisplay.classList.remove('pop'), 300);

  if (comboLevel >= 3) {
    showToast(`🔥 ${comboLevel}连击！太厉害了！`);
  }
}

function createParticleBurst(x, y, count) {
  const colors = ['#f5576c', '#f093fb', '#ffd700', '#4facfe', '#43e97b', '#fa709a'];
  for (let i = 0; i < Math.min(count * 3, 20); i++) {
    const particle = document.createElement('div');
    particle.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: ${Math.random() * 6 + 3}px;
      height: ${Math.random() * 6 + 3}px;
      border-radius: 50%;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      pointer-events: none;
      z-index: 999;
      box-shadow: 0 0 6px currentColor;
    `;
    document.body.appendChild(particle);

    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * 120 + 40;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 30;

    particle.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(0)`, opacity: 0 }
    ], {
      duration: 600 + Math.random() * 300,
      easing: 'ease-out',
    }).onfinish = () => particle.remove();
  }
}

// ===== Toast 消息 =====
let toastEl = null;
function showToast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.id = 'toastEl';
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastEl._hideTimeout);
  toastEl._hideTimeout = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 1500);
}

// =============================================
//  ⏱️ 计时器 & 游戏状态
// =============================================

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (isGameOver) return;
    timeLeft--;
    updateUI();
    if (timeLeft <= 0) {
      gameOver();
    }
  }, 1000);
}

function updateUI() {
  scoreDisplay.textContent = score.toLocaleString();
  timerDisplay.textContent = timeLeft;
  movesDisplay.textContent = movesLeft;
  document.getElementById('comboDisplay').textContent = combo > 0 ? `🔥 ${combo}x` : '0';

  // 进度条
  const pct = Math.max(0, (timeLeft / GAME_TIME) * 100);
  progressFill.style.width = pct + '%';

  // 时间紧急警告
  if (timeLeft <= 10) {
    timerDisplay.style.color = '#ff4444';
    timerDisplay.style.animation = 'pulse 0.5s infinite';
  } else {
    timerDisplay.style.color = '';
    timerDisplay.style.animation = '';
  }

  // 步数警告
  if (movesLeft <= 5) {
    movesDisplay.style.color = '#ff4444';
  } else {
    movesDisplay.style.color = '';
  }
}

function gameOver() {
  if (isGameOver) return;
  isGameOver = true;
  clearInterval(timerInterval);

  document.getElementById('finalScore').textContent = score.toLocaleString();
  document.getElementById('finalCombo').textContent = `${maxCombo}x`;
  document.getElementById('finalMatches').textContent = totalMatches;
  document.getElementById('gameOverModal').style.display = 'flex';
}

function closeGameOver() {
  document.getElementById('gameOverModal').style.display = 'none';
}

// ===== 排行榜 =====
let lbData = [];
let lbTab = 'all';

async function showLeaderboard() {
  const modal = document.getElementById('leaderboardModal');
  modal.style.display = 'flex';
  document.getElementById('lbList').innerHTML = '<div class="loading-spinner">⏳ 加载中...</div>';
  try {
    const data = await GameAPI.getLeaderboard(100);
    lbData = data;
    renderLeaderboard();
  } catch {
    document.getElementById('lbList').innerHTML = '<div class="loading-spinner">❌ 加载失败</div>';
  }
}

function closeLeaderboard() {
  document.getElementById('leaderboardModal').style.display = 'none';
}

function switchLbTab(tab, btn) {
  lbTab = tab;
  document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderLeaderboard();
}

function renderLeaderboard() {
  const list = document.getElementById('lbList');
  if (!lbData || lbData.length === 0) {
    list.innerHTML = '<div class="no-data"><div class="no-data-icon">🏆</div>暂无记录，快来挑战！</div>';
    return;
  }

  // 今日/全部筛选
  let filtered = lbData;
  if (lbTab === 'today') {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    // 数据库时间加了8小时，需要比较日期部分
    filtered = lbData.filter(d => {
      const dStr = (d.created_at || '').slice(0, 10);
      return dStr === todayStr;
    });
  }

  if (filtered.length === 0) {
    list.innerHTML = '<div class="no-data"><div class="no-data-icon">📅</div>今日暂无记录</div>';
    return;
  }

  // 前3名奖牌
  const medals = ['🥇', '🥈', '🥉'];

  list.innerHTML = filtered.map((item, i) => {
    const rank = i < 3
      ? `<span class="lb-rank ${['gold','silver','bronze'][i]}">${i + 1}</span>`
      : `<span class="lb-rank">${i + 1}</span>`;
    const name = item.player_name || '匿名';
    const scoreNum = Number(item.score).toLocaleString();
    const time = item.created_at ? item.created_at.slice(5, 16) : '';

    return `
      <div class="lb-item">
        ${rank}
        <span class="lb-name">${name}</span>
        <span class="lb-score">${scoreNum}</span>
        <span class="lb-date">${time}</span>
      </div>
    `;
  }).join('');
}

// ===== 提交分数 =====
async function submitScore() {
  const input = document.getElementById('playerNameInput');
  const name = input.value.trim() || '匿名';
  const btn = document.querySelector('.submit-btn');
  btn.disabled = true;
  btn.textContent = '⏳ 提交中...';

  try {
    const result = await GameAPI.submitScore(name, score, Math.floor(maxCombo / 3) + 1, GAME_TIME - timeLeft);
    showToast(`🎉 提交成功！排名第 ${result.rank} 名`);
    closeGameOver();
    setTimeout(() => {
      showLeaderboard();
      scrollToLeaderboard();
    }, 300);
  } catch {
    showToast('❌ 提交失败，请重试');
  }
  btn.disabled = false;
  btn.textContent = '🏆 提交成绩';
}

function scrollToLeaderboard() {
  // 排行榜弹窗已经显示
}

// =============================================
//  🚀 初始化
// =============================================

function initGame() {
  isGameOver = false;
  isProcessing = false;
  selectedTile = null;
  score = 0;
  combo = 0;
  maxCombo = 0;
  totalMatches = 0;
  movesLeft = MAX_MOVES;
  timeLeft = GAME_TIME;
  clearInterval(timerInterval);

  // 重置样式
  timerDisplay.style.color = '';
  timerDisplay.style.animation = '';
  movesDisplay.style.color = '';

  initBoard();

  // 如果初始化后没有可行操作，重新洗牌
  if (!hasValidMoves()) {
    shuffleBoard();
  }

  renderBoard();
  updateUI();
  closeGameOver();
  startTimer();
}

// ===== 工具 =====
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== 添加 shake 动画 =====
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-6px); }
    40% { transform: translateX(6px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;
document.head.appendChild(styleSheet);

// ===== 启动游戏 =====
initBackground();
document.addEventListener('DOMContentLoaded', () => {
  initGame();
});
