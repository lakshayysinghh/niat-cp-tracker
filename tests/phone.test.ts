import { describe, expect, it } from "vitest";
import { normalizePhone, PHONE_ERROR } from "@/lib/phone";

describe("normalizePhone", () => {
  it.each([
    ["9876543210", "+919876543210"], // 10 digits starting 6-9
    ["98765 43211", "+919876543211"], // spaces
    ["98765-43212", "+919876543212"], // hyphen
    ["98765.43213", "+919876543213"], // dots
    ["(987) 654 3214", "+919876543214"], // brackets
    ["09123456789", "+919123456789"], // leading 0
    ["919988776655", "+919988776655"], // 91 prefix
    ["+919876543210", "+919876543210"], // already normalised
    ["+91 98765 43210", "+919876543210"], // +91 with spaces
    ["+14155552671", "+14155552671"], // international kept
    ["  6000000000  ", "+916000000000"], // trimmed
  ])("%s -> %s", (raw, expected) => {
    expect(normalizePhone(raw)).toEqual({ ok: true, phone: expected });
  });

  it.each([
    "",
    "12345",
    "5876543210", // 10 digits but starts with 5
    "98765432101", // 11 digits, no leading 0
    "abc9876543210",
    "+1234567", // + with only 7 digits
    "+1234567890123456", // + with 16 digits
  ])("rejects %j", (raw) => {
    expect(normalizePhone(raw)).toEqual({ ok: false, error: PHONE_ERROR });
  });

  it("rejects null/undefined", () => {
    expect(normalizePhone(undefined).ok).toBe(false);
    expect(normalizePhone(null).ok).toBe(false);
  });
});
