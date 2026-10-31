/* Tax and commission: percent or fixed fees applied one after another to an amount */

// Size of one fee in minor units (fractions kept), taken from the amount it is applied to.
function feeSize(fee, base) {
  return fee.percent > 0 ? (base * fee.percent) / 100 : fee.value * 100;
}

// Round off floating point noise before rounding to whole minor units.
const roundMinor = (n) => Math.sign(n) * Math.round(Math.round(Math.abs(n) * 1e6) / 1e6);

// Apply fees in order. A deduction works on what the previous ones left, an addition on the
// original amount; the result never drops below zero. Only the shown sizes and the final
// result are rounded, so the pieces may differ by one unit.
// Returns the signed change of every fee and the resulting amount.
export function applyFees(amount, fees = []) {
  let running = amount;
  const steps = fees.map((fee) => {
    const size = feeSize(fee, fee.add ? amount : running);
    running += fee.add ? size : -size;
    return { fee, delta: roundMinor(fee.add ? size : -size) };
  });
  return { steps, net: Math.max(0, roundMinor(running)) };
}

// Amount that reaches the receiving side of an operation.
export const netAmount = (op) => applyFees(op.amount, op.fees).net;

// Fee of one kind ("tax" or "commission") of an operation.
export const feeOfKind = (op, kind) => op.fees?.find((fee) => fee.kind === kind) || null;

// Replace the fee of one kind; null removes it. The order of other fees is kept.
export function setFee(op, kind, fee) {
  const rest = (op.fees || []).filter((f) => f.kind !== kind);
  const index = (op.fees || []).findIndex((f) => f.kind === kind);
  if (fee) rest.splice(index < 0 ? rest.length : index, 0, { ...fee, kind });
  op.fees = rest;
}
