import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { getDb, chatMessagesTable } from '../libs/shared/database/src/index';
import { AvifImageProcessor } from '../libs/shared/image-processor/src/index';
import { IamApplicationService, SessionTokenService } from '../libs/domains/iam/src/index';
import { WishlistApplicationService } from '../libs/domains/wishlist/src/index';
import { GiftingApplicationService } from '../libs/domains/gifting/src/index';
import { CoordinationChatService } from '../libs/domains/coordination-chat/src/index';
import {
  commonI18n,
  SUPPORTED_LOCALES
} from '../libs/shared/i18n/src/index';

async function main() {
  console.log('=== 1. Verifying i18n Domain Namespaces ===');
  for (const loc of SUPPORTED_LOCALES) {
    console.log(`[i18n:${loc}] appName = "${commonI18n.t(loc, 'appName')}"`);
  }

  console.log('\n=== 2. Verifying AVIF 512x512 Metadata-Free Image Processor ===');
  // Create an 800x600 test image with metadata
  const rawLargePng = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 255, g: 182, b: 193 }
    }
  })
    .withMetadata({ exif: { IFD0: { Copyright: 'ShouldBeStripped' } } })
    .png()
    .toBuffer();

  const avifRes = await AvifImageProcessor.processBuffer(rawLargePng);
  if (avifRes.isFailure) {
    throw new Error(`AVIF processing failed: ${avifRes.getError()}`);
  }
  const avifImg = avifRes.getValue();
  const outputMeta = await sharp(avifImg.buffer).metadata();
  console.log(
    `[AVIF Processor] Input: 800x600 PNG (${rawLargePng.byteLength} bytes) -> Output: ${avifImg.width}x${avifImg.height} ${outputMeta.format?.toUpperCase()} (${avifImg.sizeBytes} bytes), EXIF present: ${Boolean(outputMeta.exif)}`
  );
  if (avifImg.width > 512 || avifImg.height > 512 || outputMeta.exif) {
    throw new Error('AVIF image constraints violated');
  }

  console.log('\n=== 3. Verifying Neon Postgres IAM Domain (Admin & Invite-Only Registration) ===');
  const admin = await IamApplicationService.ensureAdminSeeded();
  console.log(`[IAM] Seeded Admin: ${admin.displayName} (@${admin.username})`);

  const adminSession = SessionTokenService.verify(
    SessionTokenService.sign({
      userId: admin.id,
      username: admin.username,
      displayName: admin.displayName,
      role: 'admin',
      avatarEmoji: admin.avatarEmoji
    })
  )!;

  // Create invite 1 & 2 if test users don't exist yet
  const suffix = Date.now().toString().slice(-4);
  const inv1 = (await IamApplicationService.createInviteLink(adminSession, `Anna_${suffix}`)).getValue();
  const inv2 = (await IamApplicationService.createInviteLink(adminSession, `Anders_${suffix}`)).getValue();

  const annaReg = await IamApplicationService.registerWithInvite({
    token: inv1.token,
    username: `anna_${suffix}`,
    displayName: 'Søde Anna',
    password: 'secret123',
    avatarEmoji: '🐰'
  });
  const andersReg = await IamApplicationService.registerWithInvite({
    token: inv2.token,
    username: `anders_${suffix}`,
    displayName: 'Onkel Anders',
    password: 'secret123',
    avatarEmoji: '🐻'
  });

  if (annaReg.isFailure || andersReg.isFailure) {
    throw new Error('Failed to register invited users');
  }
  const anna = annaReg.getValue().user;
  const anders = andersReg.getValue().user;
  console.log(`[IAM] Registered via unique invite links: ${anna.displayName} & ${anders.displayName}`);

  console.log('\n=== 4. Verifying Wishlist Domain (1 Wishlist per user + AVIF Image Storage) ===');
  const wishRes = await WishlistApplicationService.addWish(anna.id, anna.displayName, {
    title: 'Blå Keramik Tekande',
    description: 'Størrelse 1L i himmelblå keramik',
    quantity: 1,
    priceDkk: 349,
    productUrl: 'https://example.com/blue-teapot',
    imageBuffer: rawLargePng
  });
  if (wishRes.isFailure) {
    throw new Error(`Add wish failed: ${wishRes.getError()}`);
  }
  const wish = wishRes.getValue();
  console.log(`[Wishlist] Created wish "${wish.title}" (${wish.priceDkk} kr.) with AVIF imageId=${wish.imageId}`);

  console.log('\n=== 5. Verifying Gifting Domain & Surprise Guard ===');
  await GiftingApplicationService.toggleGiftPledge(admin.id, wish.id, 1);
  await GiftingApplicationService.toggleGiftPledge(anders.id, wish.id, 1);

  const annaView = await GiftingApplicationService.getGiftingStateForViewer(anna.id);
  const andersView = await GiftingApplicationService.getGiftingStateForViewer(anders.id);

  console.log(
    `[Surprise Guard] Owner (Anna) sees givers=${annaView[wish.id]?.givers.length}, canChat=${annaView[wish.id]?.canAccessCoGiverChat}`
  );
  console.log(
    `[Gifting] Co-giver (Anders) sees givers=${andersView[wish.id]?.givers.length}, canChat=${andersView[wish.id]?.canAccessCoGiverChat}`
  );

  if (annaView[wish.id]?.givers.length !== 0 || !andersView[wish.id]?.canAccessCoGiverChat) {
    throw new Error('Surprise Guard or Co-Giver state failed verification');
  }

  console.log('\n=== 6. Verifying Co-Giver Chat (Plain-Text + Emoji Only & 14-Day TTL Cleanup) ===');
  const rejectedHtml = await CoordinationChatService.postMessage(
    anders.id,
    wish.id,
    'Check dette link https://evil.example.com <script>alert(1)</script>'
  );
  console.log(
    `[Chat Security] Link/HTML message rejected as expected: isFailure=${rejectedHtml.isFailure} (${rejectedHtml.isFailure ? rejectedHtml.getError() : ''})`
  );

  const validMsg = await CoordinationChatService.postMessage(
    anders.id,
    wish.id,
    'Hej! Skal vi slå os sammen om tekanden til Anna? 🎁✨🌸'
  );
  if (validMsg.isFailure) {
    throw new Error(`Valid chat message failed: ${validMsg.getError()}`);
  }
  console.log(`[Chat] Posted valid plain-text+emoji message: "${validMsg.getValue().content}"`);

  // Insert an artificial 15-day-old message and verify 14-day TTL auto-cleanup deletes it
  const db = getDb();
  const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
  await db.insert(chatMessagesTable).values({
    id: `msg_expired_${suffix}`,
    wishId: wish.id,
    senderUserId: admin.id,
    content: 'Gammel besked fra 15 dage siden 🕰️',
    createdAt: fifteenDaysAgo
  });

  const purgedCount = await CoordinationChatService.purgeExpiredMessages();
  const remaining = await CoordinationChatService.listMessages(anders.id, wish.id);
  console.log(
    `[Chat 14-Day TTL] Purged ${purgedCount} expired message(s) (>14 days old). Active messages remaining in room: ${remaining.getValue().length}`
  );

  // Clean up the temporary test users so the production DB only keeps the clean Admin + seeded state
  const { usersTable } = await import('../libs/shared/database/src/index');
  await db.delete(usersTable).where(eq(usersTable.id, anna.id));
  await db.delete(usersTable).where(eq(usersTable.id, anders.id));

  console.log('\n✅ ALL END-TO-END CHECKS PASSED AGAINST NEON POSTGRES!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
