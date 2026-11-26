export function formatOrderNumber(id: string) {
  return `\u2066#${id.slice(0, 8).toUpperCase()}\u2069`;
}
