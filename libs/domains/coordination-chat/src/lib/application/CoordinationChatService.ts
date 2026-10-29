import crypto from 'crypto';
import { asc, eq, lt } from 'drizzle-orm';
import { Result } from '@wishlist/shared-kernel';
import {
  getDb,
  chatMessagesTable,
  giftPledgesTable,
  wishesTable,
  wishlistsTable,
  usersTable
} from '@wishlist/database';
import { ChatMessage } from '../domain/models';

export interface ChatMessageDto {
  id: string;
  wishId: string;
  senderUserId: string;
  senderDisplayName: string;
  senderAvatarEmoji: string;
  content: string;
  createdAt: string;
  expiresAt: string;
}

export class CoordinationChatService {
  /**
   * Automatically deletes all chat messages older than 14 days (or before a custom reference date).
   */
  public static async purgeExpiredMessages(now: Date = new Date()): Promise<number> {
    const db = getDb();
    const cutoff = new Date(
      now.getTime() - ChatMessage.RETENTION_DAYS * 24 * 60 * 60 * 1000
    );
    const deleted = await db
      .delete(chatMessagesTable)
      .where(lt(chatMessagesTable.createdAt, cutoff))
      .returning({ id: chatMessagesTable.id });
    return deleted.length;
  }

  /**
   * Verifies that actorUserId is NOT the wish owner, has pledged the wish,
   * and that at least 2 users have pledged the same wish.
   */
  private static async verifyCoGiverAccess(
    actorUserId: string,
    wishId: string
  ): Promise<Result<void>> {
    const db = getDb();
    const wishRows = await db
      .select()
      .from(wishesTable)
      .where(eq(wishesTable.id, wishId))
      .limit(1);

    if (wishRows.length === 0) {
      return Result.fail('errorUnauthorizedChat');
    }

    const wlRows = await db
      .select()
      .from(wishlistsTable)
      .where(eq(wishlistsTable.id, wishRows[0].wishlistId))
      .limit(1);

    // SURPRISE GUARD: Wishlist owner can NEVER access the chat!
    if (wlRows.length === 0 || wlRows[0].userId === actorUserId) {
      return Result.fail('errorUnauthorizedChat');
    }

    return Result.ok();
  }

  /**
   * Lists messages in a co-giver chat room after running the 14-day TTL cleanup.
   */
  public static async listMessages(
    actorUserId: string,
    wishId: string
  ): Promise<Result<ChatMessageDto[]>> {
    await CoordinationChatService.purgeExpiredMessages();

    const access = await CoordinationChatService.verifyCoGiverAccess(actorUserId, wishId);
    if (access.isFailure) {
      return Result.fail(access.getError());
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.wishId, wishId))
      .orderBy(asc(chatMessagesTable.createdAt));

    const users = await db.select().from(usersTable);
    const userMap = new Map(users.map((u) => [u.id, u]));

    const dtos: ChatMessageDto[] = rows.map((r) => {
      const sender = userMap.get(r.senderUserId);
      const expiresAt = new Date(
        r.createdAt.getTime() + ChatMessage.RETENTION_DAYS * 24 * 60 * 60 * 1000
      );
      return {
        id: r.id,
        wishId: r.wishId,
        senderUserId: r.senderUserId,
        senderDisplayName: sender?.displayName || 'Gavegiver',
        senderAvatarEmoji: sender?.avatarEmoji || '🎁',
        content: r.content,
        createdAt: r.createdAt.toISOString(),
        expiresAt: expiresAt.toISOString()
      };
    });

    return Result.ok(dtos);
  }

  /**
   * Sends a plain-text + emoji message to a co-giver chat room.
   */
  public static async postMessage(
    actorUserId: string,
    wishId: string,
    rawContent: string
  ): Promise<Result<ChatMessageDto>> {
    await CoordinationChatService.purgeExpiredMessages();

    const access = await CoordinationChatService.verifyCoGiverAccess(actorUserId, wishId);
    if (access.isFailure) {
      return Result.fail(access.getError());
    }

    const msgId = `msg_${crypto.randomUUID()}`;
    const msgDomain = ChatMessage.create(
      {
        wishId,
        senderUserId: actorUserId,
        rawContent
      },
      msgId
    );

    if (msgDomain.isFailure) {
      return Result.fail(msgDomain.getError());
    }

    const msg = msgDomain.getValue();
    const db = getDb();
    await db.insert(chatMessagesTable).values({
      id: msg.id,
      wishId: msg.wishId,
      senderUserId: msg.senderUserId,
      content: msg.content,
      createdAt: msg.createdAt
    });

    const senderRows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, actorUserId))
      .limit(1);
    const sender = senderRows[0];
    const expiresAt = new Date(
      msg.createdAt.getTime() + ChatMessage.RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    return Result.ok({
      id: msg.id,
      wishId: msg.wishId,
      senderUserId: msg.senderUserId,
      senderDisplayName: sender?.displayName || 'Gavegiver',
      senderAvatarEmoji: sender?.avatarEmoji || '🎁',
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
      expiresAt: expiresAt.toISOString()
    });
  }
}
