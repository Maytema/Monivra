// The two amounts of an operation between different currencies (js/domain/dual-amount.js).

export type Side = "send" | "receive";

// The side that fills in the other one: the side typed last; the other side can be typed freely
// without changing it. Once the leading side is empty, the side being typed takes over.
export const leadingSide = (leader: Side, typed: Side, amounts: Record<Side, number>): Side => (typed === leader || amounts[leader] === 0 ? typed : leader);
