# Simone: An Autonomous AI Companion That Orchestrates Your Life  

**Track:** The One Last Mile

## One-Paragraph Pitch

Simone is an AI life companion that understands your schedule, energy, household needs, routines, and boundaries, then helps orchestrate life before everyday logistics become manual work. It gives users time back by noticing what needs to happen, preparing the next step while knowing when to ask for approval. In this prototype, Simone coordinates scheduling, budget-setting, approvals as one connected intelligent experience. The larger vision is a privacy-first companion layer that can connect to real-life data, act across services, and eventually let each user's Simone coordinate with others' Simones to handle shared plans and logistics.

---
## Demo URL

**Demo URL:** https://simone-ai-companion.lovable.app

---

## Core Features

- **Monitor wellness signals** - Track sleep, readiness, recovery, lifestyle context, and daily health patterns
- **Wellness recommendations** - Receive personalized recommendations based on routines, goals, and current context
- **Chat with Simone** - Plan, adjust, and coordinate life logistics through natural language
- **Track budgets and spending** - Review monthly and category budgets, spending thresholds, and financial insights
- **Make orders** - Generate grocery and household order plans from wellness, schedule, and budget context
- **Schedule events** - Create calendar events, update timelines, and coordinate smart scheduling workflows
- **Approve medium/high-risk actions** - Review schedule, order, budget, and payment approval requests before they happen

---

## Current Project Status

### Working Features

- Conversational AI companion interface
- Grocery list generation based on:
  - meal-prep requests
  - budgeting preferences
- AI-generated meal planning workflows
- Order generation flow from grocery recommendations
- Approval queue workflow for generated orders
- Payment approval workflows
- Frontend timeline and dashboard UI
- Timeline auto-sync after AI creates calendar events
- Order page auto-population from live chat outputs
- Authentication / user account system
- Error handling and fallback workflows
- Smart scheduling and automatic appointment booking
- Budget tracking and financial insights
- Health / readiness / sleep contextual logic
- React + TypeScript frontend architecture
- Python FastAPI backend integration
- API communication between frontend and backend
- Environment variable support for secure API keys
- Render deployment support
- GitHub collaborative workflow and version control

---

### Planned / TBD Features
- Apple Health integration
- Calendar API integration
- Real grocery ordering integrations
- Long-term personalized AI memory and messaging
- Cross-platform integrations
- Voice interaction
- Push notifications
- Agent-to-agent ecosystem architecture

---

### Known Limitations

- Workflows currently rely on backend demo data
- Production-grade security and authentication are still under development
---

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 19, TypeScript, TanStack Router & Start, TanStack Query, Tailwind CSS 4, Radix UI, Lucide icons |
| **Backend (app)** | TanStack Start server functions (SSR); optional Cloudflare Workers (Wrangler) |
| **Backend (API)** | Python FastAPI + Uvicorn (optional helpers; e.g. Render deployment) |
| **APIs / services** | Supabase (auth & data), Agnic AI, Lovable AI Gateway |
| **Deployment** | Lovable / Cloudflare (frontend), Render (optional FastAPI backend) |

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

In the `.env` file in the backend directory, replace `your_agnic_token_here` with your real token:

```bash
AGNIC_TOKEN=your_agnic_token_here
```

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

## Project Structure

```text
simone-ai-companion/
|-- src/              # Routes, components, lib (budget, approvals, scheduling)
|-- backend/          # Optional FastAPI service
|-- .env.example      # Environment template (no secrets)
`-- wrangler.jsonc    # Cloudflare Workers config
```

---

## Security Notes

- Never commit real API keys or `.env` files.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `AGNIC_TOKEN` on the server only.
- Browser code should only use `VITE_*` variables safe for the client.

---

## License

This is a hackathon and demo project. See the repository owner for usage terms.
