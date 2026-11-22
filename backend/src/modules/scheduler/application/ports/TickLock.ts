export type TickLockResult<T> =
  | { readonly acquired: true; readonly value: T }
  | { readonly acquired: false };

export interface TickLock {
  withLock<T>(fn: () => Promise<T>): Promise<TickLockResult<T>>;
}
