import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decide, toPrecheckInput, type PrecheckResult } from "../src/decide.js";

const load = (k: string) => JSON.parse(readFileSync(`examples/precheck-${k}.example.json`, "utf8")) as PrecheckResult;

test("ok -> pay on the adjusted due date", () => {
  assert.deepEqual(decide(load("ok")), { action: "pay", payOn: "2026-12-02", reason: "VAT active in VIES, IBAN valid, countries match" });
});
test("review (IBAN country differs from VAT country) -> hold", () => {
  const d = decide(load("review"));
  assert.equal(d.action, "hold"); assert.match((d as any).issues[0], /IBAN country \(LT\) differs/);
});
test("fail (bad IBAN checksum) -> reject", () => {
  const d = decide(load("fail"));
  assert.equal(d.action, "reject"); assert.match((d as any).issues[0], /checksum/);
});
test("only VAT, IBAN and dates are sent to the API", () => {
  const i = { invoiceNumber: "X", supplier: "S", vatNumber: "DE811569869", iban: "DE89370400440532013000", amountEur: 9, issueDate: "2026-11-02", paymentTermDays: 30 };
  assert.deepEqual(Object.keys(toPrecheckInput(i)).sort(), ["iban", "issueDate", "paymentTermDays", "vatNumber"]);
});
