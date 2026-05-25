# Simone

**Simone** is an AI-powered lifestyle, wellness, scheduling, and budgeting assistant. It helps you plan your day, review purchases and calendar changes, stay on budget, and get personalized wellness guidance—from a polished, mobile-first experience built for demos and everyday use.

---

## What Simone Does

Simone works as a daily concierge:

- **Chat** with Simone to schedule events, queue orders, and adjust plans in natural language.
- **Approve or decline** schedule and shopping requests in a dedicated **Approvals** workflow.
- **Track** spending against monthly and category budgets on **Orders**.
- **Monitor** sleep, readiness, recovery, and lifestyle insights on **Home**.
- **Explore** different lifestyles via **multi-user demo personas** without manual database seeding.

If Supabase is not configured, Simone runs in **demo mode** with rich sample data so you can explore immediately.

---

## Core Features

- **AI schedule planning** — Chat-driven events; direct adds to Today’s Schedule or pending approval when needed
- **Smart approvals system** — Pending / Completed tabs; schedule, order, and budget-gated shopping flows
- **Budget tracking** — Weekly, monthly, and quarterly views; threshold alerts; cap updates at approve time
- **Order management** — Pending → approved orders by category (grocery, retail, other)
- **Wellness recommendations** — Insights, recovery metrics, Simone recommendations, and notifications
- **Dynamic Today’s Schedule** — Live “now” marker and priority-based event styling
- **Multi-user persona system** — Demo profiles (e.g. Jordan Ross, Kevin Zhang, Nicole Hart) with distinct lifestyles

---

## Current Project Status

### ✅ Working Features

- Conversational AI assistant interface
- Natural language chat interaction with Simone
- Grocery list generation based on:
  - wellness data
  - fitness goals
  - meal-prep requests
  - budgeting preferences
- AI-generated meal planning workflows
- Order generation flow from grocery recommendations
- Approval queue workflow for generated orders
- Frontend timeline and dashboard UI
- Mock user profiles and lifestyle simulation
- Health / readiness / sleep contextual logic
- React + TypeScript frontend architecture
- Python FastAPI backend integration
- API communication between frontend and backend
- Environment variable support for secure API keys
- Render deployment support
- GitHub collaborative workflow and version control

---

### ⚠️ Partially Working / In Progress

- Timeline auto-sync after AI creates calendar events
- Order page auto-population from live chat outputs
- Persistent database storage
- Real-time state synchronization across pages
- Authentication / user account system
- Full mobile optimization
- Advanced memory/context retention between sessions
- Error handling and fallback workflows
- Multi-user scalability testing

---

### 🚧 Planned / TBD Features

- Apple Health integration
- Calendar API integration
- Smart scheduling and automatic appointment booking
- Budget tracking and financial insights
- Real grocery ordering integrations
- Payment approval workflows
- Multi-agent orchestration system
- Long-term personalized AI memory
- Cross-platform integrations
- Voice interaction
- Push notifications
- Agent-to-agent ecosystem architecture
- Enterprise/team collaboration workflows

---

### Known Limitations

- Some workflows currently rely on mock/demo data
- Backend services may require manual restart during local development
- Certain frontend actions are not yet fully connected to persistent backend state
- Production-grade security and authentication are still under development
---

## Tech Stack

| Layer | Technologies |
|-------|----------------|
| **Frontend** | React 19, TypeScript, TanStack Router & Start, TanStack Query, Tailwind CSS 4, Radix UI, Lucide icons |
| **Backend (app)** | TanStack Start server functions (SSR); optional Cloudflare Workers (Wrangler) |
| **Backend (API)** | Python FastAPI + Uvicorn (optional helpers; e.g. Render deployment) |
| **APIs / services** | Supabase (auth & data), Agnic AI, Lovable AI Gateway |
| **Deployment** | Lovable / Cloudflare (frontend), Render (optional FastAPI backend) |

---

## Quick Start

### Prerequisites

- **Node.js** 20+ and **npm**
- **Python 3.10+** (only if running the optional FastAPI backend)

### Install dependencies

```bash
git clone https://github.com/kevina0817-ctrl/simone-ai-companion.git
cd simone-ai-companion
npm install
```

### Environment variables

```bash
cp .env.example .env
```

## Environment Variables

In the .env file in the backend directory, replace your_agnic_token_here with your real token:

AGNIC_TOKEN=your_agnic_token_here

You can obtain an AGNIC token from the AGNIC AI Gateway dashboard.

```bash
npm run dev
```

Open the URL shown in the terminal (typically **http://localhost:5173**). This runs the full TanStack Start app (frontend + server functions for chat and SSR).

### Optional: FastAPI backend

Only needed for the separate Python `/chat` service in `backend/`:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # set AGNIC_TOKEN=your_token_here
uvicorn main:app --reload --port 8000
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | For live auth/data | Supabase project URL (browser) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | For live auth/data | Supabase anon key |
| `SUPABASE_URL` | Server SSR | Same project URL (server) |
| `SUPABASE_PUBLISHABLE_KEY` | Server SSR | Anon key for auth middleware |
| `SUPABASE_SERVICE_ROLE_KEY` | Server writes | Service role key (**server only**) |
| `AGNIC_TOKEN` | For AI chat | Agnic API token |
| `LOVABLE_API_KEY` | Optional | Lovable AI Gateway fallback |
| `VITE_DEMO_PERSONA` | Optional | `jordan`, `kevin`, or `nicole` when in demo mode |

Full template: [`.env.example`](.env.example)

---

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

---

## Demo URL

**Demo URL:** https://simone-ai-companion.lovable.app

---

## Team & Roles

### Shanshan Ao

- Product ideation and business concept
- User scenarios and feature planning
- UI/UX design and frontend development
- Product management and project planning

### Mark Qian

- Backend development
- AI workflow and approval logic integration
- Frontend/backend integration
- System architecture and feature implementation

---

## Project Structure

```text
simone-ai-companion/
├── src/              # Routes, components, lib (budget, approvals, personas)
├── backend/          # Optional FastAPI service
├── .env.example      # Environment template (no secrets)
└── wrangler.jsonc    # Cloudflare Workers config
```

---

## Security Notes

- Never commit real API keys or `.env` files.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `AGNIC_TOKEN` on the server only.
- Browser code should only use `VITE_*` variables safe for the client.

---

## License

Private hackathon / demo project—see repository owner for usage terms.
