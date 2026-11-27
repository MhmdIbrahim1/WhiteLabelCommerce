import { OrderRecord } from "../order-record";

export default async function OrderDetails({ params, searchParams }: PageProps<"/admin/orders/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <OrderRecord id={id} print={query.print} resultCode={query.result} />;
}
