import { NextResponse } from 'next/server';
import { WishlistApplicationService } from '@wishlist/domain-wishlist';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const img = await WishlistApplicationService.getAvifImageById(id);
  if (!img) {
    return new NextResponse('Not found', { status: 404 });
  }

  return new NextResponse(new Uint8Array(img.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'image/avif',
      'Content-Length': String(img.buffer.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
}
