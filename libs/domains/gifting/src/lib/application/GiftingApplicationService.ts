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
import { GiftPledge, type PledgeType } from '../domain/models';

export type WishGiftStatus = 'available' | 'co_giving_open' | 'fully_reserved';

export interface GiftGiverDto {
  userId: string;
  displayName: string;
  avatarEmoji: string;
  quantityPledged: number;
  pledgeType: PledgeType;
  amountDkk: number | null;
  percentShare: number | null;
  effectiveAmountDkk: number | null;
  effectivePercent: number | null;
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
  viewerPledge: GiftGiverDto | null;
  status: WishGiftStatus;
  givers: GiftGiverDto[];
  totalPledgedDkk: number;
  totalPledgedPercent: number;
  remainingDkk: number | null;
  remainingPercent: number;
  /** True for any non-owner viewer so people can coordinate or start a dialogue */
  canAccessCoGiverChat: boolean;
  /** True when viewer is a giver or has participated in this wish's chat */
  isViewerInvolvedInChat: boolean;
  chatMessageCount: number;
  latestChatMessage: LatestChatMessagePreviewDto | null;
}

export class GiftingApplicationService {
  /**
   * Upserts or removes a gift pledge (Full gift, Partial DKK amount, or Partial Percentage).
   */
  public static async saveGiftPledge(
    actorUserId: string,
    params: {
      wishId: string;
      action?: 'upsert' | 'remove' | 'toggle';
      pledgeType?: PledgeType;
      amountDkk?: number | null;
      percentShare?: number | null;
      quantity?: number;
    }
  ): Promise<Result<{ pledged: boolean }>> {
    const db = getDb();
    const wishRows = await db
      .select()
      .from(wishesTable)
      .where(eq(wishesTable.id, params.wishId))
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

    const existing = await db
      .select()
      .from(giftPledgesTable)
      .where(
        and(
          eq(giftPledgesTable.wishId, params.wishId),
          eq(giftPledgesTable.giverUserId, actorUserId)
        )
      )
      .limit(1);

    if (params.action === 'remove' || (params.action === 'toggle' && existing.length > 0)) {
      if (existing.length > 0) {
        await db.delete(giftPledgesTable).where(eq(giftPledgesTable.id, existing[0].id));
      }
      return Result.ok({ pledged: false });
    }

    const pledgeType: PledgeType = params.pledgeType || 'full';
    const amountDkk =
      pledgeType === 'partial_amount' && params.amountDkk != null
        ? Math.round(Number(params.amountDkk))
        : null;
    const percentShare =
      pledgeType === 'partial_percent' && params.percentShare != null
        ? Math.round(Number(params.percentShare))
        : pledgeType === 'full'
          ? 100
          : null;

    const ownerId = wlRows[0].userId;
    const pledgeDomain = GiftPledge.create(
      {
        wishId: params.wishId,
        wishlistOwnerId: ownerId,
        giverUserId: actorUserId,
        quantityPledged: params.quantity || 1,
        pledgeType,
        amountDkk,
        percentShare,
        createdAt: new Date()
      },
      existing.length > 0 ? existing[0].id : `plg_${crypto.randomUUID()}`
    );

    if (pledgeDomain.isFailure) {
      return Result.fail(pledgeDomain.getError());
    }

    const pledge = pledgeDomain.getValue();

    if (existing.length > 0) {
      await db
        .update(giftPledgesTable)
        .set({
          quantityPledged: pledge.quantityPledged,
          pledgeType: pledge.pledgeType,
          amountDkk: pledge.amountDkk,
          percentShare: pledge.percentShare
        })
        .where(eq(giftPledgesTable.id, existing[0].id));
    } else {
      await db.insert(giftPledgesTable).values({
        id: pledge.id,
        wishId: pledge.wishId,
        giverUserId: pledge.giverUserId,
        quantityPledged: pledge.quantityPledged,
        pledgeType: pledge.pledgeType,
        amountDkk: pledge.amountDkk,
        percentShare: pledge.percentShare
      });
    }

    return Result.ok({ pledged: true });
  }

  /**
   * Backwards-compatible helper for simple toggle calls.
   */
  public static async toggleGiftPledge(
    actorUserId: string,
    wishId: string,
    quantity = 1
  ): Promise<Result<{ pledged: boolean }>> {
    return GiftingApplicationService.saveGiftPledge(actorUserId, {
      wishId,
      action: 'toggle',
      pledgeType: 'full',
      quantity
    });
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
          viewerPledge: null,
          status: 'available',
          givers: [],
          totalPledgedDkk: 0,
          totalPledgedPercent: 0,
          remainingDkk: null,
          remainingPercent: 100,
          canAccessCoGiverChat: false,
          isViewerInvolvedInChat: false,
          chatMessageCount: 0,
          latestChatMessage: null
        };
        continue;
      }

      const wishPrice = wish.priceDkk && wish.priceDkk > 0 ? wish.priceDkk : null;
      const wishPledges = pledges.filter((p) => p.wishId === wish.id);

      let rawTotalDkk = 0;
      let rawTotalPercent = 0;

      const givers: GiftGiverDto[] = wishPledges.map((p) => {
        const u = userMap.get(p.giverUserId);
        const pType: PledgeType = (p.pledgeType as PledgeType) || 'full';
        let effectiveAmountDkk: number | null = p.amountDkk ?? null;
        let effectivePercent: number | null = p.percentShare ?? null;

        if (pType === 'full') {
          effectivePercent = 100;
          effectiveAmountDkk = wishPrice;
        } else if (pType === 'partial_amount' && p.amountDkk != null) {
          effectiveAmountDkk = p.amountDkk;
          if (wishPrice) {
            effectivePercent = Math.min(100, Math.round((p.amountDkk / wishPrice) * 100));
          }
        } else if (pType === 'partial_percent' && p.percentShare != null) {
          effectivePercent = p.percentShare;
          if (wishPrice) {
            effectiveAmountDkk = Math.round((wishPrice * p.percentShare) / 100);
          }
        }

        if (effectiveAmountDkk != null) {
          rawTotalDkk += effectiveAmountDkk;
        }
        if (effectivePercent != null) {
          rawTotalPercent += effectivePercent;
        }

        return {
          userId: p.giverUserId,
          displayName: u?.displayName || 'Ukendt',
          avatarEmoji: u?.avatarEmoji || '🎁',
          quantityPledged: p.quantityPledged,
          pledgeType: pType,
          amountDkk: p.amountDkk,
          percentShare: p.percentShare,
          effectiveAmountDkk,
          effectivePercent
        };
      });

      const totalPledgedPercent = Math.min(100, rawTotalPercent);
      const totalPledgedDkk = wishPrice ? Math.min(wishPrice, rawTotalDkk) : rawTotalDkk;
      const remainingDkk = wishPrice ? Math.max(0, wishPrice - totalPledgedDkk) : null;
      const remainingPercent = Math.max(0, 100 - totalPledgedPercent);

      let status: WishGiftStatus = 'available';
      if (givers.length > 0) {
        const hasFullPledge = givers.some((g) => g.pledgeType === 'full');
        if (hasFullPledge || totalPledgedPercent >= 100 || (wishPrice && totalPledgedDkk >= wishPrice)) {
          status = 'fully_reserved';
        } else {
          status = 'co_giving_open';
        }
      }

      const viewerPledge = givers.find((g) => g.userId === viewerUserId) || null;
      const isViewerPledged = Boolean(viewerPledge);
      // Any non-owner can open the gift chat to start a dialogue or coordinate splitting a gift!
      const canAccessCoGiverChat = true;

      const wishChats = chatMessages.filter((m) => m.wishId === wish.id);
      const chatMessageCount = wishChats.length;
      const hasViewerSentMessage = wishChats.some((m) => m.senderUserId === viewerUserId);
      const isViewerInvolvedInChat =
        isViewerPledged || hasViewerSentMessage || (givers.length > 0 && chatMessageCount > 0);

      let latestChatMessage: LatestChatMessagePreviewDto | null = null;
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

      stateMap[wish.id] = {
        wishId: wish.id,
        isVisibleToViewer: true,
        isViewerPledged,
        viewerPledge,
        status,
        givers,
        totalPledgedDkk,
        totalPledgedPercent,
        remainingDkk,
        remainingPercent,
        canAccessCoGiverChat,
        isViewerInvolvedInChat,
        chatMessageCount,
        latestChatMessage
      };
    }

    return stateMap;
  }
}
