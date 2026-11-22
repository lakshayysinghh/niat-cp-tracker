/**
 * Phone normalisation (IMPLEMENTATION_PLAN.md, Section 7 "Cleaning rules"). Pure.
 *
 *   10 digits starting 6–9        -> +91 + digits
 *   11 digits starting 0          -> drop the 0, then +91
 *   12 digits starting 91 / +91…  -> +91XXXXXXXXXX
 *   + followed by 8–15 digits     -> kept as an international number
 *   anything else                 -> rejected
 */

export const PHONE_ERROR = "Phone must be a 10-digit Indian mobile number";

export type PhoneResult = { ok: true; phone: string } | { ok: false; error: string };

export function normalizePhone(raw: string | null | undefined): PhoneResult {
  const s = String(raw ?? "")
    .trim()
    .replace(/[\s\-.()[\]]/g, "");

  if (/^[6-9]\d{9}$/.test(s)) return { ok: true, phone: `+91${s}` };
  if (/^0\d{10}$/.test(s)) return { ok: true, phone: `+91${s.slice(1)}` };
  if (/^91\d{10}$/.test(s)) return { ok: true, phone: `+${s}` };
  if (/^\+91\d{10}$/.test(s)) return { ok: true, phone: s };
  if (/^\+\d{8,15}$/.test(s)) return { ok: true, phone: s };
  return { ok: false, error: PHONE_ERROR };
}
