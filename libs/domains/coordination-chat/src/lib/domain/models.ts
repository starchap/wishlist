import { Entity, Result, ValueObject } from '@wishlist/shared-kernel';

export const ALLOWED_QUICK_EMOJIS = [
  '🎁',
  '✨',
  '🎉',
  '💖',
  '🌸',
  '🤫',
  '👍',
  '🙌',
  '💸',
  '🎂',
  '🎄',
  '😊'
] as const;

/**
 * Value Object enforcing that co-giver chat messages ONLY contain plain text and Unicode emojis.
 * Rejects HTML tags, URLs, and file/image embeds.
 */
export class PlainTextEmojiMessage extends ValueObject<{ text: string }> {
  public static readonly MAX_LENGTH = 500;

  private constructor(text: string) {
    super({ text });
  }

  public get text(): string {
    return this.props.text;
  }

  public static create(raw: string): Result<PlainTextEmojiMessage> {
    const trimmed = (raw || '').trim();
    if (!trimmed) {
      return Result.fail('errorEmptyMessage');
    }
    if (trimmed.length > PlainTextEmojiMessage.MAX_LENGTH) {
      return Result.fail('errorEmptyMessage');
    }

    // Disallow HTML tags (<...>) and URLs (http://, https://, www.)
    const hasHtml = /<[^>]+>/i.test(trimmed);
    const hasUrl = /(https?:\/\/|www\.)\S+/i.test(trimmed);
    const hasMarkdownImageOrLink = /!?\[[^\]]*\]\([^)]+\)/.test(trimmed);

    if (hasHtml || hasUrl || hasMarkdownImageOrLink) {
      return Result.fail('errorLinksOrHtmlNotAllowed');
    }

    // Ensure only printable characters, whitespace, punctuation, letters, numbers, and Unicode emojis/symbols
    // Strip control chars except newline
    const cleaned = trimmed.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '');
    return Result.ok(new PlainTextEmojiMessage(cleaned));
  }
}

export interface ChatMessageProps {
  wishId: string;
  senderUserId: string;
  content: PlainTextEmojiMessage;
  createdAt: Date;
}

export class ChatMessage extends Entity<ChatMessageProps> {
  public static readonly RETENTION_DAYS = 14;

  private constructor(props: ChatMessageProps, id: string) {
    super(props, id);
  }

  public get wishId(): string {
    return this.props.wishId;
  }

  public get senderUserId(): string {
    return this.props.senderUserId;
  }

  public get content(): string {
    return this.props.content.text;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public isExpired(now: Date = new Date()): boolean {
    const cutoffMs = ChatMessage.RETENTION_DAYS * 24 * 60 * 60 * 1000;
    return now.getTime() - this.props.createdAt.getTime() > cutoffMs;
  }

  public static create(
    params: {
      wishId: string;
      senderUserId: string;
      rawContent: string;
      createdAt?: Date;
    },
    id: string
  ): Result<ChatMessage> {
    const msgVo = PlainTextEmojiMessage.create(params.rawContent);
    if (msgVo.isFailure) {
      return Result.fail(msgVo.getError());
    }
    return Result.ok(
      new ChatMessage(
        {
          wishId: params.wishId,
          senderUserId: params.senderUserId,
          content: msgVo.getValue(),
          createdAt: params.createdAt ?? new Date()
        },
        id
      )
    );
  }
}
