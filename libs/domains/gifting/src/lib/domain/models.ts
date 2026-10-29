import { Entity, Result } from '@wishlist/shared-kernel';

export type PledgeType = 'full' | 'partial_amount' | 'partial_percent';

export interface GiftPledgeProps {
  wishId: string;
  wishlistOwnerId: string;
  giverUserId: string;
  quantityPledged: number;
  pledgeType: PledgeType;
  amountDkk: number | null;
  percentShare: number | null;
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

  public get pledgeType(): PledgeType {
    return this.props.pledgeType;
  }

  public get amountDkk(): number | null {
    return this.props.amountDkk;
  }

  public get percentShare(): number | null {
    return this.props.percentShare;
  }

  public static create(props: GiftPledgeProps, id: string): Result<GiftPledge> {
    if (props.giverUserId === props.wishlistOwnerId) {
      return Result.fail('errorCannotPledgeOwnWish');
    }
    if (props.quantityPledged < 1) {
      return Result.fail('Quantity pledged must be >= 1');
    }
    if (props.pledgeType === 'partial_amount' && (!props.amountDkk || props.amountDkk < 1)) {
      return Result.fail('errorInvalidAmount');
    }
    if (
      props.pledgeType === 'partial_percent' &&
      (!props.percentShare || props.percentShare < 1 || props.percentShare > 100)
    ) {
      return Result.fail('errorInvalidPercent');
    }
    return Result.ok(new GiftPledge(props, id));
  }
}
