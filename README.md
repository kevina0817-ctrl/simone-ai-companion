# Simone AI Companion

Simone is a mobile-first AI life assistant that helps you balance wellness, schedule, shopping, and daily decisions. A calm concierge chat sits at the center; generated grocery lists, budget-aware guidance, and human-in-the-loop approvals connect chat to real-world actions.

---

## Project overview

**Simone AI Companion** adapts your day around sleep, readiness, and calendar context. You can:

- Chat with **Simone**, a perceptive AI concierge that understands your schedule and wellness signals
- Request **grocery lists** and meal-oriented shopping suggestions
- Get **budget-aware** recommendations tied to spending categories on the Orders experience
- Review **pending approvals** before calendar changes, reorders, or budget adjustments go through

The app pairs a modern full-stack web frontend with an optional **FastAPI** service for legacy or standalone AI endpoints, and uses **AGNIC** (or Lovable AI Gateway) for language-model capabilities.

---

## Features

| Area | Description |
|------|-------------|
| **Concierge AI chat** | Natural-language assistant with context from wellness data, upcoming events, and chat history. Supports scheduling and canceling events via AI tools. |
| **Grocery list generation** | Ask Simone for groceries or meal-plan ingredients; lists can be reflected on the Orders experience for review. |
| **Budget-aware recommendations** | Monthly/weekly budget targets and category caps on the Orders and Budget screens to keep spending visible. |
| **Pending approval workflow** | Approvals queue for calendar moves, grocery budget overages, and similar actions before they are applied. |
| **Home dashboard** | Sleep/readiness rings, today’s schedule, and quick access to concierge chat. |
| **Architecture** | **Frontend:** React 19, TanStack Start/Router, Vite, Tailwind, Supabase Auth. **Backend:** FastAPI (Python) on Render for `/chat` and health mock data. **Data:** Supabase Postgres with row-level security. **Deploy:** Cloudflare Workers (frontend build) + Render (API). |

---

## Tech stack

| Layer | Technologies |
|-------|----------------|
| **Frontend** | React 19, Vite 7, TanStack Start & Router, TanStack Query, Tailwind CSS 4, Radix UI / shadcn-style components |
| **Backend (API)** | FastAPI, Uvicorn, Pydantic, `requests` |
| **Language** | TypeScript (app), Python 3.11+ (API) |
| **AI** | [AGNIC](https://agnic.ai) (`AGNIC_TOKEN`), Lovable AI Gateway fallback (`LOVABLE_API_KEY`) |
| **Database & auth** | Supabase (Postgres, Auth, RLS) |
| **Deployment** | Render (`simone-backend`), Cloudflare Workers / Lovable Cloud (frontend) |

---

## Local development setup

Prerequisites: **Node.js 20+**, **npm**, **Python 3.11+**, and a **Supabase** project (or use demo mode without Supabase env vars).

### 1. Clone and install frontend

```bash
git clone https://github.com/kevina0817-ctrl/simone-ai-companion.git
cd simone-ai-companion
npm install
```

### 2. Python backend (optional, for FastAPI `/chat`)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Environment files

Create env files from the examples (see [Environment variables](#environment-variables)):

```bash
cp .env.example .env.local
cp backend/.env.example backend/.env
```

Edit both files with your keys (no real secrets in git).

### 4. Run the app

**Terminal A — frontend**

```bash
npm run dev
```

Opens the app (default Vite port, often `5173`).

**Terminal B — backend (optional)**

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

With `.env.local` configured, the legacy API client targets `http://127.0.0.1:8000` in development. Primary chat flows through TanStack **server functions** and Supabase when `VITE_SUPABASE_*` variables are set.

---

## Environment variables

| File | Purpose |
|------|---------|
| **`backend/.env`** | FastAPI: `AGNIC_TOKEN` (required for `/chat`) |
| **`.env.local`** | Local dev: Supabase, `AGNIC_TOKEN`, `VITE_BACKEND_URL`, optional `LOVABLE_API_KEY` |
| **`.env.production`** | Production build: `VITE_BACKEND_URL` → Render API (committed) |
| **`.env`** | Shared defaults (e.g. Supabase); do not commit secrets |

Restart `npm run dev` after changing env files.

### `.env.example` (project root)

```env
# Supabase (required for full app; omit both VITE_* vars to use demo mode)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-anon-key

# AI — server functions (copy AGNIC_TOKEN from backend/.env or use Lovable Cloud)
AGNIC_TOKEN=your_agnic_token
# LOVABLE_API_KEY=your_lovable_key

# FastAPI client (npm run dev)
VITE_BACKEND_URL=http://127.0.0.1:8000
```

### `backend/.env.example`

```env
AGNIC_TOKEN=your_agnic_token
```

---

## Demo URLs

| Service | URL |
|---------|-----|
| **Frontend (production)** | `https://your-frontend-url.example` |
| **Backend API (Render)** | `https://simone-backend.onrender.com` |
| **API health** | `https://simone-backend.onrender.com/` |

Replace the frontend placeholder with your deployed Lovable / Cloudflare URL when available.

---

## Team and roles

| Role | Responsibility | Contact / owner |
|------|----------------|-----------------|
| **Frontend** | TanStack app, UI, Supabase client, server functions | _@your-frontend-lead_ |
| **Backend** | FastAPI, mock health data, Render service | _@your-backend-lead_ |
| **AI integration** | AGNIC / Lovable gateway, prompts, tool calling | _@your-ai-lead_ |
| **Deployment** | Render, Cloudflare Workers, env & secrets | _@your-devops-lead_ |

---

## Future roadmap

- **Real grocery ordering** — Place orders with partner retailers from approved lists
- **Calendar integration** — Sync with Google Calendar / Apple Calendar
- **Health data integration** — Oura, Apple Health, or similar for live wellness scores
- **AI agent orchestration** — Multi-step agents for shopping, scheduling, and approvals in one flow

---

## Scripts reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build (Cloudflare / static output) |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |
| `uvicorn main:app --reload --host 127.0.0.1 --port 8000` | Run FastAPI locally (`backend/`) |

---

## License

Private project — see repository owner for usage terms.
