import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { generateRecommendations } from '@/lib/ai';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    const { data: attempts } = await supabaseAdmin
      .from('quiz_attempts')
      .select('percentage, topic_tags')
      .eq('user_id', userId);

    const weak: string[] = [];
    const strong: string[] = [];

    (attempts ?? []).forEach((a) => {
      const tags: string[] = a.topic_tags ?? [];
      if (a.percentage < 60) weak.push(...tags);
      else if (a.percentage >= 80) strong.push(...tags);
    });

    const recommendations = await generateRecommendations([...new Set(weak)], [...new Set(strong)]);

    return NextResponse.json({ recommendations });
  } catch (err: any) {
    console.error('Recommendations error:', err);
    return NextResponse.json({ error: 'Failed to generate recommendations' }, { status: 500 });
  }
}
