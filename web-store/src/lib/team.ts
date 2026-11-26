import type { Lang } from "./i18n";

export const permissionNames = {
  manage_products: { en: "Products and catalog", ar: "المنتجات والكتالوج" },
  manage_orders: { en: "Orders and returns", ar: "الطلبات والمرتجعات" },
  manage_customers: { en: "Customers and support", ar: "العملاء والدعم" },
  manage_settings: { en: "Store settings", ar: "إعدادات المتجر" },
  manage_domains: { en: "Domains", ar: "النطاقات" },
  manage_billing: { en: "Billing", ar: "الفوترة" },
  manage_staff: { en: "Team management", ar: "إدارة الفريق" },
  manage_mobile_app: { en: "Mobile app", ar: "تطبيق الجوال" },
} as const;
export type Permission = keyof typeof permissionNames;
export type Permissions = Partial<Record<Permission, true>>;
export const permissionKeys = Object.keys(permissionNames) as Permission[];
export const roleNames = {
  owner: { en: "Owner", ar: "مالك" }, manager: { en: "Manager", ar: "مدير" },
  orders: { en: "Order specialist", ar: "مسؤول الطلبات" }, catalog: { en: "Catalog specialist", ar: "مسؤول الكتالوج" },
  custom: { en: "Custom role", ar: "دور مخصص" },
} as const;
export type TeamRole = keyof typeof roleNames;
export function preset(role: TeamRole): Permissions {
  switch (role) {
    case "owner": return Object.fromEntries(permissionKeys.map(key => [key, true]));
    case "manager": return Object.fromEntries(permissionKeys.filter(key => key !== "manage_billing").map(key => [key, true]));
    case "orders": return { manage_orders: true };
    case "catalog": return { manage_products: true };
    case "custom": return {};
  }
}
export function readPermissions(value: unknown): Permissions | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result: Permissions = {};
  for (const [key, flag] of Object.entries(value)) {
    if (!Object.hasOwn(permissionNames, key) || flag !== true) return null;
    result[key as Permission] = true;
  }
  return result;
}
export type Assignment = { role: TeamRole; permissions: Permissions };
export function readAssignment(role: unknown, permissions: unknown): Assignment | null {
  if (typeof role !== "string" || !Object.hasOwn(roleNames, role)) return null;
  const parsed = readPermissions(permissions);
  if (!parsed) return null;
  const expected = preset(role as TeamRole);
  if (role !== "custom" && permissionKeys.some(k => expected[k] !== parsed[k])) return null;
  return { role: role as TeamRole, permissions: parsed };
}
export type TeamActor = { id: string; owner: boolean; permissions: Permissions };
export type TeamMember = Assignment & { id: string; email: string | null };
export type TeamInvite = Assignment & { id: string; email: string; expires_at: string; expired: boolean };
export type TeamSnapshot = { used: number; cap: number | null; members: TeamMember[]; invites: TeamInvite[] };
export function canDelegate(actor: TeamActor, assignment: Assignment) {
  return Boolean(actor.permissions.manage_staff && (assignment.role !== "owner" || actor.owner)
    && permissionKeys.every(k => !assignment.permissions[k] || actor.permissions[k]));
}
export function canEditMember(actor: TeamActor, target: TeamMember, owners: number) {
  if (target.role === "owner") return owners > 1 && actor.owner && canDelegate(actor, target);
  return target.id !== actor.id && canDelegate(actor, target);
}
export function normalizeInviteEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return normalized.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) ? normalized : null;
}
export function validInviteToken(token: unknown): token is string {
  return typeof token === "string" && token.length === 64 && /^[a-f0-9]+$/.test(token);
}

export const notificationPermissions = ["manage_customers", "manage_orders", "manage_products"] as const;
export function canManageNotifications(permissions: Permissions) {
  return notificationPermissions.every(key => permissions[key]);
}

const sectionPermissions: Record<string, Permission> = {
  products: "manage_products", reviews: "manage_products", coupons: "manage_products",
  orders: "manage_orders", returns: "manage_orders", customers: "manage_customers",
  tickets: "manage_customers", support: "manage_customers", notifications: "manage_customers",
  "abandoned-carts": "manage_customers", marketing: "manage_settings", customizer: "manage_settings",
  settings: "manage_settings", "mobile-app": "manage_mobile_app", billing: "manage_billing", team: "manage_staff",
};
export function canOpenAdmin(path: string, permissions: Permissions) {
  if (path === "/admin" || path === "/admin/restricted") return true;
  if (path === "/admin/notifications") return canManageNotifications(permissions);
  if (path === "/admin/settings/domains") return Boolean(permissions.manage_domains);
  const section = path.split("/")[2];
  return path.startsWith("/admin/") && Object.hasOwn(sectionPermissions, section) && Boolean(permissions[sectionPermissions[section]]);
}
export function canSeeOverview(permissions: Permissions) {
  return Boolean(permissions.manage_orders && permissions.manage_products && permissions.manage_customers && permissions.manage_settings);
}
export function inviteDate(value: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}
