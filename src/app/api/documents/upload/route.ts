import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { chunkText, embedText } from '@/lib/rag';

// pdf-parse is CommonJS; dynamic import keeps it out of the edge bundle.
async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default;
  const result = await pdfParse(buffer);
  return result.text;
}

export const maxDuration = 60; // allow up to 60s for larger PDFs on Vercel

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File exceeds 50MB limit' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractPdfText(buffer);

    if (!text || text.trim().length < 50) {
      return NextResponse.json(
        { error: 'Could not extract text from this PDF. It may be a scanned image without OCR.' },
        { status: 422 }
      );
    }

    const documentId = uuidv4();

    // 1. Store document metadata
    const { error: docError } = await supabaseAdmin.from('documents').insert({
      id: documentId,
      user_id: userId,
      title: file.name,
      full_text: text,
      page_count: estimatePageCount(text),
      status: 'processing',
    });
    if (docError) throw docError;

    // 2. Chunk the text
    const chunks = chunkText(text);

    // 3. Embed each chunk and store in vector table
    const embeddedRows = await Promise.all(
      chunks.map(async (chunk) => {
        const embedding = await embedText(chunk.content);
        return {
          id: uuidv4(),
          document_id: documentId,
          content: chunk.content,
          chunk_index: chunk.chunk_index,
          page_number: chunk.page_number,
          embedding,
        };
      })
    );

    const { error: chunkError } = await supabaseAdmin.from('document_chunks').insert(embeddedRows);
    if (chunkError) throw chunkError;

    // 4. Mark document ready
    await supabaseAdmin.from('documents').update({ status: 'ready' }).eq('id', documentId);

    return NextResponse.json({
      document: {
        id: documentId,
        title: file.name,
        page_count: estimatePageCount(text),
        chunk_count: chunks.length,
        status: 'ready',
      },
    });
  } catch (err: any) {
    console.error('Upload processing error:', err);
    return NextResponse.json({ error: 'Failed to process document' }, { status: 500 });
  }
}

function estimatePageCount(text: string): number {
  // Rough heuristic: ~500 words per page
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.round(words / 500));
}
