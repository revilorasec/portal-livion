export function requirePositiveNumber(value, code = 'INVALID_QUANTITY') {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

export function calculateDispatchFactor(baseBalance, dispatchCount) {
  const balance = requirePositiveNumber(baseBalance, 'BALANCE_REQUIRED');
  const count = requirePositiveNumber(dispatchCount, 'INVALID_DISPATCH_COUNT');
  if (!Number.isInteger(count)) throw new Error('INVALID_DISPATCH_COUNT');
  return Number((balance / count).toFixed(6));
}

export function calculateBaseQuantity(dispatchQuantity, factor) {
  const quantity = requirePositiveNumber(dispatchQuantity, 'INVALID_DISPATCH_QUANTITY');
  if (!Number.isInteger(quantity)) throw new Error('INVALID_DISPATCH_QUANTITY');
  return Number((quantity * requirePositiveNumber(factor, 'INVALID_DISPATCH_FACTOR')).toFixed(6));
}

export function availableDispatchUnits(balance, factor) {
  const current = Math.max(0, Number(balance) || 0);
  const unitFactor = requirePositiveNumber(factor, 'INVALID_DISPATCH_FACTOR');
  return Math.floor((current + 0.0000001) / unitFactor);
}

export function factorsMatch(currentFactor, proposedFactor, tolerance = 0.000001) {
  const current = requirePositiveNumber(currentFactor, 'INVALID_DISPATCH_FACTOR');
  const proposed = requirePositiveNumber(proposedFactor, 'INVALID_DISPATCH_FACTOR');
  return Math.abs(current - proposed) <= tolerance;
}
