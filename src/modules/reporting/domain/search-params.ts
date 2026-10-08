export function reportSearchParams(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
) {
  if (input instanceof URLSearchParams) {
    if (new Set(input.keys()).size !== [...input.keys()].length)
      throw new RangeError("Duplicate report filters.");
    return Object.fromEntries(input);
  }
  if (Object.values(input).some(Array.isArray))
    throw new RangeError("Duplicate report filters.");
  return Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined),
  );
}
