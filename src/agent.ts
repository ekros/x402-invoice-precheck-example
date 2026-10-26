// AP agent, single invoice: pre-check one supplier invoice, then decide pay / hold / reject.
//
//   npm run quote                       # free: shows the 402 price, pays nothing
//   npm run check                       # pays 0.03 USDC on Base (needs PRIVATE_KEY in .env)
//   npm run check -- invoices/other.json
import { readFileSync } from "node:fs";
import { API_BASE, MAX_USD_PER_CALL, hasWallet, payingFetch, postJson, quote, receipt } from "./client.js";
import { decide, toPrecheckInput, type Invoice, type PrecheckResult } from "./decide.js";

const args = process.argv.slice(2);
const quoteOnly = args.includes("--quote") || !hasWallet();
const file = args.find((a) => !a.startsWith("--")) ?? "invoices/sample-invoice.json";
const invoice: Invoice = JSON.parse(readFileSync(file, "utf8"));
const url = `${API_BASE}/v1/eu/invoice/precheck`;
const init = postJson(toPrecheckInput(invoice));

const q = await quote(url, init);
console.log(`Invoice ${invoice.invoiceNumber} from ${invoice.supplier}: EUR ${invoice.amountEur.toFixed(2)}`);
console.log(`Pre-check price: $${q.usd} USDC on ${q.network} (HTTP ${q.status}, nothing paid yet)`);
if (q.status !== 402) throw new Error(`expected a 402 challenge, got HTTP ${q.status}`);
if (q.usd > MAX_USD_PER_CALL) throw new Error(`price $${q.usd} is above MAX_USD_PER_CALL=$${MAX_USD_PER_CALL}; not paying`);

if (quoteOnly) {
  console.log(hasWallet() ? "--quote: stopping before payment." : "No PRIVATE_KEY set: stopping before payment (see .env.example).");
  process.exit(0);
}

const { fetch: pay, payer } = payingFetch();
console.log(`Paying from ${payer} ...`);
const res = await pay(url, init);
if (res.status !== 200) {
  // The service only settles on HTTP 200, so a non-200 here was not charged.
  throw new Error(`pre-check failed: HTTP ${res.status} ${await res.text()}`);
}
const result = (await res.json()) as PrecheckResult;
const r = receipt(res);
console.log(`Verdict: ${result.verdict.toUpperCase()}${r?.transaction ? `  (paid, tx ${r.transaction})` : ""}`);
for (const i of result.issues) console.log(`  - ${i}`);
console.log("Decision:", JSON.stringify(decide(result), null, 2));
