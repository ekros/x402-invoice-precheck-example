# About these files

- `unpaid-402.real.json`: a **real** response captured from the live API on 26 Oct 2026. It is the free, unpaid
  `POST /v1/eu/invoice/precheck` returning the HTTP 402 challenge. No payment was made.
- `precheck-{ok,review,fail}.example.json`: **example output, not a paid production call.** It was produced by running the
  service's pre-check logic locally against the live (free) EU VIES service on 26 Oct 2026, using the inputs in
  `../invoices/batch.json`. A paid call to the API returns this same JSON shape. VIES does not return a name or address
  for German VAT numbers, so those fields are `null`.
