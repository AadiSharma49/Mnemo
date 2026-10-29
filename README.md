# Mnemo

**A memory layer for your AI conversations.** Mnemo captures your ChatGPT,
Claude and Gemini chats, uses AI to extract the **decisions**, **action items**
and **open questions** inside them, and makes them searchable by meaning — so the
reasoning you produce with AI doesn't vanish the moment you close the tab.

It also connects to AI coding tools (Claude Code, Cursor) over the **Model
Context Protocol**, so your assistant can read your past decisions while you work.

---

## Features

- **One-click capture** — a Chrome/Edge extension captures the open conversation
  on ChatGPT, Claude or Gemini and sends it to Mnemo. No copy-paste.
- **AI extraction** — each conversation is turned into structured decisions,
  action items and questions (Google Gemini).
- **Semantic search** — find decisions by meaning, not keywords, via pgvector
  embeddings (`text-embedding-004`, 768-dim, HNSW cosine index).
- **Memory Chat** — ask questions about a workspace and get answers grounded in
  your stored decisions.
- **Conflict detection** — flags when a new decision contradicts an older one
  (pgvector shortlist → LLM judge).
- **MCP server** — a zero-dependency stdio server that exposes your decisions to
  Claude Code, Cursor, Windsurf, VS Code and other MCP clients.
- **Import** — bulk-import your existing ChatGPT/Claude export files.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4, Framer Motion |
| Auth | Clerk |
| Database | PostgreSQL (Neon) + Prisma ORM |
| Vectors | pgvector (HNSW, cosine) |
| AI | Google Gemini (`gemini-2.5-flash`, `text-embedding-004`) |
| Integrations | Chrome extension (MV3), MCP server (stdio JSON-RPC) |

---

## Architecture at a glance

```
Capture ─────────────► Extract ────────► Store ──────► Index ───────► Retrieve
(extension /            (Gemini via       (Prisma /     (pgvector      (semantic search,
 import / paste)         provider layer)    Postgres)     embeddings)    Memory Chat, MCP)
```

- **Provider abstraction** — `src/lib/ai/providers/` defines an `AIProvider`
  interface and a registry factory selected by the `AI_PROVIDER` env var. Gemini
  is the implemented provider; the layer is built so more can be added.
- **Multi-user isolation** — every query is scoped by `userId`, and mutations
  verify ownership (`where: { id, userId }`) before writing. Clerk users are
  mapped to Postgres `User` records via `getOrCreateUser()`.

---

## Getting started

### Prerequisites
- **Node.js 18+**
- A **PostgreSQL** database with the **pgvector** extension available (e.g. [Neon](https://neon.tech))
- A **[Clerk](https://clerk.com)** application (publishable + secret keys)
- A **[Google Gemini](https://aistudio.google.com/app/apikey)** API key

### 1. Install
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
Fill in `.env` with your own values (see [`.env.example`](.env.example)). At
minimum you need `DATABASE_URL`, both Clerk keys, and `GEMINI_API_KEY`.

### 3. Set up the database
```bash
npx prisma generate               # generate the Prisma client
npx prisma db push                # create the tables
node scripts/setup-vector.mjs     # enable pgvector + embedding column + HNSW index
```
> `scripts/setup-vector.mjs` is required for semantic search and conflict
> detection — it enables the `vector` extension and creates the index that
> Prisma can't manage directly.

### 4. Run
```bash
npm run dev                       # http://localhost:3000
```

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Start the production server |
| `npm run lint` | Lint |
| `node scripts/setup-vector.mjs` | Enable pgvector + create the embedding index |

---

## Project structure

```
src/
  app/
    api/             # Route handlers (CRUD, extract, memory-chat, mcp, conflicts, …)
    dashboard/       # Authenticated app (workspaces, search, conflicts, import, …)
    page.tsx         # Landing page
  components/
    landing/         # Landing sections (hero, features, how-it-works, MCP, …)
    dashboard/       # Dashboard shell, sidebar, header
    ui/              # Shared UI primitives
  lib/
    ai/              # Extraction, embeddings, conflict judge, provider abstraction
    conflicts/       # Conflict scan (pgvector + LLM)
    search/          # Semantic search over decisions
    api-auth.ts      # API-key hashing + CORS (extension & MCP)
    api-utils.ts     # Clerk → Postgres user mapping, ownership helpers
prisma/schema.prisma # Data model
extension/           # Chrome/Edge browser extension (Manifest V3)
mcp-server/          # Standalone MCP server + client setup docs
scripts/             # One-off setup scripts (pgvector)
```

---

## Browser extension

The extension in [`extension/`](extension/) is a self-contained Manifest V3
build (no bundler). See [`extension/README.md`](extension/README.md) to load it
and [`extension/PUBLISHING.md`](extension/PUBLISHING.md) for distribution. It
authenticates with a personal API key generated in **Settings → API Key**.

## MCP server

The MCP server in [`mcp-server/`](mcp-server/) is a zero-dependency stdio server
that lets AI clients query your Mnemo decisions. See
[`mcp-server/CLIENTS.md`](mcp-server/CLIENTS.md) for Claude Code / Cursor /
Windsurf / VS Code setup.

---

## Status

Actively developed. Implemented and working: capture (extension / import / paste),
AI extraction, semantic search, Memory Chat, conflict detection, and the MCP
server. The provider layer currently ships with Gemini; additional providers are
scaffolded but not yet wired in.

## License

Proprietary — Mnemo.
