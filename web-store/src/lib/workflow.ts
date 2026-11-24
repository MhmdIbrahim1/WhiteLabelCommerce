export const orders: Record<string, string> = {
  pending: "قيد الانتظار",
  confirmed: "قيد المعالجة",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};
export const tickets: Record<string, string> = {
  open: "مفتوحة",
  in_progress: "قيد المتابعة",
  closed: "تم الحل",
};
export const nextOrder: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};
export const nextTicket: Record<string, string[]> = {
  open: ["in_progress"],
  in_progress: ["closed"],
  closed: [],
};
export const pageSize = 24;
export function pagination(input: string | string[] | undefined) {
  const n = Number(input);
  const page = Number.isSafeInteger(n) && n > 0 && n < 100000000 ? n : 1;
  return { page, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}
