import "server-only";

export type NessieRecord = Record<string, unknown>;

export class NessieApiError extends Error {
  constructor(readonly status: number, message = "Nessie sandbox request failed.") {
    super(message);
    this.name = "NessieApiError";
  }
}

export function nessieConfigured() {
  return Boolean(process.env.NESSIE_API_KEY);
}

function apiUrl(path: string) {
  const base = process.env.NESSIE_API_BASE_URL ?? "https://api.nessieisreal.com";
  let url: URL;
  try { url = new URL(path.replace(/^\//, ""), `${base.replace(/\/$/, "")}/`); }
  catch { throw new NessieApiError(503, "Nessie sandbox URL is not configured correctly."); }
  const allowed = (url.protocol === "https:" && url.hostname === "api.nessieisreal.com")
    || (url.protocol === "http:" && url.hostname === "api.reimaginebanking.com");
  if (!allowed || url.username || url.password) throw new NessieApiError(503, "Nessie sandbox URL is not allowed.");
  const key = process.env.NESSIE_API_KEY;
  if (!key) throw new NessieApiError(503, "Nessie sandbox is not configured.");
  url.searchParams.set("key", key);
  return url;
}

async function request(path: string, options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {}) {
  const response = await fetch(apiUrl(path), {
    method: options.method ?? "GET",
    ...(options.body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) throw new NessieApiError(response.status);
  if (response.status === 204) return null;
  try { return await response.json() as unknown; }
  catch { throw new NessieApiError(502, "Nessie sandbox returned an invalid response."); }
}

async function list(path: string): Promise<NessieRecord[]> {
  const value = await request(path);
  if (!Array.isArray(value)) throw new NessieApiError(502, "Nessie sandbox returned an invalid list.");
  return value.filter((item): item is NessieRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

export const listNessieAccounts = () => list("/accounts");
export const listNessieCustomers = () => list("/customers");
export const getNessieAccount = (accountId: string) => request(`/accounts/${encodeURIComponent(accountId)}`) as Promise<NessieRecord>;
export const createNessieCustomer = (body: Record<string, unknown>) => request("/customers", { method: "POST", body });
export const createNessieAccount = (customerId: string, body: Record<string, unknown>) =>
  request(`/customers/${encodeURIComponent(customerId)}/accounts`, { method: "POST", body });
export const listNessieBills = (accountId: string) => list(`/accounts/${encodeURIComponent(accountId)}/bills`);
export const listNessiePurchases = (accountId: string) => list(`/accounts/${encodeURIComponent(accountId)}/purchases`);
export const listNessieTransfers = (accountId: string) => list(`/accounts/${encodeURIComponent(accountId)}/transfers`);
export const getNessieMerchant = (merchantId: string) => request(`/merchants/${encodeURIComponent(merchantId)}`) as Promise<NessieRecord>;
export const createNessieTransfer = (accountId: string, body: Record<string, unknown>) =>
  request(`/accounts/${encodeURIComponent(accountId)}/transfers`, { method: "POST", body });
