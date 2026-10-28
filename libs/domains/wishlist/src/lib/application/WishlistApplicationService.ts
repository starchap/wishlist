import crypto from 'crypto';
import { eq, desc } from 'drizzle-orm';
import { Result } from '@wishlist/shared-kernel';
import {
  getDb,
  wishlistsTable,
  wishesTable,
  wishImagesTable,
  usersTable
} from '@wishlist/database';
import { AvifImageProcessor } from '@wishlist/image-processor';
import { Wish } from '../domain/models';

export interface WishDto {
  id: string;
  wishlistId: string;
  title: string;
  description: string;
  quantity: number;
  priceDkk: number | null;
  productUrl: string | null;
  imageId: string | null;
  imageApiUrl: string | null;
  createdAt: string;
}

export interface WishlistSummaryDto {
  id: string;
  userId: string;
  ownerUsername: string;
  ownerDisplayName: string;
  ownerAvatarEmoji: string;
  title: string;
  description: string;
  wishCount: number;
  wishes: WishDto[];
}

export class WishlistApplicationService {
  /**
   * Ensures the user has their single Wishlist, creating it if missing.
   */
  public static async ensureUserWishlist(userId: string, displayName: string): Promise<string> {
    const db = getDb();
    const existing = await db
      .select()
      .from(wishlistsTable)
      .where(eq(wishlistsTable.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      return existing[0].id;
    }

    const id = `wl_${crypto.randomUUID()}`;
    await db.insert(wishlistsTable).values({
      id,
      userId,
      title: `${displayName}s Ønskeliste`,
      description: 'Mine ønsker 🎁'
    });
    return id;
  }

  /**
   * Stores an image in Neon as a <=512x512px metadata-free AVIF.
   */
  public static async storeAvifImage(input: {
    imageBuffer?: Buffer;
    imageDataUrlOrRemoteUrl?: string;
    preProcessedAvif?: {
      avifBase64: string;
      width: number;
      height: number;
      sizeBytes: number;
    };
  }): Promise<string | null> {
    const db = getDb();

    if (input.preProcessedAvif) {
      const id = `img_${crypto.randomUUID()}`;
      await db.insert(wishImagesTable).values({
        id,
        avifBase64: input.preProcessedAvif.avifBase64,
        width: input.preProcessedAvif.width,
        height: input.preProcessedAvif.height,
        sizeBytes: input.preProcessedAvif.sizeBytes
      });
      return id;
    }

    let processedResult = null;
    if (input.imageBuffer) {
      processedResult = await AvifImageProcessor.processBuffer(input.imageBuffer);
    } else if (input.imageDataUrlOrRemoteUrl) {
      processedResult = await AvifImageProcessor.processFromUrl(input.imageDataUrlOrRemoteUrl);
    }

    if (!processedResult || processedResult.isFailure) {
      return null;
    }

    const avif = processedResult.getValue();
    const id = `img_${crypto.randomUUID()}`;
    await db.insert(wishImagesTable).values({
      id,
      avifBase64: avif.buffer.toString('base64'),
      width: avif.width,
      height: avif.height,
      sizeBytes: avif.sizeBytes
    });
    return id;
  }

  /**
   * Adds a new wish to the actor's single wishlist.
   */
  public static async addWish(
    actorUserId: string,
    actorDisplayName: string,
    params: {
      title: string;
      description?: string;
      quantity?: number;
      priceDkk?: number | null;
      productUrl?: string | null;
      imageBuffer?: Buffer;
      imageUrl?: string | null;
      preProcessedAvif?: {
        avifBase64: string;
        width: number;
        height: number;
        sizeBytes: number;
      } | null;
    }
  ): Promise<Result<WishDto>> {
    const wishlistId = await WishlistApplicationService.ensureUserWishlist(
      actorUserId,
      actorDisplayName
    );

    const imageId = await WishlistApplicationService.storeAvifImage({
      imageBuffer: params.imageBuffer,
      imageDataUrlOrRemoteUrl: params.imageUrl ?? undefined,
      preProcessedAvif: params.preProcessedAvif ?? undefined
    });

    const wishId = `wsh_${crypto.randomUUID()}`;
    const wishDomain = Wish.create(
      {
        wishlistId,
        title: params.title,
        description: params.description,
        quantity: params.quantity,
        priceDkk: params.priceDkk,
        productUrl: params.productUrl,
        imageId
      },
      wishId
    );

    if (wishDomain.isFailure) {
      return Result.fail(wishDomain.getError());
    }

    const wish = wishDomain.getValue();
    const db = getDb();
    await db.insert(wishesTable).values({
      id: wish.id,
      wishlistId: wish.wishlistId,
      title: wish.title,
      description: wish.description,
      quantity: wish.quantity,
      priceDkk: wish.priceDkk,
      productUrl: wish.productUrl,
      imageId: wish.imageId
    });

    return Result.ok({
      id: wish.id,
      wishlistId: wish.wishlistId,
      title: wish.title,
      description: wish.description,
      quantity: wish.quantity,
      priceDkk: wish.priceDkk,
      productUrl: wish.productUrl,
      imageId: wish.imageId,
      imageApiUrl: wish.imageId ? `/api/images/${wish.imageId}` : null,
      createdAt: wish.createdAt.toISOString()
    });
  }

  /**
   * Deletes a wish owned by actorUserId (and cleans up its AVIF image to save Neon storage).
   */
  public static async deleteWish(actorUserId: string, wishId: string): Promise<Result<void>> {
    const db = getDb();
    const wishRows = await db
      .select()
      .from(wishesTable)
      .where(eq(wishesTable.id, wishId))
      .limit(1);

    if (wishRows.length === 0) {
      return Result.fail('Wish not found');
    }
    const wishRow = wishRows[0];
    const wlRows = await db
      .select()
      .from(wishlistsTable)
      .where(eq(wishlistsTable.id, wishRow.wishlistId))
      .limit(1);

    if (wlRows.length === 0 || wlRows[0].userId !== actorUserId) {
      return Result.fail('Unauthorized to delete this wish');
    }

    await db.delete(wishesTable).where(eq(wishesTable.id, wishId));
    if (wishRow.imageId) {
      await db.delete(wishImagesTable).where(eq(wishImagesTable.id, wishRow.imageId));
    }

    return Result.ok();
  }

  /**
   * Returns all users' wishlists and their wishes.
   */
  public static async listAllWishlists(): Promise<WishlistSummaryDto[]> {
    const db = getDb();
    const users = await db.select().from(usersTable).orderBy(usersTable.displayName);
    const wishlists = await db.select().from(wishlistsTable);
    const allWishes = await db
      .select()
      .from(wishesTable)
      .orderBy(desc(wishesTable.createdAt));

    const result: WishlistSummaryDto[] = [];

    for (const user of users) {
      const wl = wishlists.find((w) => w.userId === user.id);
      if (!wl) continue;
      const userWishes = allWishes
        .filter((w) => w.wishlistId === wl.id)
        .map((w) => ({
          id: w.id,
          wishlistId: w.wishlistId,
          title: w.title,
          description: w.description,
          quantity: w.quantity,
          priceDkk: w.priceDkk,
          productUrl: w.productUrl,
          imageId: w.imageId,
          imageApiUrl: w.imageId ? `/api/images/${w.imageId}` : null,
          createdAt: w.createdAt.toISOString()
        }));

      result.push({
        id: wl.id,
        userId: user.id,
        ownerUsername: user.username,
        ownerDisplayName: user.displayName,
        ownerAvatarEmoji: user.avatarEmoji,
        title: wl.title,
        description: wl.description,
        wishCount: userWishes.length,
        wishes: userWishes
      });
    }

    return result;
  }

  /**
   * Retrieves the binary AVIF buffer for an image ID.
   */
  public static async getAvifImageById(
    imageId: string
  ): Promise<{ buffer: Buffer; width: number; height: number } | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(wishImagesTable)
      .where(eq(wishImagesTable.id, imageId))
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      buffer: Buffer.from(row.avifBase64, 'base64'),
      width: row.width,
      height: row.height
    };
  }
}
