/**
 * Constrains `T` to be a subset (or the whole) of `K`, while preserving the narrower type `T`.
 * Useful for verifying that a literal object type satisfies a broader shape without widening it.
 */
export type Subset<K, T extends K> = T;

/**
 * Extracts the element type of an array type `A`.
 * If `A` is not an array, resolves to `never`.
 */
export type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;

/**
 * Extracts the scalar (element) type from an array type `A`, or returns `A` unchanged if it is not an array.
 */
export type ExtractScalar<A> = A extends readonly (infer T)[] ? T : A;

/**
 * A type representing any value that is not an array (objects, strings, bigints, numbers, or booleans).
 * Excludes arrays by disallowing a `length` property.
 */
export type NonArray = (object | string | bigint | number | boolean) & { length?: never; };

/**
 * Extracts the keys of `T` whose values are assignable to `V`.
 */
export type KeysMatching<T, V> = {[K in keyof T]-?: T[K] extends V ? K : never}[keyof T];

/**
 * Makes the properties of `T` listed in `K` optional, while keeping all other properties as-is.
 */
export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

/**
 * Constructs a type based on `T` where at least one of the properties in `Keys` (defaults to all keys of `T`)
 * must be present, while the rest of `Keys` remain optional. Properties not in `Keys` are unchanged.
 */
export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> =
  Pick<T, Exclude<keyof T, Keys>>
  & {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>
  }[Keys];

/**
 * Constructs a type based on `T` where exactly one of the properties in `Keys` (defaults to all keys of `T`)
 * must be present, and all other properties in `Keys` are forced to be `undefined`. Properties not in `Keys`
 * are unchanged.
 */
export type RequireOnlyOne<T, Keys extends keyof T = keyof T> =
  Pick<T, Exclude<keyof T, Keys>>
  & {
    [K in Keys]-?:
      Required<Pick<T, K>>
      & Partial<Record<Exclude<Keys, K>, undefined>>
  }[Keys]

/**
 * Represents a file's name and size, in bytes.
 */
export type FileAndSize = {name: string, size: number};
