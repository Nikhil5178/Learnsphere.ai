import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Model used for all generation tasks. llama-3.1-8b-instant is fast & free-tier friendly.
// Swap to "llama-3.3-70b-versatile" for higher quality if you have quota.
const MODEL = 'llama-3.1-8b-instant';

export async function generateChatAnswer(
  question: string,
  contextChunks: { content: string; page_number: number | null }[]
) {
  const context = contextChunks
    .map((c, i) => `[Source ${i + 1}, Page ${c.page_number ?? 'N/A'}]\n${c.content}`)
    .join('\n\n');

  const systemPrompt = `You are LearnSphere AI, a helpful study assistant. Answer the student's question using ONLY the provided document excerpts below. If the answer isn't in the excerpts, say so honestly rather than guessing. Keep answers clear and exam-focused. After your answer, list which source numbers you used.

DOCUMENT EXCERPTS:
${context}`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ],
    temperature: 0.3,
    max_tokens: 800,
  });

  return completion.choices[0]?.message?.content ?? 'I could not generate a response.';
}

export async function generateSummary(text: string, type: 'full' | 'chapter' | 'key_concepts') {
  const instructions: Record<string, string> = {
    full: 'Write a comprehensive but concise summary of this entire document, organized into clear sections.',
    chapter: 'Break this document into logical chapters/topics and summarize each one separately with a heading.',
    key_concepts: 'Extract only the key concepts, definitions, and formulas as a bulleted list. Skip narrative explanation.',
  };

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are an expert study assistant. ${instructions[type]} Use markdown formatting with headers and bullet points.`,
      },
      { role: 'user', content: text.slice(0, 12000) },
    ],
    temperature: 0.3,
    max_tokens: 1500,
  });

  return completion.choices[0]?.message?.content ?? '';
}

export interface QuizQuestion {
  question: string;
  type: 'mcq' | 'true_false' | 'short_answer';
  options?: string[];
  correct_answer: string;
  explanation: string;
}

export async function generateQuiz(
  text: string,
  questionType: 'mcq' | 'true_false' | 'short_answer',
  count: number
): Promise<QuizQuestion[]> {
  const typeInstructions: Record<string, string> = {
    mcq: 'multiple choice questions with exactly 4 options each',
    true_false: 'true/false questions',
    short_answer: 'short answer questions (1-2 sentence expected answers)',
  };

  const systemPrompt = `You are a quiz generator for students. Based on the study material provided, create exactly ${count} ${typeInstructions[questionType]}.

Respond ONLY with a valid JSON array, no markdown, no preamble, no code fences. Each item must follow this exact shape:
{
  "question": "string",
  "type": "${questionType}",
  "options": ${questionType === 'mcq' ? '["A", "B", "C", "D"]' : 'null'},
  "correct_answer": "string (must exactly match one option for mcq, or 'True'/'False', or the expected short answer)",
  "explanation": "string, 1 sentence explaining why this is correct"
}`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text.slice(0, 10000) },
    ],
    temperature: 0.4,
    max_tokens: 2000,
  });

  const raw = completion.choices[0]?.message?.content ?? '[]';
  const cleaned = raw.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    console.error('Failed to parse quiz JSON:', cleaned);
    return [];
  }
}

export async function generateRecommendations(weakTopics: string[], strongTopics: string[]) {
  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are a study advisor. Based on the topics a student struggles with vs excels at, suggest 3-5 specific next study actions. Respond ONLY with a JSON array of strings, no markdown.',
      },
      {
        role: 'user',
        content: `Weak topics (low quiz scores): ${weakTopics.join(', ') || 'none yet'}\nStrong topics (high quiz scores): ${strongTopics.join(', ') || 'none yet'}`,
      },
    ],
    temperature: 0.5,
    max_tokens: 400,
  });

  const raw = completion.choices[0]?.message?.content ?? '[]';
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    return [];
  }
}
