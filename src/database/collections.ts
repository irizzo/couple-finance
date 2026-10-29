import type { DocumentData, DocumentSnapshot } from "firebase-admin/firestore";

export const COLLECTIONS = {
	accounts: "accounts",
	saldos: "saldos",
	categories: "categories",
	transactions: "transactions",
} as const;

/** Maps a Firestore snapshot onto an entity, with the doc id as `id`. */
export function withId<T extends { id: string }>(
	snap: DocumentSnapshot<DocumentData>,
): T {
	return { ...(snap.data() as Omit<T, "id">), id: snap.id } as T;
}
