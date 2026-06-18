import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    const { quizId, score, totalQuestions, topicTags = [] } = await req.json();
    if (!quizId || score === undefined || !totalQuestions) {
      return NextResponse.json({ error: 'quizId, score, and totalQuestions are required' }, { status: 400 });
    }

    const percentage = Math.round((score / totalQuestions) * 100);

    const { error } = await supabaseAdmin.from('quiz_attempts').insert({
      user_id: userId,
      quiz_id: quizId,
      score,
      total_questions: totalQuestions,
      percentage,
      topic_tags: topicTags,
    });

    if (error) throw error;

    return NextResponse.json({ success: true, percentage });
  } catch (err: any) {
    console.error('Quiz submission error:', err);
    return NextResponse.json({ error: 'Failed to record quiz attempt' }, { status: 500 });
  }
}
