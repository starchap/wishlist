import { cookies } from 'next/headers';
import { SessionTokenService, type SessionPayload } from '@wishlist/domain-iam';

export const SESSION_COOKIE_NAME = 'chibi_wishlist_session';

export async function getCurrentSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return SessionTokenService.verify(raw);
}
