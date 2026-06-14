// ===== API 请求封装 =====
const API_BASE = '/api';

async function apiPost(endpoint, data) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (json.success) return json.data;
    throw new Error(json.error || '请求失败');
  } catch (err) {
    console.error('API POST 错误:', err);
    throw err;
  }
}

async function apiGet(endpoint) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`);
    const json = await res.json();
    if (json.success) return json.data;
    throw new Error(json.error || '请求失败');
  } catch (err) {
    console.error('API GET 错误:', err);
    throw err;
  }
}

// ===== 游戏 API =====
const GameAPI = {
  // 提交分数
  submitScore: (playerName, score, level, duration) =>
    apiPost('/scores', { playerName, score, level, duration }),

  // 获取排行榜
  getLeaderboard: (limit = 50) =>
    apiGet(`/leaderboard?limit=${limit}`),

  // 获取最高分
  getHighScore: () =>
    apiGet('/highscore'),
};
