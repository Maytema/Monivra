/* The two amounts of an operation between different currencies */

// The side that fills in the other one. It is the side typed last; the other side can be typed
// freely without changing it. Once the leading side is empty, the side being typed takes over.
export function leadingSide(leader, typed, amounts) {
  return typed === leader || amounts[leader] === 0 ? typed : leader;
}
