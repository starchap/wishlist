import { defineDomainI18n } from '@wishlist/i18n';
import daGifting from './lib/i18n/da.json';
import enGifting from './lib/i18n/en.json';

export const giftingI18n = defineDomainI18n('gifting', {
  da: daGifting,
  en: enGifting
});

export * from './lib/domain/models';
export * from './lib/application/GiftingApplicationService';
