import { NextResponse } from 'next/server';
import { GiftingApplicationService } from '@wishlist/domain-gifting';
import { getCurrentSession } from '../../../lib/session';

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const wishId = String(body.wishId || '');
  const quantity = Number(body.quantity || 1);

  const res = await GiftingApplicationService.toggleGiftPledge(session.userId, wishId, quantity);
  if (res.isFailure) {
    return NextResponse.json({ error: res.getError() }, { status: 400 });
  }

  return NextResponse.json(res.getValue());
}
