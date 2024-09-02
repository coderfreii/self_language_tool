export type Constructor = abstract new (...args: any) => any


export type GetOptional<T> = {
    [P in keyof T as T[P] extends Required<T>[P] ? never : P]: T[P]
}

export type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>


export type GetRequired<T> = {
    [P in keyof T as T[P] extends Required<T>[P] ? P : never]: T[P]
}


export type Filter<T, F extends keyof T> = {
    [P in F  as T[P] extends T[P] ? P : never]: T[P]
}


export type Flat<T> = T[keyof T] 


export type Flatten<T> = T extends object ? T[keyof T] extends object ? Flatten<T[keyof T]> : T[keyof T] : T;


export type FilterMatchingKeys<T, U extends keyof T> = {
    [K in keyof T as K extends  U ? never : K]: T[K];
};


export type ExcludeMatchingKeys<T, U> = {
    [K in keyof T as K extends keyof U ? never : K]: T[K];
};


export type PickLeftAndMerge<B, O, P extends keyof ExcludeMatchingKeys<O, B>> = PickLeft<B,O,P> & B;


export type PickLeft<B, O, P extends keyof ExcludeMatchingKeys<O, B>> = Pick<ExcludeMatchingKeys<O, B>, P>