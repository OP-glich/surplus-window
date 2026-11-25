export class Problem extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function fail(status, code, message) { throw new Problem(status, code, message); }
export function positiveQuantity(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail(400, 'invalid_quantity', 'Enter a positive whole quantity within the safe integer range.');
  return value;
}
export function validText(value, name, limit) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit)
    fail(400, 'invalid_field', 'Enter a valid ' + name + ' (up to ' + limit + ' characters).');
  return value.trim();
}
