# AcertijoAI

Juego web de acertijos con IA (Gemini + Supabase + Node.js)

## Setup rapido

1. cd backend && npm install
2. cp .env.example .env  (rellena SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY)
3. Ejecuta database/schema.sql en el SQL Editor de Supabase
4. npm run dev
5. Abre frontend/index.html con Live Server (VS Code, puerto 5500)

## API Endpoints (todos bajo /api/)
POST auth/register | POST auth/login | POST auth/logout
POST riddle/generate | POST riddle/check-answer | POST riddle/hint | POST riddle/give-up
GET  history | GET history/stats
