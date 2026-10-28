import { defineDomainI18n } from '@wishlist/i18n';
import daChat from './lib/i18n/da.json';
import enChat from './lib/i18n/en.json';

export const coordinationChatI18n = defineDomainI18n('coordinationChat', {
  da: daChat,
  en: enChat
});

export { ALLOWED_QUICK_EMOJIS } from './lib/domain/models';
export type { ChatMessageDto } from './lib/application/CoordinationChatService';
