export type Row<T> = T & { id: number };

export type Condition<V> =
    | V
    | { in: V[] }
    | { notIn: V[] }
    | { not: V }
    | { lt: V }
    | { lte: V }
    | { gt: V }
    | { gte: V };

export type Where<T> = { [K in keyof Row<T>]?: Condition<Row<T>[K]> };

export type Direction = "ASC" | "DESC";

export type Order<T> = Partial<Record<keyof Row<T>, Direction>>;

export interface IFindOptions<T> {
    orderBy?: Order<T>;
    limit?: number;
    offset?: number;
}
