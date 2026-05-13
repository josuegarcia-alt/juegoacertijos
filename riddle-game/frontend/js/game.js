// GAME MODULE
const Game = (() => {
  let state = {
    gameId: null, difficulty: 'easy', category: 'general',
    currentScore: 0, attempts: 0, hintsUsed: 0,
    timerEnabled: false, timerInterval: null, timeLeft: 60, active: false
  };

  const showLoader = (msg='La IA esta pensando...') => {
    document.getElementById('loader-msg').textContent = msg;
    document.getElementById('global-loader').style.display = 'flex';
  };
  const hideLoader = () => { document.getElementById('global-loader').style.display = 'none'; };

  const toast = (msg, duration=2500) => {
    const el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), duration);
  };

  const showFeedback = (msg, type='info') => {
    const box = document.getElementById('feedback-box');
    box.className = 'feedback-box ' + type;
    box.textContent = msg; box.style.display = 'block';
  };
  const hideFeedback = () => { document.getElementById('feedback-box').style.display = 'none'; };

  const animateScore = (from, to, el) => {
    const diff = to - from; const steps = 20; let step = 0;
    const iv = setInterval(() => {
      step++; el.textContent = Math.round(from + (diff * step / steps));
      if (step >= steps) { clearInterval(iv); el.textContent = to; }
    }, 25);
  };

  const startTimer = () => {
    state.timeLeft = 60;
    const tc = document.getElementById('timer-container');
    const tt = document.getElementById('timer-text');
    const circle = document.getElementById('timer-circle');
    const C = 125.66;
    tc.style.display = 'flex';
    state.timerInterval = setInterval(async () => {
      state.timeLeft--;
      tt.textContent = state.timeLeft;
      circle.style.strokeDashoffset = C - (state.timeLeft / 60) * C;
      if (state.timeLeft <= 10) { circle.style.stroke = '#ef4444'; tt.style.color = '#ef4444'; }
      if (state.timeLeft <= 0) { clearInterval(state.timerInterval); await giveUp(true); }
    }, 1000);
  };

  const stopTimer = () => {
    if (state.timerInterval) clearInterval(state.timerInterval);
    document.getElementById('timer-container').style.display = 'none';
  };

  const getCategoryEmoji = (cat) => {
    const map = { general:'🎲', animals:'🐾', nature:'🌿', history:'⚔️', science:'🔬', objects:'🪄' };
    return map[cat] || '🎲';
  };

  const generateRiddle = async () => {
    showLoader('La IA esta creando tu acertijo...');
    hideFeedback();
    document.getElementById('hints-container').innerHTML = '';
    document.getElementById('result-panel').style.display = 'none';
    document.getElementById('answer-input').value = '';
    try {
      const data = await Auth.apiFetch('/riddle/generate', {
        method: 'POST',
        body: JSON.stringify({ difficulty: state.difficulty, category: state.category })
      });
      state.gameId = data.gameId; state.currentScore = data.maxScore;
      state.attempts = 0; state.hintsUsed = 0; state.active = true;
      document.getElementById('riddle-text').textContent = data.riddle;
      document.getElementById('riddle-category').textContent = getCategoryEmoji(data.category) + ' ' + data.category;
      document.getElementById('current-score').textContent = data.maxScore;
      document.getElementById('attempt-count').textContent = '0';
      document.getElementById('hints-count').textContent = '3';
      document.getElementById('difficulty-badge').textContent = data.difficulty.toUpperCase();
      ['answer-input','btn-submit','btn-hint','btn-giveup'].forEach(id => { document.getElementById(id).disabled = false; });
      document.getElementById('setup-panel').style.display = 'none';
      document.getElementById('game-panel').style.display = 'block';
      if (state.timerEnabled) startTimer();
      document.getElementById('answer-input').focus();
    } catch(err) { toast('Error al generar: ' + err.message); }
    finally { hideLoader(); }
  };

  const checkAnswer = async () => {
    const input = document.getElementById('answer-input');
    const answer = input.value.trim();
    if (!answer) { toast('Escribe una respuesta primero'); return; }
    if (!state.gameId || !state.active) return;
    document.getElementById('btn-submit').disabled = true;
    showLoader('Evaluando tu respuesta...');
    try {
      const data = await Auth.apiFetch('/riddle/check-answer', {
        method: 'POST', body: JSON.stringify({ gameId: state.gameId, userAnswer: answer })
      });
      hideFeedback();
      if (data.correct) { stopTimer(); state.active = false; showResult(true, data); }
      else {
        state.attempts++;
        animateScore(state.currentScore, data.currentScore, document.getElementById('current-score'));
        state.currentScore = data.currentScore;
        document.getElementById('attempt-count').textContent = state.attempts;
        showFeedback('❌ ' + data.feedback, 'error');
        input.value = ''; input.focus();
        document.getElementById('btn-submit').disabled = false;
        if (state.attempts >= 5) await giveUp(false);
      }
    } catch(err) { showFeedback('Error: ' + err.message, 'error'); document.getElementById('btn-submit').disabled = false; }
    finally { hideLoader(); }
  };

  const getHint = async () => {
    if (!state.gameId || !state.active) return;
    showLoader('Generando pista...');
    try {
      const data = await Auth.apiFetch('/riddle/hint', { method: 'POST', body: JSON.stringify({ gameId: state.gameId }) });
      if (!data.hint) { toast('No quedan mas pistas 🤷'); return; }
      state.hintsUsed++;
      animateScore(state.currentScore, data.currentScore, document.getElementById('current-score'));
      state.currentScore = data.currentScore;
      document.getElementById('hints-count').textContent = data.hintsRemaining;
      const hintEl = document.createElement('div');
      hintEl.className = 'hint-item';
      hintEl.innerHTML = '<span class="hint-num">Pista ' + data.hintNumber + '</span><span class="hint-text">' + data.hint + '</span>';
      document.getElementById('hints-container').appendChild(hintEl);
      if (data.hintsRemaining === 0) document.getElementById('btn-hint').disabled = true;
    } catch(err) { toast('Error al obtener pista: ' + err.message); }
    finally { hideLoader(); }
  };

  const giveUp = async (timedOut=false) => {
    if (!state.gameId) return;
    stopTimer(); state.active = false;
    try {
      const data = await Auth.apiFetch('/riddle/give-up', { method: 'POST', body: JSON.stringify({ gameId: state.gameId }) });
      showResult(false, { answer: data.answer, timedOut });
    } catch(err) { toast('Error: ' + err.message); }
  };

  const showResult = (won, data) => {
    ['answer-input','btn-submit','btn-hint','btn-giveup'].forEach(id => { document.getElementById(id).disabled = true; });
    hideFeedback();
    const panel = document.getElementById('result-panel');
    const icon = document.getElementById('result-icon');
    const title = document.getElementById('result-title');
    const msg = document.getElementById('result-message');
    const scoreVal = document.getElementById('result-score-value');
    if (won) {
      icon.textContent = '🎉'; title.textContent = '¡Correcto!';
      msg.textContent = data.feedback + ' Has usado ' + state.attempts + ' intento(s) y ' + state.hintsUsed + ' pista(s).';
      scoreVal.textContent = state.currentScore;
    } else if (data.timedOut) {
      icon.textContent = '⏰'; title.textContent = '¡Tiempo agotado!';
      msg.textContent = `La respuesta era: ${data.answer}. ¡Inténtalo de nuevo!`;
      scoreVal.textContent = '0';
    } else {
      icon.textContent = '😔'; title.textContent = 'Sin mas intentos';
      msg.textContent = `La respuesta era: ${data.answer}. ¡Sigue practicando!`;
      scoreVal.textContent = '0';
    }
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const setDifficulty = (v) => { state.difficulty = v; };
  const setCategory   = (v) => { state.category   = v; };
  const setTimer      = (v) => { state.timerEnabled = v; };

  const resetToSetup = () => {
    stopTimer();
    document.getElementById('game-panel').style.display  = 'none';
    document.getElementById('setup-panel').style.display = 'block';
    state.gameId = null; state.active = false;
  };

  return { generateRiddle, checkAnswer, getHint, giveUp, resetToSetup, setDifficulty, setCategory, setTimer, toast };
})();