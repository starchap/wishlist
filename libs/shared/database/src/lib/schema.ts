import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index
} from 'drizzle-orm/pg-core';

/**
 * IAM Domain: Users table
 */
export const usersTable = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<'admin' | 'member'>().notNull().default('member'),
  avatarEmoji: text('avatar_emoji').notNull().default('🐣'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * IAM Domain: Unique Admin Invite Links
 */
export const inviteTokensTable = pgTable('invite_tokens', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  label: text('label').notNull(),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  redeemedByUserId: text('redeemed_by_user_id').references(() => usersTable.id, {
    onDelete: 'set null'
  }),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * Wishlist Domain: Strictly 1 Wishlist per User
 */
export const wishlistsTable = pgTable('wishlists', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * Image Processor / Wishlist Domain: Compressed <=512x512px metadata-free AVIF images
 */
export const wishImagesTable = pgTable('wish_images', {
  id: text('id').primaryKey(),
  avifBase64: text('avif_base64').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * Wishlist Domain: Wishes belonging to a Wishlist
 */
export const wishesTable = pgTable(
  'wishes',
  {
    id: text('id').primaryKey(),
    wishlistId: text('wishlist_id')
      .notNull()
      .references(() => wishlistsTable.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    quantity: integer('quantity').notNull().default(1),
    priceDkk: integer('price_dkk'),
    productUrl: text('product_url'),
    imageId: text('image_id').references(() => wishImagesTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('idx_wishes_wishlist_id').on(table.wishlistId)]
);

/**
 * Gifting Domain: Secret Gift Reservations ("Dette vil jeg gerne købe")
 */
export type PledgeType = 'full' | 'partial_amount' | 'partial_percent';

export const giftPledgesTable = pgTable(
  'gift_pledges',
  {
    id: text('id').primaryKey(),
    wishId: text('wish_id')
      .notNull()
      .references(() => wishesTable.id, { onDelete: 'cascade' }),
    giverUserId: text('giver_user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    quantityPledged: integer('quantity_pledged').notNull().default(1),
    pledgeType: text('pledge_type').$type<PledgeType>().notNull().default('full'),
    amountDkk: integer('amount_dkk'),
    percentShare: integer('percent_share'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex('uq_gift_pledge_wish_giver').on(table.wishId, table.giverUserId),
    index('idx_gift_pledges_wish_id').on(table.wishId)
  ]
);

/**
 * Coordination-Chat Domain: Co-giver chat messages (Plain text + Emojis only, 14-day TTL)
 */
export const chatMessagesTable = pgTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    wishId: text('wish_id')
      .notNull()
      .references(() => wishesTable.id, { onDelete: 'cascade' }),
    senderUserId: text('sender_user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('idx_chat_messages_wish_id').on(table.wishId),
    index('idx_chat_messages_created_at').on(table.createdAt)
  ]
);
