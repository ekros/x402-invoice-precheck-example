// Shared x402 plumbing: config from env, a spend-capped paying fetch, and a free price quote.
import { existsSync } from "node:fs";
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

if (existsSync(".env")) process.loadEnvFile(".env"); // Node >= 20.12, no dotenv needed

export const API_BASE = (process.env.API_BASE || "https://spain-agent-toolkit.spain-agent-toolkit.workers.dev").replace(/\/$/, "");
export const BASE_MAINNET = "eip155:8453";
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase();
export const MAX_USD_PER_CALL = Number(process.env.MAX_USD_PER_CALL || "0.03");

export const hasWallet = () => /^0x[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY || "");

/** fetch() that pays x402 challenges, but only in USDC on Base and only up to `maxUsd`. */
export function payingFetch(maxUsd = MAX_USD_PER_CALL) {
  if (!hasWallet()) throw new Error("PRIVATE_KEY is not set (see .env.example). Run with --quote to see the price without paying.");
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  const cap = BigInt(Math.round(maxUsd * 1e6)); // USDC has 6 decimals
  const client = new x402Client()
    .register("eip155:*", new ExactEvmScheme(account as any))
    // Spend guard: drop any payment option that isn't USDC on Base or costs more than the cap.
    .registerPolicy((_v, reqs) =>
      reqs.filter((r: any) => r.network === BASE_MAINNET && String(r.asset).toLowerCase() === USDC_BASE && BigInt(r.amount) <= cap));
  return { fetch: wrapFetchWithPayment(fetch, client), payer: account.address };
}

export interface Quote { status: number; usd: number; network?: string; payTo?: string }

/** Free: send the request WITHOUT payment and read the 402 challenge (price, network, payee). */
export async function quote(url: string, init?: RequestInit): Promise<Quote> {
  const res = await fetch(url, init);
  const body: any = await res.json().catch(() => ({}));
  const a = body?.accepts?.[0];
  return { status: res.status, usd: a ? Number(a.amount) / 1e6 : 0, network: a?.network, payTo: a?.payTo };
}

/** Settlement receipt (transaction hash) from the PAYMENT-RESPONSE header, if any. */
export function receipt(res: Response) {
  const h = res.headers.get("payment-response") || res.headers.get("x-payment-response");
  if (!h) return null;
  try { const r: any = decodePaymentResponseHeader(h); return { success: !!r.success, transaction: r.transaction as string | undefined }; } catch { return null; }
}

export const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
