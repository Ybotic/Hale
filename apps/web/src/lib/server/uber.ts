import "server-only";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type UberQuote = {
  productId: string;
  name: string;
  estimate: string;
  lowEstimate: number | null;
  highEstimate: number | null;
  currency: string | null;
  durationSeconds: number | null;
  distanceMiles: number | null;
};

export class UberApiError extends Error {
  constructor(readonly status: number, message = "Uber estimates are unavailable.") {
    super(message);
    this.name = "UberApiError";
  }
}

export function uberConfigured() {
  return Boolean(process.env.UBER_SERVER_TOKEN || process.env.UBER_ACCESS_TOKEN);
}

function numeric(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function getUberPriceEstimates(input: {
  pickup: { latitude: number; longitude: number };
  dropoff: { latitude: number; longitude: number };
  fetcher?: Fetcher;
}): Promise<UberQuote[]> {
  const serverToken = process.env.UBER_SERVER_TOKEN;
  const accessToken = process.env.UBER_ACCESS_TOKEN;
  if (!serverToken && !accessToken) throw new UberApiError(503, "Uber estimates are not configured on the server.");

  const url = new URL("https://api.uber.com/v1.2/estimates/price");
  url.searchParams.set("start_latitude", String(input.pickup.latitude));
  url.searchParams.set("start_longitude", String(input.pickup.longitude));
  url.searchParams.set("end_latitude", String(input.dropoff.latitude));
  url.searchParams.set("end_longitude", String(input.dropoff.longitude));
  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(url, {
      headers: {
        Authorization: serverToken ? `Token ${serverToken}` : `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
  } catch {
    throw new UberApiError(502, "Could not reach Uber. Check the connection and try again.");
  }
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? "Uber rejected the configured token or this app has not been approved for price estimates."
      : response.status === 429 ? "Uber is rate-limiting estimates. Wait a moment and try again."
        : "Uber could not return a fare estimate for this route.";
    throw new UberApiError(response.status, message);
  }
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new UberApiError(502, "Uber returned an unreadable estimate response."); }
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { prices?: unknown }).prices)) {
    throw new UberApiError(502, "Uber returned an invalid estimate list.");
  }
  return (payload as { prices: unknown[] }).prices.flatMap((item): UberQuote[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.estimate !== "string") return [];
    return [{
      productId: typeof row.product_id === "string" ? row.product_id.slice(0, 128) : "",
      name: (typeof row.localized_display_name === "string" ? row.localized_display_name : typeof row.display_name === "string" ? row.display_name : "Uber ride").slice(0, 80),
      estimate: row.estimate.slice(0, 80),
      lowEstimate: numeric(row.low_estimate),
      highEstimate: numeric(row.high_estimate),
      currency: typeof row.currency_code === "string" && /^[A-Z]{3}$/.test(row.currency_code) ? row.currency_code : null,
      durationSeconds: numeric(row.duration),
      distanceMiles: numeric(row.distance),
    }];
  }).slice(0, 30);
}
