import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import serviceAccount from "@/database/serviceAccountKey.json";

const app =
	getApps().length === 0
		? initializeApp({ credential: cert(serviceAccount) })
		: getApp();

export { app };
