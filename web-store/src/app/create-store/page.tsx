import { redirect } from "next/navigation";
import { serverDb } from "@/lib/db";
import { CreateStoreWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function CreateStorePage() {
  const db = await serverDb();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) {
    redirect("/login?next=/create-store");
  }

  return <CreateStoreWizard userEmail={user.email ?? ""} />;
}
