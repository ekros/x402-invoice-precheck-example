// AP agent, payment run: pre-check up to 50 invoices in ONE paid call ($0.01 per invoice).
//
//   npm run batch -- --quote            # free: shows the total for this file, pays nothing
//   npm run batch                       # pays 0.01 USDC x invoices (needs PRIVATE_KEY in .env)
import { readFileSync } from "node:fs";
import { API_BASE, hasWallet, payingFetch, postJson, quote, receipt } from "./client.js";
import { decide, toPrecheckInput, type Invoice, type PrecheckResult } from "./decide.js";

const args = process.argv.slice(2);
const quoteOnly = args.includes("--quote") || !hasWallet();
const file = args.find((a) => !a.startsWith("--")) ?? "invoices/batch.json";
const invoices: Invoice[] = JSON.parse(readFileSync(file, "utf8"));
if (invoices.length < 1 || invoices.length > 50) throw new Error("a batch holds 1-50 invoices");

const url = `${API_BASE}/v1/eu/invoice/precheck/batch`;
const init = postJson({ items: invoices.map(toPrecheckInput) });
const maxUsd = Math.round(invoices.length * 0.01 * 100) / 100; // the price is computed from the body

const q = await quote(url, init);
console.log(`${invoices.length} invoices -> batch price $${q.usd} USDC on ${q.network} (HTTP ${q.status}, nothing paid yet)`);
if (q.status !== 402) throw new Error(`expected a 402 challenge, got HTTP ${q.status}`);
if (q.usd > maxUsd) throw new Error(`quoted $${q.usd} but expected at most $${maxUsd}; not paying`);
if (quoteOnly) { console.log("Stopping before payment."); process.exit(0); }

const { fetch: pay } = payingFetch(maxUsd);
const res = await pay(url, init);
if (res.status !== 200) throw new Error(`batch failed: HTTP ${res.status} ${await res.text()}`);
const out = (await res.json()) as { summary: Record<string, number>; results: (PrecheckResult & { index: number })[] };
console.log("Summary:", out.summary, receipt(res)?.transaction ? `(tx ${receipt(res)!.transaction})` : "");
for (const r of out.results) {
  const inv = invoices[r.index]; const d = decide(r);
  console.log(`${d.action.toUpperCase().padEnd(6)} ${inv.invoiceNumber.padEnd(12)} EUR ${inv.amountEur.toFixed(2).padStart(9)}  ${d.action === "pay" ? `on ${d.payOn}` : d.issues.join(" | ")}`);
}
