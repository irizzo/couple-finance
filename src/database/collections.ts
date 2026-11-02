import type { DocumentData, DocumentSnapshot } from "firebase-admin/firestore";
import type { BudgetScope } from "@/types";

export const COLLECTIONS = {
	accounts: "accounts",
	saldos: "saldos",
	categories: "categories",
	transactions: "transactions",
	budgets: "budgets",
	users: "users",
} as const;

/**
 * A budget's document id is derived from what it plans, not generated: one
 * target in one month can only have one planned amount, so making that the id
 * enforces it in Firestore itself. Saving becomes an idempotent `set` with no
 * duplicate-detection query and no transaction.
 *
 * Lives here, beside the collection names, rather than in `budgets.actions.ts`:
 * the id is part of the collection's schema, not of any one operation on it.
 */
export function budgetDocId(budget: {
	month: string;
	scope: BudgetScope;
	targetId: string;
}): string {
	return `${budget.month}__${budget.scope}__${budget.targetId}`;
}

/** Maps a Firestore snapshot onto an entity, with the doc id as `id`. */
export function withId<T extends { id: string }>(
	snap: DocumentSnapshot<DocumentData>,
): T {
	return { ...(snap.data() as Omit<T, "id">), id: snap.id } as T;
}
