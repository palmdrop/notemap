declare const brand: unique symbol;

export type Branded<T, Name extends string> = T & { readonly [brand]: Name };
