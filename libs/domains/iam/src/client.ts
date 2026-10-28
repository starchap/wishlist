import { defineDomainI18n } from '@wishlist/i18n';
import daIam from './lib/i18n/da.json';
import enIam from './lib/i18n/en.json';

export const iamI18n = defineDomainI18n('iam', {
  da: daIam,
  en: enIam
});

export { CHIBI_AVATARS, type UserRole } from './lib/domain/models';
export type { SessionPayload } from './lib/infrastructure/security';
export type { UserDto, InviteDto } from './lib/application/IamApplicationService';
