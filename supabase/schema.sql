-- LearnSphere AI — Supabase schema
-- Run this in Supabase SQL Editor (Project > SQL Editor > New Query)

-- Enable pgvector for embeddings (optional — only needed if you later switch
-- from JSON-stored embeddings to native vector similarity search)
create extension if not exists vector;

-- Users table (custom auth via NextAuth Credentials provider)
create table if not exists users (
  id uuid primary key,
  name text not null,
  email text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);

-- Documents (uploaded PDFs)
create table if not exists documents (
  id uuid primary key,
  user_id uuid references users(id) on delete cascade,
  title text not null,
  full_text text not null,
  page_count int default 1,
  status text default 'processing', -- processing | ready | failed
  created_at timestamptz default now()
);

-- Document chunks for RAG retrieval
create table if not exists document_chunks (
  id uuid primary key,
  document_id uuid references documents(id) on delete cascade,
  content text not null,
  chunk_index int not null,
  page_number int,
  embedding jsonb not null, -- stored as JSON array of floats (384-dim)
  created_at timestamptz default now()
);

create index if not exists idx_chunks_document on document_chunks(document_id);

-- Chat history
create table if not exists chat_messages (
  id uuid primary key,
  user_id uuid references users(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  role text not null, -- user | assistant
  content text not null,
  created_at timestamptz default now()
);

create index if not exists idx_chat_user_doc on chat_messages(user_id, document_id);

-- Generated quizzes
create table if not exists quizzes (
  id uuid primary key,
  user_id uuid references users(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  questions jsonb not null,
  question_type text default 'mcq',
  created_at timestamptz default now()
);

-- Quiz attempts (for progress tracking / recommendations)
create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  quiz_id uuid references quizzes(id) on delete cascade,
  score int not null,
  total_questions int not null,
  percentage int not null,
  topic_tags text[] default '{}',
  created_at timestamptz default now()
);

create index if not exists idx_attempts_user on quiz_attempts(user_id);

-- Generated summaries
create table if not exists summaries (
  id uuid primary key,
  user_id uuid references users(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  content text not null,
  summary_type text default 'full',
  created_at timestamptz default now()
);

-- Row Level Security: since this app uses NextAuth (not Supabase Auth),
-- all access is mediated through the service role key on the server.
-- We disable RLS here for simplicity; the API routes are the only entry
-- point and they always filter by the authenticated user's id.
alter table users disable row level security;
alter table documents disable row level security;
alter table document_chunks disable row level security;
alter table chat_messages disable row level security;
alter table quizzes disable row level security;
alter table quiz_attempts disable row level security;
alter table summaries disable row level security;
