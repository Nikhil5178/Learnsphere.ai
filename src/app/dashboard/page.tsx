'use client';

import { useEffect, useState, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface Doc {
  id: string;
  title: string;
  page_count: number;
  status: string;
}
interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  sources?: { page_number: number | null; excerpt: string }[];
}
interface QuizQ {
  question: string;
  type: string;
  options?: string[];
  correct_answer: string;
  explanation: string;
}

type Tab = 'documents' | 'chat' | 'quiz' | 'summary';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('documents');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [activeDoc, setActiveDoc] = useState<Doc | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // chat state
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // quiz state
  const [quiz, setQuiz] = useState<QuizQ[] | null>(null);
  const [quizId, setQuizId] = useState('');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);

  // summary state
  const [summary, setSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') fetchDocs();
  }, [status]);

  async function fetchDocs() {
    const res = await fetch('/api/documents/list');
    if (res.ok) {
      const data = await res.json();
      setDocs(data.documents);
      if (data.documents.length && !activeDoc) setActiveDoc(data.documents[0]);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/documents/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || 'Upload failed');
      } else {
        await fetchDocs();
        setActiveDoc(data.document);
      }
    } catch {
      setUploadError('Upload failed. Please try again.');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function sendChat() {
    if (!chatInput.trim() || !activeDoc) return;
    const question = chatInput.trim();
    setChatInput('');
    setMessages((m) => [...m, { role: 'user', content: question }]);
    setChatLoading(true);

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: activeDoc.id, question }),
    });
    const data = await res.json();
    setChatLoading(false);

    if (res.ok) {
      setMessages((m) => [...m, { role: 'assistant', content: data.answer, sources: data.sources }]);
    } else {
      setMessages((m) => [...m, { role: 'assistant', content: `Error: ${data.error}` }]);
    }
  }

  async function generateQuiz(questionType: string, count: number) {
    if (!activeDoc) return;
    setQuizLoading(true);
    setQuiz(null);
    setQuizSubmitted(false);
    setAnswers({});

    const res = await fetch('/api/quiz/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: activeDoc.id, questionType, count }),
    });
    const data = await res.json();
    setQuizLoading(false);

    if (res.ok) {
      setQuiz(data.questions);
      setQuizId(data.quizId);
    }
  }

  async function submitQuiz() {
    if (!quiz) return;
    let score = 0;
    quiz.forEach((q, i) => {
      if (answers[i]?.trim().toLowerCase() === q.correct_answer.trim().toLowerCase()) score++;
    });
    setQuizSubmitted(true);

    await fetch('/api/quiz/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quizId, score, totalQuestions: quiz.length }),
    });
  }

  async function generateSummaryHandler(type: string) {
    if (!activeDoc) return;
    setSummaryLoading(true);
    setSummary('');

    const res = await fetch('/api/summary/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: activeDoc.id, type }),
    });
    const data = await res.json();
    setSummaryLoading(false);
    if (res.ok) setSummary(data.summary);
  }

  if (status === 'loading') {
    return <div className="flex h-screen items-center justify-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-gray-200 bg-white p-3">
        <div className="mb-4 px-2 py-2 text-base font-medium text-gray-900">LearnSphere AI</div>
        {(['documents', 'chat', 'quiz', 'summary'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`mb-1 rounded-md px-3 py-2 text-left text-sm capitalize ${
              tab === t ? 'bg-primary-50 font-medium text-primary-600' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t === 'documents' ? 'Documents' : t === 'chat' ? 'AI Chat' : t === 'quiz' ? 'Quiz' : 'Summarize'}
          </button>
        ))}
        <div className="mt-auto border-t border-gray-200 pt-3">
          <p className="truncate px-2 text-xs text-gray-500">{session?.user?.email}</p>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="mt-1 w-full rounded-md px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">
        {tab === 'documents' && (
          <div>
            <h2 className="mb-4 text-lg font-medium text-gray-900">Your documents</h2>

            <label className="mb-6 block cursor-pointer rounded-xl border-2 border-dashed border-gray-300 p-8 text-center hover:bg-gray-50">
              <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
              <p className="text-sm text-gray-600">
                {uploading ? 'Processing PDF...' : <><strong>Click to upload</strong> a PDF (max 50MB)</>}
              </p>
            </label>
            {uploadError && <p className="mb-4 text-sm text-red-600">{uploadError}</p>}

            <div className="space-y-2">
              {docs.length === 0 && <p className="text-sm text-gray-500">No documents yet. Upload your first PDF above.</p>}
              {docs.map((d) => (
                <div
                  key={d.id}
                  onClick={() => setActiveDoc(d)}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 ${
                    activeDoc?.id === d.id ? 'border-primary-600 bg-primary-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{d.title}</p>
                    <p className="text-xs text-gray-500">{d.page_count} pages · {d.status}</p>
                  </div>
                  {activeDoc?.id === d.id && <span className="text-xs font-medium text-primary-600">Active</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'chat' && (
          <div className="flex h-full flex-col">
            <div className="mb-3 text-sm text-gray-500">
              Chatting with: <strong className="text-gray-900">{activeDoc?.title ?? 'No document selected'}</strong>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-gray-200 bg-white p-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      m.role === 'user' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    {m.content}
                    {m.sources && m.sources.length > 0 && (
                      <div className="mt-2 border-t border-gray-300 pt-2 text-xs text-gray-500">
                        Sources: {m.sources.map((s) => `p.${s.page_number ?? '?'}`).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && <p className="text-sm text-gray-400">Thinking...</p>}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                disabled={!activeDoc}
                placeholder="Ask anything about your document..."
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-600 focus:outline-none"
              />
              <button
                onClick={sendChat}
                disabled={!activeDoc || chatLoading}
                className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        )}

        {tab === 'quiz' && (
          <div>
            <h2 className="mb-4 text-lg font-medium text-gray-900">Generate a quiz</h2>
            <div className="mb-6 flex gap-3">
              <button onClick={() => generateQuiz('mcq', 5)} disabled={!activeDoc || quizLoading} className="rounded-md bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50">
                {quizLoading ? 'Generating...' : '5 MCQs'}
              </button>
              <button onClick={() => generateQuiz('true_false', 5)} disabled={!activeDoc || quizLoading} className="rounded-md border border-gray-300 px-4 py-2 text-sm disabled:opacity-50">
                5 True/False
              </button>
            </div>

            {quiz && (
              <div className="space-y-4">
                {quiz.map((q, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="mb-3 text-sm font-medium text-gray-900">Q{i + 1}. {q.question}</p>
                    <div className="space-y-2">
                      {(q.options ?? ['True', 'False']).map((opt) => {
                        const isSelected = answers[i] === opt;
                        const isCorrect = quizSubmitted && opt === q.correct_answer;
                        const isWrongSelected = quizSubmitted && isSelected && opt !== q.correct_answer;
                        return (
                          <button
                            key={opt}
                            disabled={quizSubmitted}
                            onClick={() => setAnswers((a) => ({ ...a, [i]: opt }))}
                            className={`block w-full rounded-md border px-3 py-2 text-left text-sm ${
                              isCorrect
                                ? 'border-green-600 bg-green-50 text-green-800'
                                : isWrongSelected
                                ? 'border-red-600 bg-red-50 text-red-800'
                                : isSelected
                                ? 'border-primary-600 bg-primary-50'
                                : 'border-gray-300'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    {quizSubmitted && <p className="mt-2 text-xs text-gray-500">{q.explanation}</p>}
                  </div>
                ))}
                {!quizSubmitted && (
                  <button onClick={submitQuiz} className="rounded-md bg-primary-600 px-4 py-2 text-sm text-white">
                    Submit quiz
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'summary' && (
          <div>
            <h2 className="mb-4 text-lg font-medium text-gray-900">Summarize document</h2>
            <div className="mb-6 flex gap-3">
              <button onClick={() => generateSummaryHandler('full')} disabled={!activeDoc || summaryLoading} className="rounded-md bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50">
                {summaryLoading ? 'Summarizing...' : 'Full summary'}
              </button>
              <button onClick={() => generateSummaryHandler('key_concepts')} disabled={!activeDoc || summaryLoading} className="rounded-md border border-gray-300 px-4 py-2 text-sm disabled:opacity-50">
                Key concepts only
              </button>
            </div>
            {summary && (
              <div className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-4 text-sm leading-relaxed text-gray-800">
                {summary}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
