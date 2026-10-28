import { defineDomainI18n } from '@wishlist/i18n';
import daWishlist from './lib/i18n/da.json';
import enWishlist from './lib/i18n/en.json';

export const wishlistI18n = defineDomainI18n('wishlist', {
  da: daWishlist,
  en: enWishlist
});

export * from './lib/domain/models';
export * from './lib/application/WishlistApplicationService';
