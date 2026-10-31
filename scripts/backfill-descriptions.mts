/**
 * One-off backfill: writes `description: ""` on every account, saldo and
 * category document that predates the field.
 *
 * `withId` is a blind cast, so a document missing `description` would read back
 * `undefined` against a type that promises a `string`. Idempotent — a second
 * run finds nothing to do.
 *
 *   node scripts/backfill-descriptions.mts            # write
 *   node scripts/backfill-descriptions.mts --dry-run  # report only
 *
 * Talks to Firestore through the Admin SDK directly rather than the action
 * modules: those need the `@/*` alias, which plain Node cannot resolve.
 */
import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const COLLECTIONS = ["accounts", "saldos", "categories"] as const;
const KEY_PATH = fileURLToPath(
	new URL("../src/database/serviceAccountKey.json", import.meta.url),
);

const dryRun = process.argv.includes("--dry-run");
const db = getFirestore(initializeApp({ credential: cert(KEY_PATH) }));

for (const collection of COLLECTIONS) {
	const snap = await db.collection(collection).get();
	// Anything that is not a string violates the type, not only a missing field.
	const stale = snap.docs.filter(
		(doc) => typeof doc.get("description") !== "string",
	);

	if (!dryRun && stale.length > 0) {
		const batch = db.batch();
		for (const doc of stale) {
			batch.update(doc.ref, { description: "" });
		}
		await batch.commit();
	}

	const verb = dryRun ? "would backfill" : "backfilled";
	const ids = stale.map((doc) => doc.id).join(", ");
	console.log(
		`${collection}: ${snap.size} documents, ${verb} ${stale.length}${ids ? ` (${ids})` : ""}`,
	);
}
