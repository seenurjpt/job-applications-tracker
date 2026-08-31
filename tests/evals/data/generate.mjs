// One-time generator for the labelled eval set. Synthetic starter data —
// replace entries with REAL redacted threads as they accumulate; accuracy
// numbers only mean something against real mail.
// Run: node tests/evals/data/generate.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const positives = [
  { s: "Application for Senior Backend Engineer", sn: "Please find attached my resume for the Senior Backend Engineer position at Nimbus Analytics.", to: ["careers@nimbusanalytics.com"], company: "Nimbus Analytics", role: "Senior Backend Engineer", source: "direct" },
  { s: "Applying for Product Designer role", sn: "I came across the Product Designer opening at Fernwood Labs and would love to be considered.", to: ["jobs@fernwoodlabs.io"], company: "Fernwood Labs", role: "Product Designer", source: "direct" },
  { s: "Re: Application for Data Analyst", sn: "Following up on my application from two weeks ago — happy to provide anything else you need.", to: ["hr@brightpath.co"], company: "Brightpath", role: "Data Analyst", source: "direct" },
  { s: "Software Engineer II — application", sn: "Submitting my application for Software Engineer II as advertised on your careers page.", to: ["talent@corvid.systems"], company: "Corvid Systems", role: "Software Engineer II", source: "direct" },
  { s: "Application: Marketing Manager (Vireo Health)", sn: "Dear hiring team, I am excited to apply for the Marketing Manager position.", to: ["recruiting@vireohealth.com"], company: "Vireo Health", role: "Marketing Manager", source: "direct" },
  { s: "Frontend Engineer application — Halcyon", sn: "Thank you for confirming receipt. Attaching my portfolio as requested for the Frontend Engineer role.", to: ["apply@jobs.halcyon.dev"], company: "Halcyon", role: "Frontend Engineer", source: "direct" },
  { s: "Your application to Quill (Staff Engineer)", sn: "Completing my Greenhouse application for the Staff Engineer role at Quill.", to: ["no-reply@boards.greenhouse.io"], company: "Quill", role: "Staff Engineer", source: "ats" },
  { s: "Lattice Robotics — Machine Learning Engineer application", sn: "Submitted via Lever: my application for Machine Learning Engineer at Lattice Robotics.", to: ["applications@hire.lever.co"], company: "Lattice Robotics", role: "Machine Learning Engineer", source: "ats" },
  { s: "Application submitted: DevOps Engineer at Meridian", sn: "Your Workday application for DevOps Engineer at Meridian Corp has been submitted.", to: ["meridian@myworkday.com"], company: "Meridian Corp", role: "DevOps Engineer", source: "ats" },
  { s: "Re: Ashby application — QA Lead, Sundial", sn: "Adding a note to my Ashby application for the QA Lead position at Sundial.", to: ["sundial@ashbyhq.com"], company: "Sundial", role: "QA Lead", source: "ats" },
  { s: "Referred by Priya — Platform Engineer role", sn: "Priya Raman suggested I reach out about the Platform Engineer opening on your team at Coldbrook.", to: ["dev-hiring@coldbrook.io"], company: "Coldbrook", role: "Platform Engineer", source: "referral" },
  { s: "Introduction from Marcus — applying for Sales Lead", sn: "Marcus passed along your address; I'd like to formally apply for the Sales Lead role at Riverstone.", to: ["olivia@riverstone.com"], company: "Riverstone", role: "Sales Lead", contactName: "Olivia", source: "referral" },
  { s: "Application for the Android Developer position", sn: "I saw the Android Developer post on LinkedIn and am submitting my CV for consideration at Pinefield.", to: ["careers@pinefield.app"], company: "Pinefield", role: "Android Developer", source: "linkedin" },
  { s: "Following up — Security Engineer application", sn: "Checking in on the status of my Security Engineer application from March 3rd.", to: ["security-jobs@oakhaven.net"], company: "Oakhaven", role: "Security Engineer", source: "direct" },
  { s: "Candidature — Ingénieur logiciel", sn: "Veuillez trouver ci-joint mon CV pour le poste d'ingénieur logiciel chez Verdier SA.", to: ["rh@verdier.fr"], company: "Verdier SA", role: "Ingénieur logiciel", source: "direct" },
  { s: "Application for Technical Writer (contract)", sn: "Attaching writing samples and my resume for the contract Technical Writer role at Glasswing.", to: ["docs-team@glasswing.dev"], company: "Glasswing", role: "Technical Writer", source: "direct" },
  { s: "Re: Re: Application — Site Reliability Engineer", sn: "Thanks for the quick reply! Answers to your questions about my SRE application below.", to: ["sre-hiring@tundra.cloud"], company: "Tundra", role: "Site Reliability Engineer", source: "direct" },
  { s: "Junior Accountant opening — my application", sn: "I would like to apply for the Junior Accountant vacancy listed on Naukri.", to: ["careers@shardul.in"], company: "Shardul", role: "Junior Accountant", source: "direct" },
  { s: "Application for Research Scientist, Vision", sn: "Please consider my attached CV for the Research Scientist, Vision position at Heliotrope AI.", to: ["research-jobs@heliotrope.ai"], company: "Heliotrope AI", role: "Research Scientist, Vision", source: "direct" },
  { s: "Growth PM role — application + portfolio", sn: "Applying for the Growth PM role; my portfolio covers the experiments I ran at my current company.", to: ["people@daybreak.so"], company: "Daybreak", role: "Growth PM", source: "direct" },
];

const negatives = [
  { s: "Your weekly job alert: 45 new engineer roles", sn: "LinkedIn job alerts — Software Engineer roles near you.", to: ["me@example.com"] },
  { s: "We're hiring! Join our webinar", sn: "Our recruiting team is hosting a webinar about careers in tech. Register now!", to: ["me@example.com"] },
  { s: "Re: Dinner Friday?", sn: "8pm works — see you at the usual place.", to: ["sam.friend@gmail.com"] },
  { s: "Invoice #2291 — March services", sn: "Attached is the invoice for March consulting services.", to: ["accounts@clientco.com"] },
  { s: "Quick question about your open role", sn: "Hi! I'm a recruiter at TalentBridge — are you open to new opportunities? We have clients hiring engineers.", to: ["me@example.com"] },
  { s: "Great meeting you at PyConf", sn: "Wanted to stay in touch after our chat about data pipelines. Coffee sometime?", to: ["alex@bigco.com"] },
  { s: "Re: Interview availability", sn: "Tuesday 2pm works for the call about the mentorship program.", to: ["events@codementorship.org"] },
  { s: "Newsletter draft for review", sn: "Here's the April newsletter draft — the hiring section still needs numbers.", to: ["team@myside.dev"] },
  { s: "Your Amazon order has shipped", sn: "Forwarding the tracking link for the monitor.", to: ["me+notes@example.com"] },
  { s: "Resume review notes for Jordan", sn: "As promised, my feedback on your resume — the summary section needs tightening. Good luck applying!", to: ["jordan.mentee@gmail.com"] },
  { s: "Re: Apartment application documents", sn: "Attaching the signed rental application and proof of income for unit 4B.", to: ["leasing@parkview-apts.com"] },
  { s: "Speaking opportunity at DevSummit", sn: "Thanks for the invite — I'd love to give the talk on job queue design.", to: ["speakers@devsummit.io"] },
  { s: "Re: Reference for Maya", sn: "Happy to be a reference for Maya's application to your team — she's excellent.", to: ["hiring@somestartup.com"] },
  { s: "Freelance proposal: landing page rebuild", sn: "Here's my proposal and quote for the landing page project.", to: ["dana@smallbiz.shop"] },
  { s: "Course enrollment confirmation needed", sn: "Following up on my enrollment application for the ML certificate program.", to: ["admissions@university.edu"] },
  { s: "Team offsite planning", sn: "Poll for offsite dates — also we should discuss the open headcount and hiring plan.", to: ["team@myside.dev"] },
  { s: "Re: Your candidacy — scheduling", sn: "Confirming Thursday 11am for the phone screen. Dial-in below.", to: ["scheduling@recruitco.com"] },
  { s: "Donation receipt request", sn: "Could you resend the receipt for my March donation?", to: ["support@charity.org"] },
  { s: "Beta access request", sn: "I'd love early access to the API — happy to share feedback.", to: ["beta@newtool.ai"] },
  { s: "Re: Passport renewal appointment", sn: "Attaching the completed application form DS-82 as requested.", to: ["appointments@travel-docs.com"] },
];

let day = 1;
const cases = [
  ...positives.map((p, i) => ({
    input: {
      threadId: `pos-${i}`,
      subject: p.s,
      snippet: p.sn,
      to: p.to,
      date: `2026-03-${String((day++ % 28) + 1).padStart(2, "0")}`,
    },
    expected: {
      isJobApplication: true,
      company: p.company,
      role: p.role,
      source: p.source,
    },
  })),
  ...negatives.map((n, i) => ({
    input: {
      threadId: `neg-${i}`,
      subject: n.s,
      snippet: n.sn,
      to: n.to,
      date: `2026-03-${String((day++ % 28) + 1).padStart(2, "0")}`,
    },
    expected: { isJobApplication: false, company: null, role: null, source: null },
  })),
];

const out = join(dirname(fileURLToPath(import.meta.url)), "threads.json");
writeFileSync(out, JSON.stringify(cases, null, 2));
console.log(`wrote ${cases.length} labelled cases to ${out}`);
