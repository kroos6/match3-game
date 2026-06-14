const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// ===== SQLite (sql.js) =====
let db = null;

async function initDb() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const DB_PATH = path.join(__dirname, 'game.db');

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_name TEXT NOT NULL,
      score INTEGER NOT NULL,
      level INTEGER DEFAULT 1,
      duration INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', '+8 hours'))
    )
  `);
  saveDb();
  console.log('📦 数据库加载成功');
}

function saveDb() {
  const DB_PATH = path.join(__dirname, 'game.db');
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ===== API =====

// 提交分数
app.post('/api/scores', (req, res) => {
  try {
    const { playerName, score, level, duration } = req.body;
    if (!playerName || score == null) {
      return res.json({ success: false, error: '缺少参数' });
    }
    const name = playerName.trim().slice(0, 10) || '匿名';
    db.run(
      'INSERT INTO leaderboard (player_name, score, level, duration) VALUES (?, ?, ?, ?)',
      [name, Math.round(score), level || 1, duration || 0]
    );
    saveDb();

    // 返回排名
    const rank = queryOne(`
      SELECT COUNT(*) + 1 AS rank FROM leaderboard WHERE score > ?
    `, [Math.round(score)]);

    res.json({ success: true, data: { rank: rank ? rank.rank : 1 } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// 排行榜
app.get('/api/leaderboard', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const rows = queryAll(
      'SELECT id, player_name, score, level, duration, created_at FROM leaderboard ORDER BY score DESC LIMIT ?',
      [limit]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取最高分
app.get('/api/highscore', (req, res) => {
  try {
    const row = queryOne('SELECT MAX(score) AS high_score FROM leaderboard');
    res.json({ success: true, data: { highScore: row ? row.high_score : 0 } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 静态文件
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ===== 启动 =====
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`✨ 消消乐游戏已启动！`);
    console.log(`🖥️  游戏页面: http://localhost:${PORT}`);
    console.log(`📡 排行榜 API: http://localhost:${PORT}/api/leaderboard`);
  });
}).catch(err => {
  console.error('❌ 启动失败:', err);
  process.exit(1);
});
