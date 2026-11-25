// Use only for response fields whose Provider can serialize Java long values as strings.
export function parseResponseInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 0) return undefined;
  if (typeof value === 'string' && String(parsed) !== value) return undefined;
  return parsed;
}
