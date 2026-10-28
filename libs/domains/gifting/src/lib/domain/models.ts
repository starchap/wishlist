import { Entity, Result } from '@wishlist/shared-kernel';

export interface GiftPledgeProps {
  wishId: string;
  wishlistOwnerId: string;
  giverUserId: string;
  quantityPledged: number;
  createdAt: Date;
}

export class GiftPledge extends Entity<GiftPledgeProps> {
  private constructor(props: GiftPledgeProps, id: string) {
    super(props, id);
  }

  public get wishId(): string {
    return this.props.wishId;
  }

  public get giverUserId(): string {
    return this.props.giverUserId;
  }

  public get quantityPledged(): number {
    return this.props.quantityPledged;
  }

  public static create(props: GiftPledgeProps, id: string): Result<GiftPledge> {
    if (props.giverUserId === props.wishlistOwnerId) {
      return Result.fail('errorCannotPledgeOwnWish');
    }
    if (props.quantityPledged < 1) {
      return Result.fail('Quantity pledged must be >= 1');
    }
    return Result.ok(new GiftPledge(props, id));
  }
}
