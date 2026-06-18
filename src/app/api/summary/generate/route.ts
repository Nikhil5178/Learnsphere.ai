import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { generateSummary } from '@/lib/ai';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    const { documentId, type = 'full' } = await req.json();
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

    const summary = await generateSummary(doc.full_text, type);

    await supabaseAdmin.from('summaries').insert({
      id: uuidv4(),
      user_id: userId,
      document_id: documentId,
      content: summary,
      summary_type: type,
    });

    return NextResponse.json({ summary, documentTitle: doc.title });
  } catch (err: any) {
    console.error('Summary generation error:', err);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
