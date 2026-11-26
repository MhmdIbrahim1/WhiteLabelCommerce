import { Resolver } from "node:dns/promises";

export type DnsError = "txt_missing" | "dns_timeout" | "dns_failed";
type TxtResolver = Pick<Resolver, "resolveTxt" | "cancel">;

// Node returns one string array per TXT record. Only chunks of the same record may be joined.
export function matchesDomainTxt(records: string[][], token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  const expected = "wlc-verification=" + token;
  return records.some(chunks => chunks.join("") === expected);
}

export async function verifyDomainTxt(domain: string, token: string,
  resolver: TxtResolver = new Resolver({ timeout: 1500, tries: 1 }), deadlineMs = 2500): Promise<DnsError | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"dns_timeout">(resolve => {
    timer = setTimeout(() => {
      resolve("dns_timeout");
      resolver.cancel();
    }, deadlineMs);
  });
  try {
    const result = await Promise.race([resolver.resolveTxt("_wlc-verify." + domain + "."), deadline]);
    if (result === "dns_timeout") return result;
    return matchesDomainTxt(result, token) ? null : "txt_missing";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENODATA" || code === "ENOTFOUND") return "txt_missing";
    return code === "ETIMEOUT" || code === "ECANCELLED" ? "dns_timeout" : "dns_failed";
  } finally {
    clearTimeout(timer);
  }
}
