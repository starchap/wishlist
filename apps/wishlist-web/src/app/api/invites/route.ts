import { NextResponse } from 'next/server';
import { IamApplicationService } from '@wishlist/domain-iam';
import { getCurrentSession } from '../../../lib/session';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (token) {
    const invite = await IamApplicationService.getInviteByToken(token);
    return NextResponse.json({ invite });
  }

  const session = await getCurrentSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'errorUnauthorizedAdmin' }, { status: 403 });
  }

  const invites = await IamApplicationService.listInvites(session);
  return NextResponse.json({ invites });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'errorUnauthorizedAdmin' }, { status: 403 });
  }

  const body = await req.json();
  const result = await IamApplicationService.createInviteLink(
    session,
    String(body.label || 'Ny Ven')
  );

  if (result.isFailure) {
    return NextResponse.json({ error: result.getError() }, { status: 400 });
  }

  return NextResponse.json({ invite: result.getValue() });
}
