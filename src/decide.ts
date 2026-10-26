// Pure decision logic: turn the API's verdict into an accounts-payable action.
// Kept separate (and dependency-free) so you can unit-test and tune it.

export type Verdict = "ok" | "review" | "fail";

export interface PrecheckResult {
  verdict: Verdict;
  issues: string[];
  vat: { normalized: string; formatValid: boolean; vies: { status: "valid" | "invalid" | "unavailable" | "skipped"; name?: string | null } };
  iban: { valid: boolean; country?: string; formatted?: string };
  countryMatch: { vatCountry: string | null; ibanCountry: string | null; match: boolean };
  dueDate?: { dueDate: string; adjusted: boolean; warnings: string[] };
}

export interface Invoice {
  invoiceNumber: string;
  supplier: string;
  vatNumber: string;
  iban: string;
  amountEur: number;
  issueDate?: string;
  paymentTermDays?: number;
}

export type Action =
  | { action: "pay"; payOn: string | null; reason: string }
  | { action: "hold"; reason: string; issues: string[] }
  | { action: "reject"; reason: string; issues: string[] };

/**
 * ok     -> schedule payment on the (holiday-adjusted) due date
 * review -> hold and ask a human to confirm bank details through a known channel
 *           (e.g. call the supplier on a number you already had, not one from the invoice)
 * fail   -> do not pay; send back to the supplier / AP team
 */
export function decide(r: PrecheckResult): Action {
  switch (r.verdict) {
    case "ok":
      return { action: "pay", payOn: r.dueDate?.dueDate ?? null, reason: "VAT active in VIES, IBAN valid, countries match" };
    case "review":
      return { action: "hold", reason: "needs human confirmation before paying", issues: r.issues };
    case "fail":
    default:
      return { action: "reject", reason: "invoice data failed validation", issues: r.issues };
  }
}

/** The fields the API needs (it never sees amounts or supplier names). */
export const toPrecheckInput = (i: Invoice) => ({
  vatNumber: i.vatNumber,
  iban: i.iban,
  ...(i.issueDate ? { issueDate: i.issueDate } : {}),
  ...(i.paymentTermDays != null ? { paymentTermDays: i.paymentTermDays } : {}),
});
