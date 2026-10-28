import { NextResponse } from 'next/server';
import { CoordinationChatService } from '@wishlist/domain-coordination-chat';
import { getCurrentSession } from '../../../lib/session';

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const wishId = searchParams.get('wishId') || '';

  const res = await CoordinationChatService.listMessages(session.userId, wishId);
  if (res.isFailure) {
    return NextResponse.json({ error: res.getError() }, { status: 403 });
  }

  return NextResponse.json({ messages: res.getValue() });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const wishId = String(body.wishId || '');
  const content = String(body.content || '');

  const res = await CoordinationChatService.postMessage(session.userId, wishId, content);
  if (res.isFailure) {
    return NextResponse.json({ error: res.getError() }, { status: 400 });
  }

  return NextResponse.json({ message: res.getValue() });
}
