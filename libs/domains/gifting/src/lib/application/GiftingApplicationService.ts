import crypto from 'crypto';
import { and, asc, eq } from 'drizzle-orm';
import { Result } from '@wishlist/shared-kernel';
import {
  getDb,
  giftPledgesTable,
  wishesTable,
  wishlistsTable,
  usersTable,
  chatMessagesTable
} from '@wishlist/database';
import { GiftPledge } from '../domain/models';

export interface GiftGiverDto {
  userId: string;
  displayName: string;
  avatarEmoji: string;
  quantityPledged: number;
}

export interface LatestChatMessagePreviewDto {
  id: string;
  senderUserId: string;
  senderDisplayName: string;
  senderAvatarEmoji: string;
  content: string;
  createdAt: string;
}

export interface WishGiftingStateDto {
  wishId: string;
  /** Strictly false when viewer is the wishlist owner! */
  isVisibleToViewer: boolean;
  isViewerPledged: boolean;
  givers: GiftGiverDto[];
  /** True when >= 2 givers want to give this same wish and viewer is one of them */
  canAccessCoGiverChat: boolean;
  chatMessageCount: number;
  latestChatMessage: LatestChatMessagePreviewDto | null;
}

export class GiftingApplicationService {
  /**
   * Toggles ("Dette vil jeg gerne købe" / unpledge) for a user on someone else's wish.
   */
  public static async toggleGiftPledge(
    actorUserId: string,
    wishId: string,
    quantity = 1
  ): Promise<Result<{ pledged: boolean }>> {
    const db = getDb();
    const wishRows = await db
      .select()
      .from(wishesTable)
      .where(eq(wishesTable.id, wishId))
      .limit(1);

    if (wishRows.length === 0) {
      return Result.fail('Wish not found');
    }

    const wlRows = await db
      .select()
      .from(wishlistsTable)
      .where(eq(wishlistsTable.id, wishRows[0].wishlistId))
      .limit(1);

    if (wlRows.length === 0) {
      return Result.fail('Wishlist not found');
    }

    const ownerId = wlRows[0].userId;
    const pledgeDomain = GiftPledge.create(
      {
        wishId,
        wishlistOwnerId: ownerId,
        giverUserId: actorUserId,
        quantityPledged: quantity,
        createdAt: new Date()
      },
      `plg_${crypto.randomUUID()}`
    );

    if (pledgeDomain.isFailure) {
      return Result.fail(pledgeDomain.getError());
    }

    const existing = await db
      .select()
      .from(giftPledgesTable)
      .where(
        and(eq(giftPledgesTable.wishId, wishId), eq(giftPledgesTable.giverUserId, actorUserId))
      )
      .limit(1);

    if (existing.length > 0) {
      await db.delete(giftPledgesTable).where(eq(giftPledgesTable.id, existing[0].id));
      return Result.ok({ pledged: false });
    }

    const pledge = pledgeDomain.getValue();
    await db.insert(giftPledgesTable).values({
      id: pledge.id,
      wishId: pledge.wishId,
      giverUserId: pledge.giverUserId,
      quantityPledged: pledge.quantityPledged
    });

    return Result.ok({ pledged: true });
  }

  /**
   * Returns a map of wishId -> WishGiftingStateDto with SURPRISE GUARD enforced!
   * If viewerUserId === wishlistOwnerId, all pledge & chat data is stripped on the server.
   */
  public static async getGiftingStateForViewer(
    viewerUserId: string
  ): Promise<Record<string, WishGiftingStateDto>> {
    const db = getDb();
    const wishes = await db.select().from(wishesTable);
    const wishlists = await db.select().from(wishlistsTable);
    const pledges = await db.select().from(giftPledgesTable);
    const users = await db.select().from(usersTable);
    const chatMessages = await db
      .select()
      .from(chatMessagesTable)
      .orderBy(asc(chatMessagesTable.createdAt));

    const userMap = new Map(users.map((u) => [u.id, u]));
    const wishlistOwnerMap = new Map(wishlists.map((wl) => [wl.id, wl.userId]));

    const stateMap: Record<string, WishGiftingStateDto> = {};

    for (const wish of wishes) {
      const ownerId = wishlistOwnerMap.get(wish.wishlistId);
      // SURPRISE GUARD: Owner NEVER receives any pledge or chat information for their own wishes!
      if (!ownerId || ownerId === viewerUserId) {
        stateMap[wish.id] = {
          wishId: wish.id,
          isVisibleToViewer: false,
          isViewerPledged: false,
          givers: [],
          canAccessCoGiverChat: false,
          chatMessageCount: 0,
          latestChatMessage: null
        };
        continue;
      }

      const wishPledges = pledges.filter((p) => p.wishId === wish.id);
      const givers: GiftGiverDto[] = wishPledges.map((p) => {
        const u = userMap.get(p.giverUserId);
        return {
          userId: p.giverUserId,
          displayName: u?.displayName || 'Ukendt',
          avatarEmoji: u?.avatarEmoji || '🎁',
          quantityPledged: p.quantityPledged
        };
      });

      const isViewerPledged = givers.some((g) => g.userId === viewerUserId);
      const canAccessCoGiverChat = isViewerPledged && givers.length >= 2;

      let chatMessageCount = 0;
      let latestChatMessage: LatestChatMessagePreviewDto | null = null;

      if (canAccessCoGiverChat) {
        const wishChats = chatMessages.filter((m) => m.wishId === wish.id);
        chatMessageCount = wishChats.length;
        if (wishChats.length > 0) {
          const last = wishChats[wishChats.length - 1];
          const sender = userMap.get(last.senderUserId);
          latestChatMessage = {
            id: last.id,
            senderUserId: last.senderUserId,
            senderDisplayName: sender?.displayName || 'Gavegiver',
            senderAvatarEmoji: sender?.avatarEmoji || '🎁',
            content: last.content,
            createdAt: last.createdAt.toISOString()
          };
        }
      }

      stateMap[wish.id] = {
        wishId: wish.id,
        isVisibleToViewer: true,
        isViewerPledged,
        givers,
        canAccessCoGiverChat,
        chatMessageCount,
        latestChatMessage
      };
    }

    return stateMap;
  }
}
