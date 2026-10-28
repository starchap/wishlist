import { NextResponse } from 'next/server';
import { MetadataImporterService } from '@wishlist/domain-metadata-importer';
import { getCurrentSession } from '../../../lib/session';

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const mode = body.mode || 'single';
  const url = String(body.url || '').trim();

  if (!url) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  if (mode === 'oenskeskyen') {
    const res = await MetadataImporterService.scrapeOenskeskyenShareUrl(url, true);
    if (res.isFailure) {
      return NextResponse.json({ error: res.getError() }, { status: 400 });
    }
    return NextResponse.json({ items: res.getValue() });
  }

  const res = await MetadataImporterService.scrapeProductUrl(url);
  if (res.isFailure) {
    return NextResponse.json({ error: res.getError() }, { status: 400 });
  }
  return NextResponse.json({ metadata: res.getValue() });
}
