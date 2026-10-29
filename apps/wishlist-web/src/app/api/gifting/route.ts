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
  const action = body.action as 'upsert' | 'remove' | 'toggle' | undefined;
  const pledgeType = body.pledgeType as 'full' | 'partial_amount' | 'partial_percent' | undefined;
  const amountDkk =
    body.amountDkk !== undefined && body.amountDkk !== null && body.amountDkk !== ''
      ? Number(body.amountDkk)
      : null;
  const percentShare =
    body.percentShare !== undefined && body.percentShare !== null && body.percentShare !== ''
      ? Number(body.percentShare)
      : null;
  const quantity = Number(body.quantity || 1);

  const res = await GiftingApplicationService.saveGiftPledge(session.userId, {
    wishId,
    action: action || 'upsert',
    pledgeType: pledgeType || 'full',
    amountDkk,
    percentShare,
    quantity
  });
  if (res.isFailure) {
    return NextResponse.json({ error: res.getError() }, { status: 400 });
  }

  return NextResponse.json(res.getValue());
}
