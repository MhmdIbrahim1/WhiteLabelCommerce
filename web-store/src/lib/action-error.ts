import "server-only";

export function actionError(error: { message: string; code?: string } | null, fallback: string, known: string[] = []) {
  console.error(fallback, error?.code ?? "missing_result");
  return known.find((code) => error?.message.includes(code)) ?? fallback;
}
