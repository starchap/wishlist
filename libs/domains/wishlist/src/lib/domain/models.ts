import { AggregateRoot, Entity, Result, ValueObject } from '@wishlist/shared-kernel';

export class Quantity extends ValueObject<{ value: number }> {
  private constructor(value: number) {
    super({ value });
  }

  public get value(): number {
    return this.props.value;
  }

  public static create(raw: number): Result<Quantity> {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 1 || n > 999) {
      return Result.fail('Quantity must be between 1 and 999');
    }
    return Result.ok(new Quantity(n));
  }
}

export class PriceDkk extends ValueObject<{ amount: number | null }> {
  private constructor(amount: number | null) {
    super({ amount });
  }

  public get amount(): number | null {
    return this.props.amount;
  }

  public static create(raw?: number | null): Result<PriceDkk> {
    if (raw === null || raw === undefined || Number.isNaN(Number(raw))) {
      return Result.ok(new PriceDkk(null));
    }
    const rounded = Math.round(Number(raw));
    if (rounded < 0 || rounded > 10_000_000) {
      return Result.fail('Price must be between 0 and 10,000,000 DKK');
    }
    return Result.ok(new PriceDkk(rounded));
  }
}

export interface WishProps {
  wishlistId: string;
  title: string;
  description: string;
  quantity: Quantity;
  price: PriceDkk;
  productUrl: string | null;
  imageId: string | null;
  createdAt: Date;
}

export class Wish extends Entity<WishProps> {
  private constructor(props: WishProps, id: string) {
    super(props, id);
  }

  public get wishlistId(): string {
    return this.props.wishlistId;
  }

  public get title(): string {
    return this.props.title;
  }

  public get description(): string {
    return this.props.description;
  }

  public get quantity(): number {
    return this.props.quantity.value;
  }

  public get priceDkk(): number | null {
    return this.props.price.amount;
  }

  public get productUrl(): string | null {
    return this.props.productUrl;
  }

  public get imageId(): string | null {
    return this.props.imageId;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public static create(
    params: {
      wishlistId: string;
      title: string;
      description?: string;
      quantity?: number;
      priceDkk?: number | null;
      productUrl?: string | null;
      imageId?: string | null;
      createdAt?: Date;
    },
    id: string
  ): Result<Wish> {
    const cleanTitle = (params.title || '').trim();
    if (!cleanTitle || cleanTitle.length > 160) {
      return Result.fail('Wish title is required and must be <= 160 chars');
    }

    const qtyResult = Quantity.create(params.quantity ?? 1);
    if (qtyResult.isFailure) return Result.fail(qtyResult.getError());

    const priceResult = PriceDkk.create(params.priceDkk ?? null);
    if (priceResult.isFailure) return Result.fail(priceResult.getError());

    let validUrl: string | null = null;
    if (params.productUrl && params.productUrl.trim()) {
      try {
        validUrl = new URL(params.productUrl.trim()).toString();
      } catch {
        validUrl = null;
      }
    }

    return Result.ok(
      new Wish(
        {
          wishlistId: params.wishlistId,
          title: cleanTitle,
          description: (params.description || '').trim().slice(0, 600),
          quantity: qtyResult.getValue(),
          price: priceResult.getValue(),
          productUrl: validUrl,
          imageId: params.imageId ?? null,
          createdAt: params.createdAt ?? new Date()
        },
        id
      )
    );
  }
}

export interface WishlistProps {
  userId: string;
  title: string;
  description: string;
  updatedAt: Date;
}

export class Wishlist extends AggregateRoot<WishlistProps> {
  private constructor(props: WishlistProps, id: string) {
    super(props, id);
  }

  public get userId(): string {
    return this.props.userId;
  }

  public get title(): string {
    return this.props.title;
  }

  public get description(): string {
    return this.props.description;
  }

  public static create(props: WishlistProps, id: string): Result<Wishlist> {
    if (!props.userId) return Result.fail('Wishlist requires a userId');
    return Result.ok(new Wishlist(props, id));
  }
}
