import { defineDomainI18n } from '@wishlist/i18n';
import daIam from './lib/i18n/da.json';
import enIam from './lib/i18n/en.json';

export const iamI18n = defineDomainI18n('iam', {
  da: daIam,
  en: enIam
});

export * from './lib/domain/models';
export * from './lib/infrastructure/security';
export * from './lib/application/IamApplicationService';
