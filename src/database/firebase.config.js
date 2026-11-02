import "server-only";
import path from "node:path";
import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";

/**
 * The Admin SDK credential. Deployed, it is the service-account JSON itself in
 * `FIREBASE_SERVICE_ACCOUNT`. Locally, it falls back to the gitignored key
 * file, read from disk when the server starts: an `import` of the file would
 * compile the private key into the build output.
 */
function credential() {
	const json = process.env.FIREBASE_SERVICE_ACCOUNT;
	if (!json) {
		return cert(
			path.join(process.cwd(), "src/database/serviceAccountKey.json"),
		);
	}
	try {
		return cert(JSON.parse(json));
	} catch {
		// Not rethrown: V8's parse error quotes the text around the bad token,
		// which here is a private key.
		throw new Error(
			"FIREBASE_SERVICE_ACCOUNT is not valid service-account JSON.",
		);
	}
}

const app =
	getApps().length === 0
		? initializeApp({ credential: credential() })
		: getApp();

export { app };
