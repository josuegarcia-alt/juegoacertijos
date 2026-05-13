const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const SCORES = { easy: 100, medium: 200, hard: 300 };
const HINT_PENALTY = 20;
const WRONG_PENALTY = 30;

// Cadena de modelos: si el primero da 429, prueba el siguiente
const MODEL_FALLBACK = [
  'gemma-4-26b-a4b-it',   // Gemma 4 MoE — cuota más generosa
  'gemma-4-31b-it',        // Gemma 4 dense — fallback
  'gemini-2.0-flash',      // Gemini — último recurso
];

// Espera N milisegundos
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Wrapper que intenta generar contenido con fallback y retry en 429
const generateWithFallback = async (prompt) => {
  let lastError;
  for (const modelName of MODEL_FALLBACK) {
    // Cada modelo tiene 2 intentos con espera entre ellos (por si es límite por minuto)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await ai.models.generateContent({
          model: modelName,
          contents: prompt
        });
        return result.text.trim();
      } catch (err) {
        if (err.status === 429) {
          lastError = err;
          if (attempt === 1) {
            console.warn(`Quota en ${modelName}, esperando 10s...`);
            await sleep(10000); // espera 10s y reintenta el mismo modelo
          } else {
            console.warn(`Quota en ${modelName} tras reintento, probando siguiente...`);
          }
        } else if (err.status === 404) {
          console.warn(`Modelo ${modelName} no disponible en esta API, probando siguiente...`);
          lastError = err;
          break; // no reintentar si el modelo no existe
        } else {
          throw err;
        }
      }
    }
  }
  const retryAfter = lastError?.errorDetails?.find(d => d['@type']?.includes('RetryInfo'))?.retryDelay || '60s';
  const err = new Error(`Límite de peticiones de Gemini alcanzado. Inténtalo en ${retryAfter}.`);
  err.isQuotaError = true;
  throw err;
};

// POST /api/riddle/generate
router.post('/generate', authMiddleware, async (req, res) => {
  const { difficulty = 'medium', category = 'general' } = req.body;

  const prompt = `Eres un maestro de acertijos. Genera un acertijo creativo en ESPAÑOL siguiendo estas reglas:
- Dificultad: ${difficulty}
- Categoría: ${category}
- Usa el formato clásico "Soy..." o de pregunta, siempre en español
- Proporciona EXACTAMENTE 3 pistas progresivas en español (de vaga a específica)
- La respuesta debe ser de 1 a 3 palabras en español

Responde ÚNICAMENTE con este JSON exacto (sin markdown, sin texto extra):
{
  "riddle": "El texto completo del acertijo aquí",
  "answer": "la respuesta en minúsculas",
  "hints": [
    "Primera pista vaga",
    "Segunda pista más específica",
    "Tercera pista muy específica"
  ],
  "category": "${category}",
  "difficulty": "${difficulty}"
}`;

  try {
    const text = await generateWithFallback(prompt);
    const cleaned = text.replace(/^```json\n?|^```\n?|```$/gm, '').trim();
    const riddleData = JSON.parse(cleaned);

    if (!riddleData.riddle || !riddleData.answer || !Array.isArray(riddleData.hints)) {
      throw new Error('Invalid riddle structure from AI');
    }

    const gameId = uuidv4();
    const maxScore = SCORES[difficulty] || 200;

    const { error: dbError } = await supabase.from('games').insert({
      id: gameId,
      user_id: req.user.id,
      riddle: riddleData.riddle,
      answer: riddleData.answer.toLowerCase().trim(),
      hints: riddleData.hints,
      category: riddleData.category,
      difficulty: riddleData.difficulty,
      max_score: maxScore,
      current_score: maxScore,
      hints_used: 0,
      attempts: 0,
      status: 'active'
    });

    if (dbError) throw dbError;

    res.json({
      gameId,
      riddle: riddleData.riddle,
      category: riddleData.category,
      difficulty: riddleData.difficulty,
      maxScore
    });
  } catch (err) {
    console.error('Generate riddle error:', err.message);
    if (err.isQuotaError) {
      return res.status(429).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to generate riddle: ' + err.message });
  }
});

// POST /api/riddle/check-answer
router.post('/check-answer', authMiddleware, async (req, res) => {
  const { gameId, userAnswer } = req.body;

  if (!gameId || !userAnswer) {
    return res.status(400).json({ error: 'gameId and userAnswer are required' });
  }

  try {
    const { data: game, error } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !game) return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'active') return res.status(400).json({ error: 'Game is already finished' });

    await supabase.from('attempts').insert({
      game_id: gameId,
      user_id: req.user.id,
      answer_given: userAnswer.toLowerCase().trim()
    });

    const normalizedUser = userAnswer.toLowerCase().trim();
    const normalizedAnswer = game.answer.toLowerCase().trim();

    // Comparación directa normalizada — sin IA, más rápido y fiable
    const normalize = (s) => s.toLowerCase().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
      .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');

    const userNorm   = normalize(normalizedUser);
    const answerNorm = normalize(normalizedAnswer);

    const isCorrect = userNorm === answerNorm ||
      answerNorm.includes(userNorm) ||
      userNorm.includes(answerNorm);

    const evaluation = {
      correct: isCorrect,
      feedback: isCorrect
        ? `¡Correcto! La respuesta era "${game.answer}".`
        : `Incorrecto, sigue intentándolo.`
    };

    const newAttempts = game.attempts + 1;
    let newScore = Math.max(0, game.current_score - WRONG_PENALTY);

    if (evaluation.correct) {
      await supabase.from('games').update({
        status: 'won',
        attempts: newAttempts,
        current_score: game.current_score,
        finished_at: new Date().toISOString()
      }).eq('id', gameId);

      await supabase.rpc('update_user_stats', {
        p_user_id: req.user.id,
        p_score: game.current_score
      });

      return res.json({
        correct: true,
        feedback: evaluation.feedback,
        score: game.current_score,
        attempts: newAttempts,
        answer: game.answer
      });
    } else {
      await supabase.from('games').update({
        attempts: newAttempts,
        current_score: newScore
      }).eq('id', gameId);

      return res.json({
        correct: false,
        feedback: evaluation.feedback,
        attemptsLeft: Math.max(0, 5 - newAttempts),
        currentScore: newScore
      });
    }
  } catch (err) {
    console.error('Check answer error:', err.message);
    if (err.isQuotaError) {
      return res.status(429).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to check answer: ' + err.message });
  }
});

// POST /api/riddle/hint
router.post('/hint', authMiddleware, async (req, res) => {
  const { gameId } = req.body;

  if (!gameId) return res.status(400).json({ error: 'gameId is required' });

  try {
    const { data: game, error } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !game) return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'active') return res.status(400).json({ error: 'Game is already finished' });

    const hintsUsed = game.hints_used;
    const allHints = game.hints;

    if (hintsUsed >= allHints.length) {
      return res.json({
        hint: null,
        message: 'No more hints available',
        hintsUsed,
        totalHints: allHints.length
      });
    }

    const newScore = Math.max(0, game.current_score - HINT_PENALTY);

    await supabase.from('games').update({
      hints_used: hintsUsed + 1,
      current_score: newScore
    }).eq('id', gameId);

    res.json({
      hint: allHints[hintsUsed],
      hintNumber: hintsUsed + 1,
      hintsRemaining: allHints.length - (hintsUsed + 1),
      currentScore: newScore
    });
  } catch (err) {
    console.error('Hint error:', err.message);
    res.status(500).json({ error: 'Failed to get hint: ' + err.message });
  }
});

// POST /api/riddle/give-up
router.post('/give-up', authMiddleware, async (req, res) => {
  const { gameId } = req.body;

  try {
    const { data: game, error } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !game) return res.status(404).json({ error: 'Game not found' });

    await supabase.from('games').update({
      status: 'lost',
      current_score: 0,
      finished_at: new Date().toISOString()
    }).eq('id', gameId);

    res.json({ answer: game.answer, message: 'Better luck next time!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;