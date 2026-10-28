import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { IamApplicationService } from '@wishlist/domain-iam';
import { SESSION_COOKIE_NAME, getCurrentSession } from '../../../lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await IamApplicationService.ensureAdminSeeded();
    const session = await getCurrentSession();
    return NextResponse.json({ session });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Auth check error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'logout') {
      const cookieStore = await cookies();
      cookieStore.delete(SESSION_COOKIE_NAME);
      return NextResponse.json({ ok: true });
    }

    if (action === 'login') {
      const result = await IamApplicationService.login(
        String(body.username || ''),
        String(body.password || '')
      );
      if (result.isFailure) {
        return NextResponse.json({ error: result.getError() }, { status: 401 });
      }
      const { user, sessionToken } = result.getValue();
      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60
      });
      return NextResponse.json({ user });
    }

    if (action === 'registerWithInvite') {
      const result = await IamApplicationService.registerWithInvite({
        token: String(body.token || ''),
        username: String(body.username || ''),
        displayName: String(body.displayName || ''),
        password: String(body.password || ''),
        avatarEmoji: String(body.avatarEmoji || '🐣')
      });
      if (result.isFailure) {
        return NextResponse.json({ error: result.getError() }, { status: 400 });
      }
      const { user, sessionToken } = result.getValue();
      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60
      });
      return NextResponse.json({ user });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 }
    );
  }
}
