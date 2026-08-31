// PURE. No I/O, no db, no framework imports.
//
// Privacy boundary for everything sent to the AI model: stored data stays
// intact, but text crossing the wire to Anthropic is masked first.
//  - email addresses  → first letter + ***@domain (domain kept: it is the
//    ATS/company signal classification depends on)
//  - URLs             → [link]   (links often embed tracking/auth tokens)
//  - phone numbers    → [phone]
//  - long ID numbers  → [number] (8+ digit runs: candidate IDs, references)
// Dates (2026-08-31, 8/31/2026) are deliberately preserved.

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
const EMAIL_RE = /\b([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
// Digit runs joined by spaces, dots, dashes, parens; "/" excluded so
// slash-dates never match. Candidates are verified in the replacer.
const PHONE_CANDIDATE_RE = /[+(]?\d[\d\s().-]{6,}\d/g;
const DATE_LIKE_RE =
  /^(\d{4}[-.]\d{1,2}[-.]\d{1,2}|\d{1,2}[-.]\d{1,2}[-.]\d{2,4})$/;
const LONG_NUMBER_RE = /\b\d{8,}\b/g;

/** Masks PII in free text bound for the AI model. Idempotent. */
export function redactForModel(text: string): string {
  return text
    .replace(URL_RE, "[link]")
    .replace(EMAIL_RE, "$1***@$2")
    .replace(PHONE_CANDIDATE_RE, (match) => {
      const trimmed = match.trim();
      if (DATE_LIKE_RE.test(trimmed)) return match;
      // Bare digit runs with no +/formatting read as IDs, not phones ,
      // LONG_NUMBER_RE below masks them as [number].
      if (/^\d+$/.test(trimmed)) return match;
      const digits = trimmed.replace(/\D/g, "");
      // Real phone numbers have 8–15 digits; shorter runs (years, counts)
      // pass through untouched.
      return digits.length >= 8 && digits.length <= 15 ? "[phone]" : match;
    })
    .replace(LONG_NUMBER_RE, "[number]");
}

/** Masks an email address while keeping its domain: "hr@acme.com" → "h***@acme.com". */
export function maskEmailAddress(address: string): string {
  return address.replace(EMAIL_RE, "$1***@$2");
}
