import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { generateQuiz } from '@/lib/ai';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    const { documentId, questionType = 'mcq', count = 5 } = await req.json();
    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
    }

    const { data: doc } = await supabaseAdmin
      .from('documents')
      .select('id, full_text, title')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const questions = await generateQuiz(doc.full_text, questionType, Math.min(count, 15));

    if (!questions.length) {
      return NextResponse.json({ error: 'Could not generate quiz from this document' }, { status: 500 });
    }

    const quizId = uuidv4();
    await supabaseAdmin.from('quizzes').insert({
      id: quizId,
      user_id: userId,
      document_id: documentId,
      questions,
      question_type: questionType,
    });

    return NextResponse.json({ quizId, questions, documentTitle: doc.title });
  } catch (err: any) {
    console.error('Quiz generation error:', err);
    return NextResponse.json({ error: 'Failed to generate quiz' }, { status: 500 });
  }
}
