import { serverDb } from "@/lib/db";
import { validPassword, matchesRequestOrigin } from "@/lib/password-policy";

export async function POST(req: Request) {
  if (!matchesRequestOrigin(req)) return Response.json({code:"origin"},{status:403});
  const db = await serverDb();
  const {data:{user}} = await db.auth.getUser();
  if (!user) return Response.json({code:"session"},{status:401});
  const body = await req.json().catch(()=>null);
  if (!validPassword(body?.password)) return Response.json({code:"invalid"},{status:400});
  const {error} = await db.auth.updateUser({password:body.password});
  return Response.json({ok:!error},{status:error ? 422 : 200});
}
