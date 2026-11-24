import { notFound } from "next/navigation";
import { serverDb } from "@/lib/db";
import { settings } from "@/lib/shop";
import { DeliveryCard, type DeliveryInfo } from "./delivery-card";
import "./delivery.css";

export default async function DriverDeliveryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const clean = decodeURIComponent(token || "").trim();
  if (clean.length < 24) notFound();

  const db = await serverDb();
  const [store, deliveryRes] = await Promise.all([
    settings(),
    db
      .rpc("get_delivery_by_token", { p_token: clean })
      .maybeSingle<DeliveryInfo>(),
  ]);

  if (deliveryRes.error || !deliveryRes.data) notFound();

  return (
    <DeliveryCard
      token={clean}
      storeName={store.name}
      info={deliveryRes.data}
    />
  );
}
