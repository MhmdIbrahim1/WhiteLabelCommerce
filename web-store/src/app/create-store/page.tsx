import { redirect } from "next/navigation";
import { serverDb } from "@/lib/db";
import { CreateStoreWizard } from "./wizard";
import { AuthShell } from "@/components/workspace-surface";

export const dynamic = "force-dynamic";

export default async function CreateStorePage({ searchParams }: {
  searchParams: Promise<{ name?: string | string[] }>;
}) {
  const { name } = await searchParams;
  const initialName = typeof name === "string" ? name.trim().slice(0, 120) : "";
  const db = await serverDb();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) {
    const next = initialName ? "/create-store?" + new URLSearchParams({ name: initialName }) : "/create-store";
    redirect("/login?next=" + encodeURIComponent(next));
  }

  return <AuthShell wide account={user.email}><CreateStoreWizard initialName={initialName} /></AuthShell>;
}
