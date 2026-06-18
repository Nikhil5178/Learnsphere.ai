# LearnSphere AI

AI-powered learning assistant. Upload PDF study materials and interact with them through natural language chat, get instant summaries, auto-generated quizzes, and personalized study recommendations — built for KLH Hackathon 2026 (theme: **Personalized Education — AI-Powered Learning and Teaching**).

## Features

- **PDF upload + RAG chat** — upload study material, ask questions, get answers grounded in your document with page citations
- **Quiz generator** — auto-creates MCQ / True-False questions from any uploaded document
- **Summarization** — full-document, chapter-wise, or key-concepts-only summaries
- **Progress tracking** — quiz scores recorded per topic
- **Personalized recommendations** — AI suggests what to study next based on quiz performance
- **Auth** — email/password signup and login

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React, TypeScript, Tailwind CSS |
| Backend | Next.js API routes |
| AI | Groq API (`llama-3.1-8b-instant`) for chat/quiz/summary generation |
| Embeddings | HuggingFace Inference API (`all-MiniLM-L6-v2`) for RAG retrieval |
| Database | Supabase (PostgreSQL) |
| Auth | NextAuth.js (Credentials provider) |
| Deployment | Vercel |

## How the RAG pipeline works

1. PDF is uploaded → text extracted with `pdf-parse`
2. Text is split into ~1000-character overlapping chunks (`src/lib/rag.ts`)
3. Each chunk is embedded via HuggingFace's free inference API and stored in Supabase as JSON
4. When a question is asked, it's embedded the same way, and compared to all chunks using cosine similarity
5. Top 4 most relevant chunks are passed to Groq as context, along with the question
6. The model answers using only that context, and cites which chunks/pages it used

This is a JSON-based vector search (not native pgvector indexing) to keep setup simple for a hackathon timeline. It works fine for documents up to a few hundred pages. For production scale, switch `document_chunks.embedding` to a real `vector(384)` column and use Supabase's pgvector similarity operators.

## Local setup

### 1. Clone and install

```bash
git clone https://github.com/your-username/learnsphere-ai.git
cd learnsphere-ai
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Once created, go to **SQL Editor** → paste the contents of `supabase/schema.sql` → Run
3. Go to **Project Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Get a Groq API key (free)

1. Go to [console.groq.com](https://console.groq.com) → API Keys → Create
2. Copy it to `GROQ_API_KEY`

### 4. Get a HuggingFace token (free, optional but recommended)

1. Go to [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) → New token (read access is enough)
2. Copy it to `HUGGINGFACE_API_KEY`
3. If you skip this, the app still runs but semantic search quality will be much worse (it falls back to a basic hash-based embedding)

### 5. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in all values from steps 2–4. For `NEXTAUTH_SECRET`, generate one with:

```bash
openssl rand -base64 32
```

### 6. Run locally

```bash
npm run dev
```

Visit `http://localhost:3000`, register an account, and start uploading PDFs.

## Deploying to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → import your GitHub repo
3. In **Environment Variables**, add all the same variables from `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GROQ_API_KEY`
   - `HUGGINGFACE_API_KEY`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` → set this to your final Vercel URL, e.g. `https://learnsphere-ai.vercel.app` (you can deploy once first to get the URL, then add this and redeploy)
4. Click **Deploy**

That's it — Vercel builds and hosts it automatically on every push to `main`.

## Project structure

```
src/
  app/
    api/
      auth/[...nextauth]/   NextAuth handler
      auth/register/        Signup endpoint
      documents/upload/     PDF upload + chunking + embedding pipeline
      documents/list/       List user's documents
      chat/                 RAG-based Q&A endpoint
      quiz/generate/        AI quiz generation
      quiz/submit/          Records quiz score for progress tracking
      summary/generate/     AI summarization
      recommendations/      Personalized study suggestions
    dashboard/             Main app UI (documents, chat, quiz, summary tabs)
    login/, register/      Auth pages
  lib/
    supabase.ts            Supabase client (admin + anon)
    ai.ts                  Groq prompt logic for chat/quiz/summary/recommendations
    rag.ts                 Chunking, embedding, cosine similarity
    auth.ts                NextAuth config
supabase/
  schema.sql               Full database schema
```

## Known limitations / future work

- Embeddings are stored as JSON, not native pgvector — fine for hackathon scale, not for thousands of documents
- No OCR — scanned/image-only PDFs won't extract text
- Topic tagging for recommendations is currently manual; a future version could auto-tag quiz questions by topic using the LLM
- Single-language (English) — multi-language support is a planned future enhancement per the original brief

## License

Built for KLH Hackathon 2026.
