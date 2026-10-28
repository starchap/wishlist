import crypto from 'crypto';
import { eq, desc } from 'drizzle-orm';
import { Result } from '@wishlist/shared-kernel';
import { getDb, usersTable, inviteTokensTable, wishlistsTable } from '@wishlist/database';
import { User, InviteToken, CHIBI_AVATARS } from '../domain/models';
import { PasswordHasher, SessionTokenService, type SessionPayload } from '../infrastructure/security';

export interface UserDto {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  avatarEmoji: string;
  createdAt: string;
}

export interface InviteDto {
  id: string;
  token: string;
  label: string;
  redeemedByUserId: string | null;
  redeemedAt: string | null;
  expiresAt: string;
  createdAt: string;
  canBeRedeemed: boolean;
}

export class IamApplicationService {
  /**
   * Ensures the initial Admin account and its Wishlist exist in Neon Postgres.
   */
  public static async ensureAdminSeeded(): Promise<UserDto> {
    const db = getDb();
    const adminUsername = (process.env.ADMIN_USERNAME || 'mikkel').toLowerCase().trim();
    const existingAdmins = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.role, 'admin'))
      .limit(1);

    const existing =
      existingAdmins.length > 0
        ? existingAdmins
        : await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.username, adminUsername))
            .limit(1);

    if (existing.length > 0) {
      const row = existing[0];
      // Ensure admin also has their 1 wishlist
      const wl = await db
        .select()
        .from(wishlistsTable)
        .where(eq(wishlistsTable.userId, row.id))
        .limit(1);
      if (wl.length === 0) {
        await db.insert(wishlistsTable).values({
          id: `wl_${crypto.randomUUID()}`,
          userId: row.id,
          title: `${row.displayName}s Ønskeliste`,
          description: 'Velkommen til min ønskeliste ✨'
        });
      }
      return {
        id: row.id,
        username: row.username,
        displayName: row.displayName,
        role: row.role,
        avatarEmoji: row.avatarEmoji,
        createdAt: row.createdAt.toISOString()
      };
    }

    const adminId = `usr_admin_${crypto.randomUUID().slice(0, 8)}`;
    const displayName = process.env.ADMIN_DISPLAY_NAME || 'Mikkel';
    const password = process.env.ADMIN_DEFAULT_PASSWORD || 'D%32aFmpF#';
    const passwordHash = PasswordHasher.hash(password);

    await db.insert(usersTable).values({
      id: adminId,
      username: adminUsername,
      displayName,
      passwordHash,
      role: 'admin',
      avatarEmoji: '👑'
    });

    await db.insert(wishlistsTable).values({
      id: `wl_${crypto.randomUUID()}`,
      userId: adminId,
      title: `${displayName}s Ønskeliste`,
      description: 'Mine ønsker til jul og fødselsdag 🎁'
    });

    return {
      id: adminId,
      username: adminUsername,
      displayName,
      role: 'admin',
      avatarEmoji: '👑',
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Authenticates a user and returns a signed session token + UserDto.
   */
  public static async login(
    username: string,
    password: string
  ): Promise<Result<{ user: UserDto; sessionToken: string }>> {
    await IamApplicationService.ensureAdminSeeded();
    const db = getDb();
    const cleanUsername = username.trim().toLowerCase();
    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, cleanUsername))
      .limit(1);

    if (rows.length === 0) {
      return Result.fail('errorInvalidCredentials');
    }

    const row = rows[0];
    if (!PasswordHasher.verify(password, row.passwordHash)) {
      return Result.fail('errorInvalidCredentials');
    }

    const user: UserDto = {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      avatarEmoji: row.avatarEmoji,
      createdAt: row.createdAt.toISOString()
    };

    const sessionToken = SessionTokenService.sign({
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      avatarEmoji: user.avatarEmoji
    });

    return Result.ok({ user, sessionToken });
  }

  /**
   * Admin-only: Generates a unique one-time invitation token so a person can create an account.
   */
  public static async createInviteLink(
    actor: SessionPayload,
    label: string,
    ttlDays = 14
  ): Promise<Result<InviteDto>> {
    if (actor.role !== 'admin') {
      return Result.fail('errorUnauthorizedAdmin');
    }
    const tokenString = crypto.randomBytes(18).toString('base64url');
    const id = `inv_${crypto.randomUUID()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    const domainResult = InviteToken.create(
      {
        token: tokenString,
        label,
        createdByUserId: actor.userId,
        redeemedByUserId: null,
        redeemedAt: null,
        expiresAt,
        createdAt: now
      },
      id
    );

    if (domainResult.isFailure) {
      return Result.fail(domainResult.getError());
    }

    const invite = domainResult.getValue();
    const db = getDb();
    await db.insert(inviteTokensTable).values({
      id: invite.id,
      token: invite.token,
      label: invite.label,
      createdByUserId: invite.createdByUserId,
      expiresAt: invite.expiresAt
    });

    return Result.ok({
      id: invite.id,
      token: invite.token,
      label: invite.label,
      redeemedByUserId: null,
      redeemedAt: null,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
      canBeRedeemed: true
    });
  }

  public static async getInviteByToken(token: string): Promise<InviteDto | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(inviteTokensTable)
      .where(eq(inviteTokensTable.token, token))
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0];
    const domainObj = InviteToken.create(
      {
        token: row.token,
        label: row.label,
        createdByUserId: row.createdByUserId,
        redeemedByUserId: row.redeemedByUserId,
        redeemedAt: row.redeemedAt,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt
      },
      row.id
    );
    if (domainObj.isFailure) return null;
    const inv = domainObj.getValue();

    return {
      id: inv.id,
      token: inv.token,
      label: inv.label,
      redeemedByUserId: inv.redeemedByUserId,
      redeemedAt: inv.redeemedAt ? inv.redeemedAt.toISOString() : null,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
      canBeRedeemed: inv.canBeRedeemed()
    };
  }

  /**
   * Registers a new user strictly using a valid, unredeemed Admin Invite Token.
   * Automatically creates the user's single Wishlist!
   */
  public static async registerWithInvite(params: {
    token: string;
    username: string;
    displayName: string;
    password: string;
    avatarEmoji?: string;
  }): Promise<Result<{ user: UserDto; sessionToken: string }>> {
    const invite = await IamApplicationService.getInviteByToken(params.token);
    if (!invite || !invite.canBeRedeemed) {
      return Result.fail('invalidInviteTitle');
    }

    const db = getDb();
    const cleanUsername = params.username.trim().toLowerCase();
    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, cleanUsername))
      .limit(1);

    if (existing.length > 0) {
      return Result.fail('errorUsernameTaken');
    }

    const userId = `usr_${crypto.randomUUID()}`;
    const avatar = params.avatarEmoji || CHIBI_AVATARS[0];
    const passwordHash = PasswordHasher.hash(params.password);
    const now = new Date();

    const userDomain = User.create(
      {
        username: cleanUsername,
        displayName: params.displayName,
        passwordHash,
        role: 'member',
        avatarEmoji: avatar,
        createdAt: now
      },
      userId
    );

    if (userDomain.isFailure) {
      return Result.fail(userDomain.getError());
    }

    const u = userDomain.getValue();

    await db.insert(usersTable).values({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      passwordHash: u.passwordHash,
      role: u.role,
      avatarEmoji: u.avatarEmoji
    });

    // Mark invite token as redeemed
    await db
      .update(inviteTokensTable)
      .set({
        redeemedByUserId: u.id,
        redeemedAt: now
      })
      .where(eq(inviteTokensTable.id, invite.id));

    // Automatically create the user's 1 Wishlist
    await db.insert(wishlistsTable).values({
      id: `wl_${crypto.randomUUID()}`,
      userId: u.id,
      title: `${u.displayName}s Ønskeliste`,
      description: 'Her er mine ønsker ✨'
    });

    const userDto: UserDto = {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      avatarEmoji: u.avatarEmoji,
      createdAt: u.createdAt.toISOString()
    };

    const sessionToken = SessionTokenService.sign({
      userId: userDto.id,
      username: userDto.username,
      displayName: userDto.displayName,
      role: userDto.role,
      avatarEmoji: userDto.avatarEmoji
    });

    return Result.ok({ user: userDto, sessionToken });
  }

  public static async listInvites(actor: SessionPayload): Promise<InviteDto[]> {
    if (actor.role !== 'admin') return [];
    const db = getDb();
    const rows = await db
      .select()
      .from(inviteTokensTable)
      .orderBy(desc(inviteTokensTable.createdAt));

    return rows.map((row) => {
      const now = new Date();
      const canBeRedeemed = !row.redeemedByUserId && now.getTime() <= row.expiresAt.getTime();
      return {
        id: row.id,
        token: row.token,
        label: row.label,
        redeemedByUserId: row.redeemedByUserId,
        redeemedAt: row.redeemedAt ? row.redeemedAt.toISOString() : null,
        expiresAt: row.expiresAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        canBeRedeemed
      };
    });
  }

  public static async listUsers(): Promise<UserDto[]> {
    const db = getDb();
    const rows = await db.select().from(usersTable).orderBy(usersTable.displayName);
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.displayName,
      role: r.role,
      avatarEmoji: r.avatarEmoji,
      createdAt: r.createdAt.toISOString()
    }));
  }
}
