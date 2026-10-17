import { afterEach, beforeEach, describe, expect, test, mock } from "bun:test";
import { createNessieAccount, createNessieCustomer, createNessieTransfer, listNessieAccounts, NessieApiError, type NessieRecord } from "../src/lib/server/nessie";

const originalFetch = globalThis.fetch;
const oldKey = process.env.NESSIE_API_KEY;
const oldBase = process.env.NESSIE_API_BASE_URL;
let calls: Array<{ url: URL; init?: RequestInit }>;
let responseBody: unknown;

beforeEach(() => {
  calls = [];
  responseBody = [];
  process.env.NESSIE_API_KEY = "nessie-test-key";
  process.env.NESSIE_API_BASE_URL = "https://api.nessieisreal.com";
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: new URL(String(input)), init });
    return Response.json(responseBody);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (oldKey === undefined) delete process.env.NESSIE_API_KEY;
  else process.env.NESSIE_API_KEY = oldKey;
  if (oldBase === undefined) delete process.env.NESSIE_API_BASE_URL;
  else process.env.NESSIE_API_BASE_URL = oldBase;
});

describe("Nessie server client", () => {
  test("authenticates account listing server-side and returns JSON resources", async () => {
    const accounts: NessieRecord[] = [{ _id: "account-1", balance: 100 }];
    responseBody = accounts;
    await expect(listNessieAccounts()).resolves.toEqual(accounts);
    expect(calls[0].url.origin).toBe("https://api.nessieisreal.com");
    expect(calls[0].url.pathname).toBe("/accounts");
    expect(calls[0].url.searchParams.get("key")).toBe("nessie-test-key");
  });

  test("creates peer transfers with a customer payee and confirmed server payload", async () => {
    responseBody = { objectCreated: { _id: "transfer-1" } };
    await createNessieTransfer("source-account", {
      medium: "balance", payee_id: "recipient-customer", transaction_date: "2026-10-16", amount: 12.5,
    });
    expect(calls[0].url.pathname).toBe("/accounts/source-account/transfers");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ payee_id: "recipient-customer", amount: 12.5 });
  });

  test("creates fictional sandbox customers and their test accounts through authenticated server requests", async () => {
    responseBody = { objectCreated: { _id: "customer-test-1" } };
    await createNessieCustomer({ first_name: "Avery", last_name: "Hale-Test-One", address: { city: "Testville" } });
    expect(calls[0].url.pathname).toBe("/customers");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ first_name: "Avery", last_name: "Hale-Test-One" });
    responseBody = { objectCreated: { _id: "account-test-1" } };
    await createNessieAccount("customer-test-1", { type: "Checking", nickname: "Hale Demo Care Account", balance: 500 });
    expect(calls[1].url.pathname).toBe("/customers/customer-test-1/accounts");
    expect(JSON.parse(String(calls[1].init?.body))).toMatchObject({ nickname: "Hale Demo Care Account", balance: 500 });
    expect(calls.every((call) => call.url.searchParams.get("key") === "nessie-test-key")).toBe(true);
  });

  test("rejects unapproved hosts and missing API keys before making a request", async () => {
    process.env.NESSIE_API_BASE_URL = "https://attacker.example";
    await expect(listNessieAccounts()).rejects.toBeInstanceOf(NessieApiError);
    expect(calls).toHaveLength(0);
    process.env.NESSIE_API_BASE_URL = "https://api.nessieisreal.com";
    delete process.env.NESSIE_API_KEY;
    await expect(listNessieAccounts()).rejects.toBeInstanceOf(NessieApiError);
    expect(calls).toHaveLength(0);
  });
});
