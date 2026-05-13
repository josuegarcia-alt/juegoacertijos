document.addEventListener('DOMContentLoaded', () => {
  if (Auth.isLoggedIn()) showGameScreen();
  else showAuthScreen();

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab + '-form').classList.add('active');
    });
  });

  document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';
    if (!email || !password) { errEl.textContent = 'Rellena todos los campos'; return; }
    const btn = document.getElementById('btn-login');
    btn.disabled = true; btn.textContent = 'Entrando...';
    try { showGameScreen(await Auth.login(email, password)); }
    catch(err) { errEl.textContent = err.message; }
    finally { btn.disabled = false; btn.textContent = 'Entrar'; }
  });

  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-login').click();
  });

  document.getElementById('btn-register').addEventListener('click', async () => {
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const errEl = document.getElementById('register-error');
    errEl.textContent = '';
    if (!username || !email || !password) { errEl.textContent = 'Rellena todos los campos'; return; }
    if (password.length < 6) { errEl.textContent = 'La contrasena debe tener al menos 6 caracteres'; return; }
    const btn = document.getElementById('btn-register');
    btn.disabled = true; btn.textContent = 'Creando cuenta...';
    try { showGameScreen(await Auth.register(username, email, password)); }
    catch(err) { errEl.textContent = err.message; }
    finally { btn.disabled = false; btn.textContent = 'Crear cuenta'; }
  });

  document.getElementById('btn-logout').addEventListener('click', async () => { await Auth.logout(); showAuthScreen(); });
  document.getElementById('btn-generate').addEventListener('click', () => Game.generateRiddle());
  document.getElementById('btn-submit').addEventListener('click', () => Game.checkAnswer());
  document.getElementById('answer-input').addEventListener('keydown', e => { if (e.key === 'Enter') Game.checkAnswer(); });
  document.getElementById('btn-hint').addEventListener('click', () => Game.getHint());
  document.getElementById('btn-giveup').addEventListener('click', () => { if (confirm('Seguro que quieres rendirte?')) Game.giveUp(false); });
  document.getElementById('btn-new-riddle').addEventListener('click', () => Game.resetToSetup());

  document.getElementById('difficulty-group').addEventListener('click', e => {
    const btn = e.target.closest('.option-btn'); if (!btn) return;
    document.querySelectorAll('#difficulty-group .option-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); Game.setDifficulty(btn.dataset.value);
  });

  document.getElementById('category-group').addEventListener('click', e => {
    const btn = e.target.closest('.option-btn'); if (!btn) return;
    document.querySelectorAll('#category-group .option-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); Game.setCategory(btn.dataset.value);
  });

  document.getElementById('timer-toggle').addEventListener('change', e => Game.setTimer(e.target.checked));
  document.getElementById('btn-history').addEventListener('click', showHistoryPanel);
  document.getElementById('btn-back-game').addEventListener('click', () => {
    document.getElementById('history-panel').style.display = 'none';
    document.getElementById('setup-panel').style.display = 'block';
  });

  async function showHistoryPanel() {
    document.getElementById('setup-panel').style.display = 'none';
    document.getElementById('game-panel').style.display  = 'none';
    document.getElementById('history-panel').style.display = 'block';
    const list = document.getElementById('history-list');
    list.innerHTML = '<div class=loading-spinner>Cargando...</div>';
    try {
      const [h, s] = await Promise.all([ Auth.apiFetch('/history'), Auth.apiFetch('/history/stats') ]);
      document.getElementById('stat-total').textContent   = s.games_played || 0;
      document.getElementById('stat-score').textContent   = s.total_score  || 0;
      document.getElementById('stat-winrate').textContent = (s.winRate || 0) + '%';
      document.getElementById('stat-level').textContent   = s.level || 1;
      if (!h.games || !h.games.length) { list.innerHTML = '<div class=loading-spinner>No hay partidas aun.</div>'; return; }
      list.innerHTML = h.games.map(g => {
        const icon = g.status === 'won' ? 'pass' : 'fail';
        const date = new Date(g.created_at).toLocaleDateString('es-ES');
        const statusIcon = g.status === 'won' ? '&#x2705;' : '&#x274C;';
        return '<div class=history-item><span class=history-status>' + statusIcon + '</span>'
          + '<div class=history-info><div class=history-riddle>' + g.riddle + '</div>'
          + '<div class=history-meta>' + g.difficulty + ' * ' + g.category + ' * ' + date + ' * ' + g.attempts + ' intentos</div>'
          + '</div><span class=history-score>' + g.current_score + '</span></div>';
      }).join('');
    } catch(err) {
      list.innerHTML = '<div style=color:#ef4444>Error: ' + err.message + '</div>';
    }
  }

  function showAuthScreen() {
    document.getElementById('auth-screen').classList.add('active');
    document.getElementById('game-screen').classList.remove('active');
  }

  function showGameScreen(user) {
    const u = user || Auth.getUser();
    if (u) {
      document.getElementById('player-name').textContent  = u.username || u.email;
      document.getElementById('player-level').textContent = 'Nv.1';
    }
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
  }
});
