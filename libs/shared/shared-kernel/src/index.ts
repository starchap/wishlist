/**
 * Result<T, E> monad for Domain-Driven Design error handling without throwing raw exceptions.
 */
export class Result<T, E = string> {
  public readonly isSuccess: boolean;
  public readonly isFailure: boolean;
  private readonly _error?: E;
  private readonly _value?: T;

  private constructor(isSuccess: boolean, error?: E, value?: T) {
    this.isSuccess = isSuccess;
    this.isFailure = !isSuccess;
    this._error = error;
    this._value = value;
    Object.freeze(this);
  }

  public getValue(): T {
    if (!this.isSuccess) {
      throw new Error(`Cannot get value of a failed Result: ${String(this._error)}`);
    }
    return this._value as T;
  }

  public getError(): E {
    if (this.isSuccess) {
      throw new Error('Cannot get error of a successful Result');
    }
    return this._error as E;
  }

  public static ok<U, F = string>(value?: U): Result<U, F> {
    return new Result<U, F>(true, undefined, value);
  }

  public static fail<U, F = string>(error: F): Result<U, F> {
    return new Result<U, F>(false, error);
  }
}

/**
 * Base class for Domain Value Objects (immutable, compared by structural equality).
 */
export abstract class ValueObject<T extends Record<string, unknown>> {
  protected readonly props: Readonly<T>;

  protected constructor(props: T) {
    this.props = Object.freeze({ ...props });
  }

  public equals(vo?: ValueObject<T>): boolean {
    if (vo === null || vo === undefined) {
      return false;
    }
    return JSON.stringify(this.props) === JSON.stringify(vo.props);
  }
}

/**
 * Base class for Domain Entities (identified by unique ID).
 */
export abstract class Entity<T> {
  protected readonly _id: string;
  protected readonly props: T;

  protected constructor(props: T, id: string) {
    this._id = id;
    this.props = props;
  }

  public get id(): string {
    return this._id;
  }

  public equals(object?: Entity<T>): boolean {
    if (object === null || object === undefined) {
      return false;
    }
    if (this === object) {
      return true;
    }
    return this._id === object._id;
  }
}

/**
 * Base class for Domain Aggregate Roots.
 */
export abstract class AggregateRoot<T> extends Entity<T> {}
