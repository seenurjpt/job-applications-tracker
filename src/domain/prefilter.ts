// PURE. No I/O, no db, no framework imports.
//
// Runs before any Anthropic call. Kills 80–90% of sent mail for free.
// Cheap and recall-oriented , a false positive costs a fraction of a cent,
// a false negative loses an application permanently.

const POSITIVE =
  /\b(applica(tion|nt)|applying|resume|cv|position|role|opening|vacancy|hiring|recruit(er|ment)|opportunity|candidature|job)\b/i;

export const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
]);

export const ATS_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "myworkday.com",
  "ashbyhq.com",
  "smartrecruiters.com",
  "workable.com",
  "bamboohr.com",
  "icims.com",
  "successfactors.com",
  "taleo.net",
  "naukri.com",
  "hirist.com",
];

const RECRUITING_LOCAL_PART = /^(careers|jobs|hr|recruit\w*|talent)$/i;

// Contains-match on the local part: catches no-reply, noreply, donotreply,
// notifications, jobalerts, mailer-daemon, and similar automated boxes.
const NO_REPLY_LOCAL_PART = /no-?reply|do-?not-?reply|notifications?|alerts?|mailer|newsletter/i;

function domainOf(address: string): string {
  return address.split("@")[1]?.toLowerCase() ?? "";
}

function localPartOf(address: string): string {
  const at = address.indexOf("@");
  return at === -1 ? "" : address.slice(0, at).toLowerCase();
}

export function looksLikeApplication(m: {
  subject: string;
  snippet: string;
  to: string[];
}): boolean {
  // Mail addressed only to no-reply/notification boxes is never an
  // application the user made , it's a reply to automated mail.
  if (
    m.to.length > 0 &&
    m.to.every((addr) => NO_REPLY_LOCAL_PART.test(localPartOf(addr)))
  )
    return false;

  if (POSITIVE.test(m.subject) || POSITIVE.test(m.snippet)) return true;

  const domains = m.to.map(domainOf);
  if (domains.some((d) => ATS_DOMAINS.some((a) => d === a || d.endsWith(`.${a}`))))
    return true;
  if (
    m.to.some(
      (addr) =>
        RECRUITING_LOCAL_PART.test(localPartOf(addr)) &&
        !PERSONAL_DOMAINS.has(domainOf(addr))
    )
  )
    return true;

  return false;
}
