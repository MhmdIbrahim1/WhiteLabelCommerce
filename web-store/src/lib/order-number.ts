export function formatOrderNumber(id: string) {
  return `\u2066#${id.slice(0, 8).toUpperCase()}\u2069`;
}

// The tracking form and receipt share the full, copyable UUID without display punctuation.
export function trackingReference(value: string): string | null {
  const id = value.trim().toLowerCase();
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id) ? id : null;
}
