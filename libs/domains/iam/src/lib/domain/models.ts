import { AggregateRoot, Entity, Result } from '@wishlist/shared-kernel';

export type UserRole = 'admin' | 'member';

export const CHIBI_AVATARS = ['☁️', '🌊', '🦋', '🐳', '❄️', '💎', '🐻‍❄️', '🐬', '✨', '🎁'] as const;

export interface UserProps {
  username: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
  avatarEmoji: string;
  createdAt: Date;
}

export class User extends AggregateRoot<UserProps> {
  private constructor(props: UserProps, id: string) {
    super(props, id);
  }

  public get username(): string {
    return this.props.username;
  }

  public get displayName(): string {
    return this.props.displayName;
  }

  public get passwordHash(): string {
    return this.props.passwordHash;
  }

  public get role(): UserRole {
    return this.props.role;
  }

  public get isAdmin(): boolean {
    return this.props.role === 'admin';
  }

  public get avatarEmoji(): string {
    return this.props.avatarEmoji;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public static create(props: UserProps, id: string): Result<User> {
    const cleanUsername = props.username.trim().toLowerCase();
    if (cleanUsername.length < 2 || cleanUsername.length > 32) {
      return Result.fail('Username must be between 2 and 32 characters');
    }
    if (!props.displayName.trim()) {
      return Result.fail('Display name is required');
    }
    return Result.ok(
      new User(
        {
          ...props,
          username: cleanUsername,
          displayName: props.displayName.trim()
        },
        id
      )
    );
  }
}

export interface InviteTokenProps {
  token: string;
  label: string;
  createdByUserId: string;
  redeemedByUserId: string | null;
  redeemedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

export class InviteToken extends Entity<InviteTokenProps> {
  private constructor(props: InviteTokenProps, id: string) {
    super(props, id);
  }

  public get token(): string {
    return this.props.token;
  }

  public get label(): string {
    return this.props.label;
  }

  public get createdByUserId(): string {
    return this.props.createdByUserId;
  }

  public get redeemedByUserId(): string | null {
    return this.props.redeemedByUserId;
  }

  public get redeemedAt(): Date | null {
    return this.props.redeemedAt;
  }

  public get expiresAt(): Date {
    return this.props.expiresAt;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public isExpired(now: Date = new Date()): boolean {
    return now.getTime() > this.props.expiresAt.getTime();
  }

  public isRedeemed(): boolean {
    return Boolean(this.props.redeemedByUserId);
  }

  public canBeRedeemed(now: Date = new Date()): boolean {
    return !this.isRedeemed() && !this.isExpired(now);
  }

  public static create(props: InviteTokenProps, id: string): Result<InviteToken> {
    if (!props.token || props.token.length < 12) {
      return Result.fail('Invite token must be at least 12 characters');
    }
    if (!props.label.trim()) {
      return Result.fail('Invite label is required');
    }
    return Result.ok(new InviteToken({ ...props, label: props.label.trim() }, id));
  }
}
