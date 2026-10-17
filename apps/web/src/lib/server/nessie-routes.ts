import "server-only";
import type postgres from "postgres";
import { BackendError, getDb, isUuid, readJson, requireMember } from "./db";
import {
  NessieApiError,
  createNessieTransfer,
  createNessieAccount,
  createNessieCustomer,
  getNessieAccount,
  getNessieMerchant,
  listNessieAccounts,
  listNessieCustomers,
  listNessieBills,
  listNessiePurchases,
  listNessieTransfers,
  nessieConfigured,
  type NessieRecord,
} from "./nessie";

type SqlClient = ReturnType<typeof postgres>;
type RouteResult = Response | null;
type CostType = "bill" | "purchase" | "transfer";
type AccountOption = { id: string; nickname: string; type: string };
type CostItem = {
  id: string;
  type: CostType;
  label: string;
  merchant: string;
  amount: number;
  currency: string;
  date: string;
  status: string;
  merchantId?: string;
};

const unknownError = () => new BackendError("The Nessie sandbox request could not be completed.", 502);

function safeId(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[\da-z_-]{1,128}$/i.test(value)) throw new BackendError(`Choose a valid ${field}.`);
  return value;
}

function recordId(record: NessieRecord) {
  const value = record._id ?? record.id;
  return typeof value === "string" && value.length <= 128 ? value : null;
}

function stringField(record: NessieRecord, ...keys: string[]) {
  for (const key of keys) if (typeof record[key] === "string") return (record[key] as string).trim();
  return "";
}

function moneyField(record: NessieRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value) && value >= 0) return Math.round(value * 100) / 100;
  }
  return 0;
}

function accountDto(record: NessieRecord): AccountOption | null {
  const id = recordId(record);
  if (!id) return null;
  return {
    id,
    nickname: stringField(record, "nickname", "type") || "Nessie sandbox account",
    type: stringField(record, "type") || "Unknown",
  };
}

function accountCustomerId(record: NessieRecord) {
  return stringField(record, "customer_id", "customerId");
}

function amountFrom(record: NessieRecord, type: CostType) {
  if (type === "bill") return moneyField(record, "payment_amount", "amount");
  return moneyField(record, "amount", "purchase_amount");
}

function dateFrom(record: NessieRecord, type: CostType) {
  const value = type === "bill"
    ? stringField(record, "payment_date", "due_date", "date")
    : stringField(record, "purchase_date", "transaction_date", "date");
  return value || new Date(0).toISOString().slice(0, 10);
}

function sourceCost(record: NessieRecord, type: Exclude<CostType, "transfer">, merchantName?: string): CostItem | null {
  const id = recordId(record);
  if (!id) return null;
  const merchantId = stringField(record, "merchant_id", "merchantId") || undefined;
  const merchant = merchantName || stringField(record, "payee", "merchant", "nickname") || (type === "bill" ? "Nessie bill" : "Nessie purchase");
  return {
    id,
    type,
    label: stringField(record, "nickname", "description") || merchant,
    merchant,
    amount: amountFrom(record, type),
    currency: stringField(record, "currency") || "USD",
    date: dateFrom(record, type),
    status: stringField(record, "status") || "recorded",
    ...(merchantId ? { merchantId } : {}),
  };
}

function transferCost(record: NessieRecord): CostItem | null {
  const id = recordId(record);
  if (!id) return null;
  return {
    id,
    type: "transfer",
    label: stringField(record, "description") || "Peer-to-peer transfer",
    merchant: "Nessie sandbox transfer",
    amount: moneyField(record, "amount"),
    currency: stringField(record, "currency") || "USD",
    date: stringField(record, "transaction_date", "date") || new Date(0).toISOString().slice(0, 10),
    status: stringField(record, "status") || "recorded",
  };
}

async function patientAccess(subject: string, patientId: string, capability: string) {
  if (!isUuid(patientId)) throw new BackendError("Patient space unavailable.", 404);
  await requireMember(subject, patientId, capability);
  return patientId;
}

async function accountsForPatient(sql: SqlClient, patientId: string, subject: string) {
  return sql`
    SELECT id::text, account_id, customer_id, nickname, account_type
    FROM nessie_connections WHERE patient_id = ${patientId}::uuid AND subject = ${subject} LIMIT 1
  `;
}

async function availableAccounts(sql: SqlClient, patientId: string) {
  const linked = await sql`SELECT account_id FROM nessie_connections WHERE patient_id = ${patientId}::uuid`;
  const linkedIds = new Set(linked.map((row) => String(row.account_id)));
  const accounts = await listNessieAccounts();
  return accounts.map(accountDto).filter((account): account is AccountOption => account !== null && !linkedIds.has(account.id));
}

async function listAccounts(subject: string, request: Request) {
  const patientId = new URL(request.url).searchParams.get("patientId") ?? "";
  await patientAccess(subject, patientId, "sharing:manage");
  if (!nessieConfigured()) return Response.json({ configured: false, accounts: [] });
  try {
    const sql = getDb();
    const connected = (await accountsForPatient(sql, patientId, subject))[0];
    return Response.json({
      configured: true,
      connectedAccount: connected ? { id: String(connected.account_id), nickname: String(connected.nickname), type: String(connected.account_type) } : null,
      accounts: await availableAccounts(sql, patientId),
    });
  } catch (error) {
    if (error instanceof BackendError) throw error;
    if (error instanceof NessieApiError) throw unknownError();
    throw error;
  }
}

function createdRecord(value: unknown): NessieRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as NessieRecord;
  const created = record.objectCreated;
  return created && typeof created === "object" && !Array.isArray(created) ? created as NessieRecord : record;
}

async function seedFictionalAccounts(subject: string, request: Request) {
  const args = await readJson(request);
  const patientId = await patientAccess(subject, typeof args.patientId === "string" ? args.patientId : "", "sharing:manage");
  if (!nessieConfigured()) throw new BackendError("Nessie sandbox is not configured.", 503);
  const specs = [
    { firstName: "Avery", lastName: "Hale-Test-One", nickname: "Hale Demo Care Account", balance: 500 },
    { firstName: "Jordan", lastName: "Hale-Test-Two", nickname: "Hale Demo Family Account", balance: 350 },
  ];
  try {
    const [accounts, customers] = await Promise.all([listNessieAccounts(), listNessieCustomers()]);
    const output: Array<{ id: string; nickname: string; created: boolean }> = [];
    for (const spec of specs) {
      const prior = accounts.map(accountDto).find((account) => account?.nickname === spec.nickname);
      if (prior) { output.push({ id: prior.id, nickname: prior.nickname, created: false }); continue; }

      let customer = customers.find((candidate) => stringField(candidate, "first_name", "firstName") === spec.firstName
        && stringField(candidate, "last_name", "lastName") === spec.lastName);
      if (!customer) {
        const created = createdRecord(await createNessieCustomer({
          first_name: spec.firstName,
          last_name: spec.lastName,
          address: { street_number: "123", street_name: "Hale Test Street", city: "Testville", state: "CA", zip: "94103" },
        }));
        if (!created || !recordId(created)) throw new NessieApiError(502, "Nessie did not return the fictional test customer ID.");
        customer = created;
        customers.push(created);
      }
      const customerId = recordId(customer);
      if (!customerId) throw new NessieApiError(502, "Nessie returned an invalid fictional test customer.");
      const account = createdRecord(await createNessieAccount(customerId, {
        type: "Checking", nickname: spec.nickname, rewards: 0, balance: spec.balance,
      }));
      const id = account && recordId(account);
      if (!id) throw new NessieApiError(502, "Nessie did not return the fictional test account ID.");
      output.push({ id, nickname: spec.nickname, created: true });
    }
    return Response.json({ seeded: true, patientId, accounts: output, createdCount: output.filter((item) => item.created).length });
  } catch (error) {
    if (error instanceof BackendError) throw error;
    if (error instanceof NessieApiError) throw unknownError();
    throw error;
  }
}

async function connectAccount(subject: string, request: Request) {
  const args = await readJson(request);
  const patientId = await patientAccess(subject, typeof args.patientId === "string" ? args.patientId : "", "sharing:manage");
  const accountId = safeId(args.accountId, "Nessie account");
  if (!nessieConfigured()) throw new BackendError("Nessie sandbox is not configured.", 503);
  let account: NessieRecord;
  try { account = await getNessieAccount(accountId); }
  catch (error) { if (error instanceof NessieApiError) throw unknownError(); throw error; }
  if (recordId(account) !== accountId) throw new BackendError("Nessie account is unavailable.", 404);
  const customerId = accountCustomerId(account);
  if (!customerId) throw new BackendError("Nessie account has no customer link.", 422);
  const sql = getDb();
  const existing = (await accountsForPatient(sql, patientId, subject))[0];
  if (existing && String(existing.account_id) !== accountId) throw new BackendError("Unlink the current account before selecting another.", 409);
  try {
    await sql`
      INSERT INTO nessie_connections (id, patient_id, subject, account_id, customer_id, nickname, account_type, linked_at)
      VALUES (${existing ? String(existing.id) : crypto.randomUUID()}::uuid, ${patientId}::uuid, ${subject}, ${accountId}, ${customerId},
        ${stringField(account, "nickname", "type") || "Nessie sandbox account"}, ${stringField(account, "type") || "Unknown"}, ${Date.now()})
      ON CONFLICT (patient_id, subject) DO UPDATE SET customer_id = EXCLUDED.customer_id,
        nickname = EXCLUDED.nickname, account_type = EXCLUDED.account_type, linked_at = EXCLUDED.linked_at
    `;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new BackendError("That sandbox account is already linked in this patient space.", 409);
    }
    throw error;
  }
  return Response.json({ connected: true });
}

async function unlinkAccount(subject: string, request: Request) {
  const patientId = new URL(request.url).searchParams.get("patientId") ?? "";
  await patientAccess(subject, patientId, "sharing:manage");
  await getDb()`DELETE FROM nessie_connections WHERE patient_id = ${patientId}::uuid AND subject = ${subject}`;
  return Response.json({ connected: false });
}

async function careCosts(subject: string, request: Request) {
  const patientId = new URL(request.url).searchParams.get("patientId") ?? "";
  await patientAccess(subject, patientId, "sharing:manage");
  if (!nessieConfigured()) return Response.json({ configured: false, connected: false, availableAccounts: [] });
  const sql = getDb();
  const connections = await accountsForPatient(sql, patientId, subject);
  if (!connections.length) return Response.json({ configured: true, connected: false, availableAccounts: await availableAccounts(sql, patientId) });
  const connection = connections[0];
  try {
    const [account, bills, purchases, transfers, sandboxAccounts, shares, transferEvents] = await Promise.all([
      getNessieAccount(String(connection.account_id)),
      listNessieBills(String(connection.account_id)),
      listNessiePurchases(String(connection.account_id)),
      listNessieTransfers(String(connection.account_id)),
      listNessieAccounts(),
      sql`SELECT id::text, resource_type, resource_id, amount::float8, label, shared_by
        FROM care_cost_shares WHERE patient_id = ${patientId}::uuid AND connection_id = ${String(connection.id)}::uuid
        ORDER BY created_at DESC LIMIT 100`,
      sql`SELECT share_id::text, amount::float8, status FROM nessie_transfer_events
        WHERE patient_id = ${patientId}::uuid AND connection_id = ${String(connection.id)}::uuid AND share_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 100`,
    ]);
    const merchantIds = [...new Set(purchases.map((item) => stringField(item, "merchant_id", "merchantId")).filter(Boolean))].slice(0, 20);
    const merchantPairs = await Promise.all(merchantIds.map(async (id) => {
      try { return [id, await getNessieMerchant(id)] as const; }
      catch { return [id, null] as const; }
    }));
    const merchants = new Map(merchantPairs.map(([id, merchant]) => [id, merchant ? stringField(merchant, "name", "nickname") : ""]));
    return Response.json({
      configured: true,
      connected: true,
      connection: { id: String(connection.id), accountId: String(connection.account_id), nickname: String(connection.nickname), type: String(connection.account_type) },
      account: { balance: moneyField(account, "balance"), type: stringField(account, "type") || String(connection.account_type) },
      bills: bills.map((item) => sourceCost(item, "bill")).filter((item): item is CostItem => Boolean(item)).slice(0, 50),
      purchases: purchases.map((item) => {
        const merchantId = stringField(item, "merchant_id", "merchantId");
        return sourceCost(item, "purchase", merchants.get(merchantId));
      }).filter((item): item is CostItem => Boolean(item)).slice(0, 50),
      transfers: transfers.map(transferCost).filter((item): item is CostItem => Boolean(item)).slice(0, 50),
      recipients: sandboxAccounts.map(accountDto).filter((item): item is AccountOption => item !== null && item.id !== String(connection.account_id)).slice(0, 20)
        .map((item) => ({ accountId: item.id, nickname: item.nickname })),
      shares: shares.map((row) => ({ id: String(row.id), resourceType: row.resource_type as "bill" | "purchase", resourceId: String(row.resource_id), amount: Number(row.amount), label: String(row.label), canUnshare: String(row.shared_by) === subject })),
      transferEvents: transferEvents.map((row) => ({ shareId: String(row.share_id), amount: Number(row.amount), status: String(row.status) })),
    });
  } catch (error) {
    if (error instanceof NessieApiError) throw unknownError();
    throw error;
  }
}

async function sharedCosts(subject: string, request: Request) {
  const patientId = new URL(request.url).searchParams.get("patientId") ?? "";
  await patientAccess(subject, patientId, "memories:read");
  const rows = await getDb()`
    SELECT id::text, resource_type, resource_id, label, merchant_name, amount::float8, currency,
           occurred_on, status, shared_by
    FROM care_cost_shares WHERE patient_id = ${patientId}::uuid
    ORDER BY occurred_on DESC, created_at DESC LIMIT 100
  `;
  return Response.json({ configured: nessieConfigured(), items: rows.map((row) => ({
    id: String(row.id), type: row.resource_type as "bill" | "purchase", resourceId: String(row.resource_id),
    label: String(row.label), merchant: String(row.merchant_name),
    amount: Number(row.amount), currency: String(row.currency), date: String(row.occurred_on), status: String(row.status),
  })) });
}

async function resourceToShare(accountId: string, resourceType: "bill" | "purchase", resourceId: string) {
  const records = resourceType === "bill" ? await listNessieBills(accountId) : await listNessiePurchases(accountId);
  const record = records.find((item) => recordId(item) === resourceId);
  if (!record) throw new BackendError("Nessie cost item is unavailable.", 404);
  let merchant = stringField(record, "payee", "nickname", "description") || "Care cost";
  const merchantId = stringField(record, "merchant_id", "merchantId");
  if (merchantId) {
    try {
      const merchantRecord = await getNessieMerchant(merchantId);
      merchant = stringField(merchantRecord, "name", "nickname") || merchant;
    } catch { /* Keep the description returned with the Nessie transaction. */ }
  }
  const item = sourceCost(record, resourceType, merchant);
  if (!item) throw new BackendError("Nessie cost item is invalid.", 502);
  return item;
}

async function shareCost(subject: string, request: Request) {
  const args = await readJson(request);
  const patientId = await patientAccess(subject, typeof args.patientId === "string" ? args.patientId : "", "sharing:manage");
  const resourceType = args.resourceType;
  if (resourceType !== "bill" && resourceType !== "purchase") throw new BackendError("Choose a bill or purchase to share.");
  const resourceId = safeId(args.resourceId, "Nessie resource");
  if (!nessieConfigured()) throw new BackendError("Nessie sandbox is not configured.", 503);
  const sql = getDb();
  const connections = await accountsForPatient(sql, patientId, subject);
  if (!connections.length) throw new BackendError("Link a Nessie sandbox account first.", 409);
  const connection = connections[0];
  let item: CostItem;
  try { item = await resourceToShare(String(connection.account_id), resourceType, resourceId); }
  catch (error) { if (error instanceof NessieApiError) throw unknownError(); throw error; }
  const rows = await sql`
    INSERT INTO care_cost_shares (id, patient_id, connection_id, resource_type, resource_id, merchant_id, merchant_name,
      label, amount, currency, occurred_on, status, shared_by, created_at)
    VALUES (${crypto.randomUUID()}::uuid, ${patientId}::uuid, ${String(connection.id)}::uuid, ${resourceType}, ${resourceId},
      ${item.merchantId ?? null}, ${item.merchant}, ${item.label}, ${item.amount}, ${item.currency}, ${item.date}, ${item.status}, ${subject}, ${Date.now()})
    ON CONFLICT (patient_id, connection_id, resource_type, resource_id) DO UPDATE SET label = EXCLUDED.label,
      amount = EXCLUDED.amount, currency = EXCLUDED.currency, occurred_on = EXCLUDED.occurred_on,
      status = EXCLUDED.status, shared_by = EXCLUDED.shared_by, connection_id = EXCLUDED.connection_id,
      merchant_id = EXCLUDED.merchant_id, merchant_name = EXCLUDED.merchant_name
    RETURNING id::text
  `;
  return Response.json({ shared: true, shareId: String(rows[0].id) });
}

async function unshareCost(subject: string, request: Request, shareId: string) {
  const patientId = new URL(request.url).searchParams.get("patientId") ?? "";
  await patientAccess(subject, patientId, "sharing:manage");
  if (!isUuid(shareId)) throw new BackendError("Shared cost unavailable.", 404);
  await getDb()`DELETE FROM care_cost_shares WHERE id = ${shareId}::uuid AND patient_id = ${patientId}::uuid AND shared_by = ${subject}`;
  return Response.json({ shared: false });
}

async function createTransfer(subject: string, request: Request) {
  const args = await readJson(request);
  const patientId = await patientAccess(subject, typeof args.patientId === "string" ? args.patientId : "", "sharing:manage");
  if (!nessieConfigured()) throw new BackendError("Nessie sandbox is not configured.", 503);
  if (args.confirm !== true) throw new BackendError("Confirm the sandbox transfer details before sending.");
  const requestId = typeof args.requestId === "string" ? args.requestId : null;
  const shareId = typeof args.shareId === "string" ? args.shareId : null;
  if (!isUuid(requestId)) throw new BackendError("Transfer request identifier is invalid.");
  if (!isUuid(shareId)) throw new BackendError("Choose a shared care cost.");
  const recipientAccountId = safeId(args.recipientAccountId, "recipient account");
  const amount = Number(args.amount);
  if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) throw new BackendError("Enter a valid transfer amount.");
  const sql = getDb();
  const previous = await sql`SELECT id::text, provider_transfer_id, status, amount::float8, recipient_account_id
    FROM nessie_transfer_events WHERE request_id = ${requestId}::uuid LIMIT 1`;
  if (previous[0]) return Response.json({
    transferId: String(previous[0].id), providerTransferId: previous[0].provider_transfer_id ? String(previous[0].provider_transfer_id) : null,
    status: String(previous[0].status), amount: Number(previous[0].amount), recipientAccountId: String(previous[0].recipient_account_id),
  });
  const shares = await sql`SELECT s.id::text, s.amount::float8, s.label, s.connection_id::text,
      c.id::text AS owner_connection_id, c.account_id, c.customer_id
    FROM care_cost_shares s JOIN nessie_connections c ON c.id = s.connection_id
    WHERE s.id = ${shareId}::uuid AND s.patient_id = ${patientId}::uuid AND c.subject = ${subject} LIMIT 1`;
  const share = shares[0];
  if (!share) throw new BackendError("That shared cost is unavailable from your linked account.", 404);
  const activeShareTransfer = await sql`SELECT id::text, provider_transfer_id, status, amount::float8, recipient_account_id
    FROM nessie_transfer_events WHERE share_id = ${shareId}::uuid
      AND status IN ('pending', 'succeeded', 'needs_review') LIMIT 1`;
  if (activeShareTransfer[0]) return Response.json({
    transferId: String(activeShareTransfer[0].id), providerTransferId: activeShareTransfer[0].provider_transfer_id ? String(activeShareTransfer[0].provider_transfer_id) : null,
    status: String(activeShareTransfer[0].status), amount: Number(activeShareTransfer[0].amount), recipientAccountId: String(activeShareTransfer[0].recipient_account_id),
  });
  const cents = Math.round(Number(share.amount) * 100);
  const amountCents = Math.round(amount * 100);
  if (amountCents > cents) throw new BackendError("Transfer amount cannot exceed the shared cost.");
  const sourceAccountId = String(share.account_id);
  if (recipientAccountId === sourceAccountId) throw new BackendError("Choose another sandbox account.");
  let knownAccounts: NessieRecord[];
  try { knownAccounts = await listNessieAccounts(); }
  catch (error) { if (error instanceof NessieApiError) throw unknownError(); throw error; }
  if (!knownAccounts.some((account) => recordId(account) === recipientAccountId)) throw new BackendError("Choose an available Nessie sandbox account.", 404);
  const requestEventId = crypto.randomUUID();
  const now = Date.now();
  let inserted;
  try {
    inserted = await sql`
      INSERT INTO nessie_transfer_events (id, patient_id, connection_id, share_id, request_id, source_account_id,
        recipient_account_id, amount, status, created_by, created_at, updated_at)
      VALUES (${requestEventId}::uuid, ${patientId}::uuid, ${String(share.connection_id)}::uuid, ${shareId}::uuid,
        ${requestId}::uuid, ${sourceAccountId}, ${recipientAccountId}, ${amount}, 'pending', ${subject}, ${now}, ${now})
      ON CONFLICT (request_id) DO NOTHING
      RETURNING id::text
    `;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      const active = await sql`SELECT id::text, provider_transfer_id, status, amount::float8, recipient_account_id
        FROM nessie_transfer_events WHERE share_id = ${shareId}::uuid
          AND status IN ('pending', 'succeeded', 'needs_review') LIMIT 1`;
      if (active[0]) return Response.json({
        transferId: String(active[0].id), providerTransferId: active[0].provider_transfer_id ? String(active[0].provider_transfer_id) : null,
        status: String(active[0].status), amount: Number(active[0].amount), recipientAccountId: String(active[0].recipient_account_id),
      });
    }
    throw error;
  }
  if (!inserted.length) {
    const raced = await sql`SELECT id::text, provider_transfer_id, status, amount::float8, recipient_account_id
      FROM nessie_transfer_events WHERE request_id = ${requestId}::uuid LIMIT 1`;
    if (raced[0]) return Response.json({
      transferId: String(raced[0].id), providerTransferId: raced[0].provider_transfer_id ? String(raced[0].provider_transfer_id) : null,
      status: String(raced[0].status), amount: Number(raced[0].amount), recipientAccountId: String(raced[0].recipient_account_id),
    });
    throw new BackendError("Transfer request is already being processed.", 409);
  }

  try {
    const [source, destination] = await Promise.all([getNessieAccount(sourceAccountId), getNessieAccount(recipientAccountId)]);
    const sourceCustomerId = accountCustomerId(source);
    const destinationCustomerId = accountCustomerId(destination);
    if (!destinationCustomerId || destinationCustomerId === sourceCustomerId || moneyField(source, "balance") < amount) {
      throw new BackendError("Choose a different sandbox customer and an amount covered by the source account.", 409);
    }
    const result = await createNessieTransfer(sourceAccountId, {
      medium: "balance",
      payee_id: destinationCustomerId,
      transaction_date: new Date().toISOString().slice(0, 10),
      amount,
      description: `Hale sandbox contribution: ${String(share.label).slice(0, 80)}`,
    });
    const resultRecord = result && typeof result === "object" ? result as NessieRecord : {};
    const created = resultRecord.objectCreated && typeof resultRecord.objectCreated === "object" ? resultRecord.objectCreated as NessieRecord : resultRecord;
    const providerId = recordId(created);
    const status = providerId ? "succeeded" : "needs_review";
    await sql`UPDATE nessie_transfer_events SET status = ${status}, provider_transfer_id = ${providerId}, updated_at = ${Date.now()}
      WHERE id = ${requestEventId}::uuid`;
    return Response.json({ transferId: requestEventId, providerTransferId: providerId, status, amount, recipientAccountId });
  } catch (error) {
    const uncertain = !(error instanceof NessieApiError) && !(error instanceof BackendError);
    const status = uncertain || (error instanceof NessieApiError && error.status >= 500) ? "needs_review" : "failed";
    const message = status === "needs_review" ? "Nessie could not confirm the result. Check sandbox transfer activity before retrying." : "The sandbox transfer was not accepted.";
    await sql`UPDATE nessie_transfer_events SET status = ${status}, error_message = ${message}, updated_at = ${Date.now()}
      WHERE id = ${requestEventId}::uuid`;
    if (error instanceof BackendError) throw error;
    return Response.json({ transferId: requestEventId, status, amount, recipientAccountId, message }, { status: 502 });
  }
}

export async function handleNessieRoute(request: Request, path: string[], subject: string): Promise<RouteResult> {
  const method = request.method.toUpperCase();
  const route = path.join("/");
  if (route === "accounts" && method === "GET") return await listAccounts(subject, request);
  if (route === "seed" && method === "POST") return await seedFictionalAccounts(subject, request);
  if (route === "connection" && method === "POST") return await connectAccount(subject, request);
  if (route === "connection" && method === "DELETE") return await unlinkAccount(subject, request);
  if (route === "care-costs" && method === "GET") return await careCosts(subject, request);
  if (route === "shared-costs" && method === "GET") return await sharedCosts(subject, request);
  if (route === "shares" && method === "POST") return await shareCost(subject, request);
  if (path[0] === "shares" && path[1] && method === "DELETE") return await unshareCost(subject, request, path[1]);
  if (route === "transfers" && method === "POST") return await createTransfer(subject, request);
  return null;
}
