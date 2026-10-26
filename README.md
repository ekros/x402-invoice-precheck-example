# x402-invoice-precheck-example

**Pre-check an EU supplier invoice before your AI agent pays it. One HTTP call, $0.03 in USDC, no API key or account.**

This is a small TypeScript example of an accounts-payable (AP) agent. For each invoice it calls the
[Spain Agent Toolkit](https://spain-agent-toolkit.spain-agent-toolkit.workers.dev) invoice pre-check over
[x402](https://x402.org) (HTTP 402 micropayments). Based on the verdict it then **pays**, **holds**, or **rejects**.

## The problem

Invoice fraud is often boring. A real supplier's invoice arrives with the **bank details changed** ("we've moved banks,
please use this new IBAN"), or a fake supplier uses a VAT number that isn't registered. People catch some of this.
Agents that process invoices automatically need the same basic checks, in code, before money moves.

## What the check does

`POST /v1/eu/invoice/precheck` with `{ vatNumber, iban, issueDate?, paymentTermDays?, spanishTaxId? }`:

| Check | How |
|---|---|
| VAT number is active for intra-EU trade | Live lookup in the European Commission's **VIES** service (company name/address when the member state shares them) |
| IBAN is well-formed | Country length + mod-97 checksum for every IBAN country |
| **VAT country vs IBAN country** | Flags e.g. a German supplier asking to be paid into a Lithuanian account. That can be legitimate, but it's a common fraud signal |
| Spanish NIF/NIE/CIF (optional) | Checksum, and whether it matches an `ES` VAT number |
| Due date | `issueDate + paymentTermDays`, moved to the next business day using that country's public holidays; warns on terms over 60 days (EU Late Payment Directive) |

It returns `verdict: "ok" | "review" | "fail"` plus human-readable `issues`. This example maps them to:

- `ok`: **pay** on the (holiday-adjusted) due date
- `review`: **hold**, and have a human confirm the bank details through a channel you already trust
- `fail`: **reject** and send it back

What it does **not** do: it doesn't prove the IBAN belongs to that company (no bank account-name check), and it
doesn't replace your own approval policy. It is a cheap first filter, not a guarantee.

Only the VAT number, IBAN and dates are sent. Amounts and supplier names stay on your side (see `src/decide.ts`).

## Cost

| Endpoint | Price (USDC on Base) |
|---|---|
| `POST /v1/eu/invoice/precheck` (one invoice) | **$0.03** |
| `POST /v1/eu/invoice/precheck/batch` (1–50 invoices) | **$0.01 per invoice** ($0.50 max) |

You are only charged when the response is HTTP 200. Invalid input is rejected *before* payment. If VIES is down,
the call still succeeds with `verdict: "review"` rather than guessing. The client in this repo also refuses to sign
anything that isn't USDC on Base, or that costs more than `MAX_USD_PER_CALL`.

## Quickstart

Requires Node.js ≥ 20.12.

```bash
git clone https://github.com/ekros/x402-invoice-precheck-example.git
cd x402-invoice-precheck-example
npm install
npm run quote          # FREE: asks for the price (HTTP 402) and stops. No wallet needed.
npm run batch -- --quote
```

To make real calls, use a **dedicated hot wallet with only a few USDC on Base**:

```bash
cp .env.example .env   # set PRIVATE_KEY (never commit .env; it's in .gitignore)
npm run check          # single invoice, pays $0.03
npm run batch          # invoices/batch.json (3 invoices), pays $0.03 total
```

`npm test` runs the offline decision-logic tests, and `npm run typecheck` runs `tsc`.

### The code, in short

```ts
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const client = new x402Client()
  .register("eip155:*", new ExactEvmScheme(account))
  .registerPolicy((_v, reqs) => reqs.filter((r) => BigInt(r.amount) <= 30_000n)); // cap: $0.03
const pay = wrapFetchWithPayment(fetch, client);

const res = await pay("https://spain-agent-toolkit.spain-agent-toolkit.workers.dev/v1/eu/invoice/precheck", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ vatNumber: "DE811569869", iban: "LT121000011101001000", issueDate: "2026-11-02", paymentTermDays: 30 }),
});
const { verdict, issues } = await res.json(); // "review", ["IBAN country (LT) differs from VAT country (DE)..."]
```

## Sample output

**Real output** of `npm run quote` and `npm run batch -- --quote` (free, no payment), 26 Oct 2026:

```text
Invoice INV-2026-0142 from Example Supplier GmbH: EUR 4870.00
Pre-check price: $0.03 USDC on eip155:8453 (HTTP 402, nothing paid yet)
No PRIVATE_KEY set: stopping before payment (see .env.example).

3 invoices -> batch price $0.03 USDC on eip155:8453 (HTTP 402, nothing paid yet)
Stopping before payment.
```

The full real 402 challenge is in [`examples/unpaid-402.real.json`](examples/unpaid-402.real.json). Its key part:

```json
"accepts": [{ "scheme": "exact", "network": "eip155:8453", "amount": "30000",
              "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              "payTo": "0x0d04a5c463b145dab8a5a8cde22538e1bfa09e98", "maxTimeoutSeconds": 60 }]
```

**Example output (illustrative, not a captured paid call).** This is what `npm run batch` prints for
`invoices/batch.json`. The verdicts come from running the service's pre-check logic against live VIES. See
[`examples/`](examples/) for the full JSON of each case.

```text
Summary: { ok: 1, review: 1, fail: 1 } (tx 0x…)
PAY    INV-A-1001   EUR   1200.00  on 2026-12-02
HOLD   INV-B-0077   EUR   4870.00  IBAN country (LT) differs from VAT country (DE). Can be legitimate, but it is a common invoice-fraud signal: confirm bank details through a known channel.
REJECT INV-C-5531   EUR    310.50  IBAN: checksum (mod 97) failed
```

## Docs and discovery

- Machine-readable docs for agents: [`/llms.txt`](https://spain-agent-toolkit.spain-agent-toolkit.workers.dev/llms.txt)
- OpenAPI 3.1: [`/openapi.json`](https://spain-agent-toolkit.spain-agent-toolkit.workers.dev/openapi.json)
- VIES status (free): [`/status/vies`](https://spain-agent-toolkit.spain-agent-toolkit.workers.dev/status/vies)
- Listed on: [x402scan](https://www.x402scan.com/server/cb090122-d2e1-4fa8-abfc-001ad53044c3) ·
  [402 Index](https://402index.io) · [x402dash](https://api.x402dash.com/v1/endpoints?provider=spain-agent-toolkit.spain-agent-toolkit.workers.dev) ·
  the x402 Bazaar discovery extension is included in every 402 response

The same service also has Spain-specific tools (PVPC electricity prices, BOE search, business days/holidays,
NIF/CIF validation) and EU day-ahead electricity prices. See `/llms.txt`.

## Data sources and licence

VAT data comes from the European Commission's VIES service. Public holidays come from
[date-holidays](https://github.com/commenthol/date-holidays) (CC BY 3.0). The code in this example is MIT.
