import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getUberPriceEstimates, UberApiError } from "../src/lib/server/uber";

const oldAccessToken = process.env.UBER_ACCESS_TOKEN;
const oldServerToken = process.env.UBER_SERVER_TOKEN;

beforeEach(() => {
  process.env.UBER_ACCESS_TOKEN = "test-access-token";
  delete process.env.UBER_SERVER_TOKEN;
});

afterEach(() => {
  if (oldAccessToken === undefined) delete process.env.UBER_ACCESS_TOKEN;
  else process.env.UBER_ACCESS_TOKEN = oldAccessToken;
  if (oldServerToken === undefined) delete process.env.UBER_SERVER_TOKEN;
  else process.env.UBER_SERVER_TOKEN = oldServerToken;
});

describe("Uber fare estimate connector", () => {
  test("uses server-side bearer credentials and returns sanitized live quote fields", async () => {
    let requestedUrl: URL | undefined;
    let requestedHeaders: Headers | undefined;
    const quotes = await getUberPriceEstimates({
      pickup: { latitude: 37.7, longitude: -122.4 },
      dropoff: { latitude: 37.8, longitude: -122.5 },
      fetcher: async (input, init) => {
        requestedUrl = new URL(String(input));
        requestedHeaders = new Headers(init?.headers);
        return Response.json({ prices: [{
          product_id: "product-1", localized_display_name: "UberX", estimate: "$13–17",
          low_estimate: 13, high_estimate: 17, currency_code: "USD", duration: 1080, distance: 6.17,
        }, { display_name: "Metered", estimate: "Metered", currency_code: null }] });
      },
    });
    expect(requestedUrl?.origin).toBe("https://api.uber.com");
    expect(requestedUrl?.pathname).toBe("/v1.2/estimates/price");
    expect(requestedUrl?.searchParams.get("start_latitude")).toBe("37.7");
    expect(requestedHeaders?.get("Authorization")).toBe("Bearer test-access-token");
    expect(quotes[0]).toMatchObject({ productId: "product-1", name: "UberX", estimate: "$13–17", lowEstimate: 13, highEstimate: 17, currency: "USD" });
    expect(quotes[1]).toMatchObject({ name: "Metered", estimate: "Metered", currency: null });
  });

  test("supports approved legacy server tokens and rejects unconfigured or denied requests", async () => {
    process.env.UBER_SERVER_TOKEN = "legacy-test-token";
    let auth = "";
    await getUberPriceEstimates({
      pickup: { latitude: 1, longitude: 2 }, dropoff: { latitude: 3, longitude: 4 },
      fetcher: async (_input, init) => { auth = new Headers(init?.headers).get("Authorization") ?? ""; return Response.json({ prices: [] }); },
    });
    expect(auth).toBe("Token legacy-test-token");
    delete process.env.UBER_SERVER_TOKEN;
    delete process.env.UBER_ACCESS_TOKEN;
    await expect(getUberPriceEstimates({ pickup: { latitude: 1, longitude: 2 }, dropoff: { latitude: 3, longitude: 4 } }))
      .rejects.toBeInstanceOf(UberApiError);
    process.env.UBER_ACCESS_TOKEN = "test-access-token";
    await expect(getUberPriceEstimates({
      pickup: { latitude: 1, longitude: 2 }, dropoff: { latitude: 3, longitude: 4 },
      fetcher: async () => new Response("", { status: 403 }),
    })).rejects.toMatchObject({ status: 403, message: expect.stringContaining("approved") });
  });
});
