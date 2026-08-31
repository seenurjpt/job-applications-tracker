// One-off cleanup: deletes applications that have NO outbound message —
// rows created from no-reply/notification emails by the removed inbox ATS
// pass. Their messages and drafts are removed too. Run with:
//   node scripts/cleanup-inbound-only.mjs           (dry run — lists only)
//   node scripts/cleanup-inbound-only.mjs --delete  (actually deletes)
import fs from "node:fs";
import { MongoClient } from "mongodb";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const doDelete = process.argv.includes("--delete");
const client = new MongoClient(env.MONGODB_URI);
await client.connect();
const db = client.db(env.MONGODB_DB);

const withOutbound = await db
  .collection("messages")
  .distinct("applicationId", { direction: "outbound" });
const outboundSet = new Set(withOutbound.map(String));
const all = await db
  .collection("applications")
  .find({}, { projection: { _id: 1, company: 1, role: 1, contactEmail: 1 } })
  .toArray();
const toDelete = all.filter((a) => !outboundSet.has(String(a._id)));

console.log(`total applications: ${all.length}`);
console.log(`inbound-only (no email sent by you): ${toDelete.length}`);
for (const a of toDelete)
  console.log(`  - ${a.company ?? "?"} / ${a.role ?? "?"} (${a.contactEmail ?? "no contact"})`);

if (!doDelete) {
  console.log("\nDry run — nothing deleted. Re-run with --delete to remove these.");
} else if (toDelete.length > 0) {
  const ids = toDelete.map((a) => a._id);
  const dm = await db.collection("messages").deleteMany({ applicationId: { $in: ids } });
  const dd = await db.collection("drafts").deleteMany({ applicationId: { $in: ids } });
  const da = await db.collection("applications").deleteMany({ _id: { $in: ids } });
  console.log(`deleted: applications ${da.deletedCount}, messages ${dm.deletedCount}, drafts ${dd.deletedCount}`);
}
await client.close();
