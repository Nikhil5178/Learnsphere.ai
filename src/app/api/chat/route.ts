import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { embedText, cosineSimilarity } from '@/lib/rag';
import { generateChatAnswer } from '@/lib/ai';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    const { documentId, question } = await req.json();
    if (!documentId || !question) {
      return NextResponse.json({ error: 'documentId and question are required' }, { status: 400 });
    }

    // Verify the document belongs to this user
    const { data: doc } = await supabaseAdmin
      .from('documents')
      .select('id')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Fetch all chunks for this document
    const { data: chunks, error: chunkErr } = await supabaseAdmin
      .from('document_chunks')
      .select('content, page_number, embedding')
      .eq('document_id', documentId);

    if (chunkErr || !chunks?.length) {
      return NextResponse.json({ error: 'No content available for this document' }, { status: 404 });
    }

    // Embed the question and rank chunks by similarity (top 4)
    const questionEmbedding = await embedText(question);
    const ranked = chunks
      .map((c) => ({ ...c, score: cosineSimilarity(questionEmbedding, c.embedding as number[]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    const answer = await generateChatAnswer(question, ranked);

    // Persist the conversation turn
    await supabaseAdmin.from('chat_messages').insert([
      { id: uuidv4(), user_id: userId, document_id: documentId, role: 'user', content: question },
      { id: uuidv4(), user_id: userId, document_id: documentId, role: 'assistant', content: answer },
    ]);

    return NextResponse.json({
      answer,
      sources: ranked.map((r) => ({ page_number: r.page_number, excerpt: r.content.slice(0, 150) })),
    });
  } catch (err: any) {
    console.error('Chat error:', err);
    return NextResponse.json({ error: 'Failed to generate answer' }, { status: 500 });
  }
}
