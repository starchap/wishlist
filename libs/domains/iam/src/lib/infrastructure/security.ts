import crypto from 'crypto';
import type { UserRole } from '../domain/models';

export class PasswordHasher {
  public static hash(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derived}`;
  }

  public static verify(password: string, storedHash: string): boolean {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) {
      return false;
    }
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedBuffer = crypto.scryptSync(password, salt, 64);
    if (keyBuffer.length !== derivedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
  }
}

export interface SessionPayload {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
  avatarEmoji: string;
  exp: number;
}

export class SessionTokenService {
  private static getSecret(): string {
    return process.env.SESSION_SECRET || 'chibi-wishlist-default-secret-2026';
  }

  public static sign(payload: Omit<SessionPayload, 'exp'>, ttlDays = 30): string {
    const fullPayload: SessionPayload = {
      ...payload,
      exp: Date.now() + ttlDays * 24 * 60 * 60 * 1000
    };
    const data = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const sig = crypto
      .createHmac('sha256', SessionTokenService.getSecret())
      .update(data)
      .digest('base64url');
    return `${data}.${sig}`;
  }

  public static verify(token?: string | null): SessionPayload | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [data, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', SessionTokenService.getSecret())
      .update(data)
      .digest('base64url');
    if (sig !== expectedSig) return null;
    try {
      const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload;
      if (Date.now() > parsed.exp) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
