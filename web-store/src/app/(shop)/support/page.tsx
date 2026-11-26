import { redirect } from "next/navigation";
import { resolveActiveStoreOrDefault, storeHref } from "@/lib/tenant";

export default async function SupportRedirect() {
  const store = await resolveActiveStoreOrDefault();
  redirect(storeHref(store.basePath, "/contact"));
}
