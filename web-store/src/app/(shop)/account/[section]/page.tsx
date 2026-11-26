import { notFound } from "next/navigation";
import AccountPage from "../page";

export default async function AccountSection({params, searchParams}: PageProps<"/account/[section]">) {
  const { section } = await params;
  if (!["profile","addresses","tickets","wallet","preferences","security"].includes(section)) notFound();
  return <AccountPage searchParams={Promise.resolve({...await searchParams, section})} />;
}
