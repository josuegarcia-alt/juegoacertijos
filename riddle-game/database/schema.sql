-- =============================================
-- RIDDLE GAME - SUPABASE DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- TABLE: users (extends Supabase auth.users)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  level INTEGER DEFAULT 1,
  total_score INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TABLE: games
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  riddle TEXT NOT NULL,
  answer TEXT NOT NULL,
  hints JSONB NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT 'general',
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  max_score INTEGER NOT NULL DEFAULT 200,
  current_score INTEGER NOT NULL DEFAULT 200,
  hints_used INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'lost')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- ─────────────────────────────────────────────
-- TABLE: attempts
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  answer_given TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_games_user_id ON public.games(user_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON public.games(status);
CREATE INDEX IF NOT EXISTS idx_attempts_game_id ON public.attempts(game_id);
CREATE INDEX IF NOT EXISTS idx_attempts_user_id ON public.attempts(user_id);

-- ─────────────────────────────────────────────
-- FUNCTION: update_user_stats (called after win)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_user_stats(p_user_id UUID, p_score INTEGER)
RETURNS VOID AS $$
DECLARE
  v_total_score INTEGER;
  v_games_played INTEGER;
  v_new_level INTEGER;
BEGIN
  UPDATE public.users
  SET
    total_score = total_score + p_score,
    games_played = games_played + 1,
    updated_at = NOW()
  WHERE id = p_user_id
  RETURNING total_score, games_played INTO v_total_score, v_games_played;

  -- Level up every 1000 points
  v_new_level := GREATEST(1, FLOOR(v_total_score / 1000) + 1);

  UPDATE public.users
  SET level = v_new_level
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- Games: users manage own games
CREATE POLICY "Users manage own games" ON public.games
  FOR ALL USING (auth.uid() = user_id);

-- Attempts: users manage own attempts
CREATE POLICY "Users manage own attempts" ON public.attempts
  FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- SAMPLE DATA (optional)
-- ─────────────────────────────────────────────
-- Note: Users must be created via Supabase Auth first.
-- INSERT INTO public.users (id, email, username) VALUES
--   ('your-auth-uuid', 'test@example.com', 'TestPlayer');
