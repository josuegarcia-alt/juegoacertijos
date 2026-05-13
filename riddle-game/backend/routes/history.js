const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const authMiddleware = require('../middleware/auth');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// GET /api/history
router.get('/', authMiddleware, async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const { data: games, error, count } = await supabase
      .from('games')
      .select('id, riddle, category, difficulty, current_score, max_score, status, attempts, hints_used, created_at, finished_at', { count: 'exact' })
      .eq('user_id', req.user.id)
      .neq('status', 'active')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      games,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/history/stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('username, level, total_score, games_played')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;

    // Calculate win rate
    const { count: wonCount } = await supabase
      .from('games')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('status', 'won');

    const winRate = user.games_played > 0
      ? Math.round((wonCount / user.games_played) * 100)
      : 0;

    res.json({ ...user, winRate, gamesWon: wonCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
