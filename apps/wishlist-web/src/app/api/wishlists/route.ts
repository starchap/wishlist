import { NextResponse } from 'next/server';
import { WishlistApplicationService } from '@wishlist/domain-wishlist';
import { MetadataImporterService } from '@wishlist/domain-metadata-importer';
import { GiftingApplicationService } from '@wishlist/domain-gifting';
import { getCurrentSession } from '../../../lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const wishlists = await WishlistApplicationService.listAllWishlists();
  // Gifting state automatically strips all pledge/chat info for the viewer's own wishlist (Surprise Guard)!
  const giftingStates = await GiftingApplicationService.getGiftingStateForViewer(session.userId);

  return NextResponse.json({
    wishlists,
    giftingStates
  });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  // Support batch import (e.g. from Ønskeskyen) or single wish creation
  if (Array.isArray(body.items)) {
    const created = [];
    for (const item of body.items) {
      const res = await WishlistApplicationService.addWish(
        session.userId,
        session.displayName,
        {
          title: String(item.title || ''),
          description: String(item.description || ''),
          quantity: Number(item.quantity || 1),
          priceDkk: item.priceDkk !== null && item.priceDkk !== undefined ? Number(item.priceDkk) : null,
          productUrl: item.productUrl || null,
          imageUrl: item.imageUrl || null,
          preProcessedAvif: item.avifImage || null
        }
      );
      if (res.isSuccess) {
        created.push(res.getValue());
      }
    }
    return NextResponse.json({ createdCount: created.length, wishes: created });
  }

  let title = String(body.title || '').trim();
  let description = String(body.description || '').trim();
  let priceDkk =
    body.priceDkk !== null && body.priceDkk !== undefined && body.priceDkk !== ''
      ? Number(body.priceDkk)
      : null;
  const productUrl = body.productUrl ? String(body.productUrl).trim() : null;
  let imageUrl = body.imageDataUrl || body.imageUrl || null;
  let preProcessedAvif = body.avifImage || null;

  // Auto-scrape from productUrl on save if title or image is missing
  if (productUrl && (!title || (!imageUrl && !preProcessedAvif))) {
    const scraped = await MetadataImporterService.scrapeProductUrl(productUrl);
    if (scraped.isSuccess) {
      const meta = scraped.getValue();
      if (!title && meta.title) title = meta.title;
      if (!description && meta.description) description = meta.description;
      if (priceDkk === null && meta.priceDkk !== null) priceDkk = meta.priceDkk;
      if (!preProcessedAvif && meta.avifImage) preProcessedAvif = meta.avifImage;
      if (!imageUrl && meta.imageUrl) imageUrl = meta.imageUrl;
    }
  }

  const res = await WishlistApplicationService.addWish(session.userId, session.displayName, {
    title,
    description,
    quantity: Number(body.quantity || 1),
    priceDkk,
    productUrl,
    imageUrl,
    preProcessedAvif
  });

  if (res.isFailure) {
    return NextResponse.json({ error: res.getError() }, { status: 400 });
  }

  return NextResponse.json({ wish: res.getValue() });
}

export async function DELETE(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const wishId = searchParams.get('wishId');
  if (!wishId) {
    return NextResponse.json({ error: 'Missing wishId' }, { status: 400 });
  }

  const res = await WishlistApplicationService.deleteWish(session.userId, wishId);
  if (res.isFailure) {
    return NextResponse.json({ error: res.getError() }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
