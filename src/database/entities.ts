import type { CollectionReference } from "firebase-admin/firestore";
import { withId } from "@/database/collections";
import db from "@/database/db";
import { type ActionResult, fail, failFrom, ok } from "@/database/result";
import {
	collect,
	finiteNumber,
	nonEmptyString,
	round2,
} from "@/database/validators";
import type { ListOptions } from "@/types";

/**
 * Shared implementation behind the `*.actions.ts` files. Those files carry the
 * `"use server"` directive and may therefore only export async functions, so
 * every reusable type and helper has to live outside of them.
 */

/**
 * Account and Saldo are structurally identical: a name plus two running
 * balances. Both are fed by every transaction that points at them —
 * `totalBalance` from the amount that actually moved, `realBalance` from the
 * share the user genuinely owes.
 */
export interface BalanceEntity {
	id: string;
	name: string;
	initialAmount: number;
	totalBalance: number;
	realBalance: number;
	archived: boolean;
}

export interface NamedEntity {
	id: string;
	name: string;
	archived: boolean;
}

export function ref(collection: string): CollectionReference {
	return db.collection(collection);
}

export function notFound<T>(label: string, id: string): ActionResult<T> {
	return fail<T>(`${label} "${id}" was not found`);
}

/**
 * Guards a reference before anything points at it: the target has to exist and
 * still be active. Returns the problem as a message, or `null` when the
 * reference is good — the shape callers fold into their own `fail(...)`.
 *
 * Parameterized by collection because budgets need exactly this check against
 * saldos *and* categories.
 */
export async function assertActive(
	collection: string,
	id: string,
	label: string,
): Promise<string | null> {
	const snap = await ref(collection).doc(id).get();
	if (!snap.exists) {
		return `${label} "${id}" was not found`;
	}
	if (withId<NamedEntity>(snap).archived) {
		return `${label} "${id}" is archived`;
	}
	return null;
}

export async function getEntity<T extends { id: string }>(
	collection: string,
	id: string,
	label: string,
): Promise<ActionResult<T>> {
	if (nonEmptyString(id)) {
		return fail<T>(`A ${label.toLowerCase()} id is required`);
	}
	try {
		const snap = await ref(collection).doc(id).get();
		if (!snap.exists) {
			return notFound<T>(label, id);
		}
		return ok(withId<T>(snap));
	} catch (cause) {
		return failFrom<T>(`Could not load the ${label.toLowerCase()}`, cause);
	}
}

export async function listEntities<T extends NamedEntity>(
	collection: string,
	label: string,
	options: ListOptions = {},
): Promise<ActionResult<T[]>> {
	try {
		const query = options.includeArchived
			? ref(collection)
			: ref(collection).where("archived", "==", false);
		const snap = await query.get();
		// Sorted in memory on purpose: pairing the `archived` equality filter with
		// an `orderBy("name")` would require a composite Firestore index, and these
		// collections are small enough that it buys nothing.
		const entities = snap.docs
			.map((doc) => withId<T>(doc))
			.sort((a, b) => a.name.localeCompare(b.name));
		return ok(entities);
	} catch (cause) {
		return failFrom<T[]>(`Could not list the ${label.toLowerCase()}s`, cause);
	}
}

export async function setArchived<T extends NamedEntity>(
	collection: string,
	id: string,
	archived: boolean,
	label: string,
): Promise<ActionResult<T>> {
	try {
		const docRef = ref(collection).doc(id);
		const snap = await docRef.get();
		if (!snap.exists) {
			return notFound<T>(label, id);
		}
		await docRef.update({ archived });
		return ok({ ...withId<T>(snap), archived });
	} catch (cause) {
		const verb = archived ? "archive" : "restore";
		return failFrom<T>(`Could not ${verb} the ${label.toLowerCase()}`, cause);
	}
}

export async function createNamedEntity<T extends NamedEntity>(
	collection: string,
	input: { name: string },
	label: string,
): Promise<ActionResult<T>> {
	const fieldErrors = collect({ name: nonEmptyString(input?.name) });
	if (fieldErrors) {
		return fail<T>(`Invalid ${label.toLowerCase()}`, fieldErrors);
	}

	try {
		const docRef = ref(collection).doc();
		// `archived: false` is mandatory, not a default: a
		// `where("archived", "==", false)` query silently skips documents that are
		// missing the field entirely.
		const data = { name: input.name.trim(), archived: false };
		await docRef.set(data);
		return ok({ id: docRef.id, ...data } as T);
	} catch (cause) {
		return failFrom<T>(`Could not create the ${label.toLowerCase()}`, cause);
	}
}

export async function updateNamedEntity<T extends NamedEntity>(
	collection: string,
	id: string,
	input: { name?: string },
	label: string,
): Promise<ActionResult<T>> {
	if (input?.name === undefined) {
		return fail<T>("Nothing to update");
	}
	const fieldErrors = collect({ name: nonEmptyString(input.name) });
	if (fieldErrors) {
		return fail<T>(`Invalid ${label.toLowerCase()}`, fieldErrors);
	}

	try {
		const docRef = ref(collection).doc(id);
		const snap = await docRef.get();
		if (!snap.exists) {
			return notFound<T>(label, id);
		}

		const patch = { name: input.name.trim() };
		await docRef.update(patch);
		return ok({ ...withId<T>(snap), ...patch });
	} catch (cause) {
		return failFrom<T>(`Could not update the ${label.toLowerCase()}`, cause);
	}
}

export async function createBalanceEntity<T extends BalanceEntity>(
	collection: string,
	input: { name: string; initialAmount: number },
	label: string,
): Promise<ActionResult<T>> {
	const fieldErrors = collect({
		name: nonEmptyString(input?.name),
		initialAmount: finiteNumber(input?.initialAmount),
	});
	if (fieldErrors) {
		return fail<T>(`Invalid ${label.toLowerCase()}`, fieldErrors);
	}

	try {
		const initialAmount = round2(input.initialAmount);
		const docRef = ref(collection).doc();
		const data = {
			name: input.name.trim(),
			initialAmount,
			// A single opening amount seeds both balances: before any transaction
			// exists, what moved and what is owed are the same figure.
			totalBalance: initialAmount,
			realBalance: initialAmount,
			archived: false,
		};
		await docRef.set(data);
		return ok({ id: docRef.id, ...data } as T);
	} catch (cause) {
		return failFrom<T>(`Could not create the ${label.toLowerCase()}`, cause);
	}
}

export async function updateBalanceEntity<T extends BalanceEntity>(
	collection: string,
	id: string,
	input: { name?: string; initialAmount?: number },
	label: string,
): Promise<ActionResult<T>> {
	const fieldErrors = collect({
		...(input?.name !== undefined ? { name: nonEmptyString(input.name) } : {}),
		...(input?.initialAmount !== undefined
			? { initialAmount: finiteNumber(input.initialAmount) }
			: {}),
	});
	if (fieldErrors) {
		return fail<T>(`Invalid ${label.toLowerCase()}`, fieldErrors);
	}
	if (input?.name === undefined && input?.initialAmount === undefined) {
		return fail<T>("Nothing to update");
	}

	try {
		return await db.runTransaction(async (tx) => {
			const docRef = ref(collection).doc(id);
			const snap = await tx.get(docRef);
			if (!snap.exists) {
				return notFound<T>(label, id);
			}

			const current = withId<T>(snap);
			const patch: Partial<BalanceEntity> = {};
			if (input.name !== undefined) {
				patch.name = input.name.trim();
			}
			if (input.initialAmount !== undefined) {
				// Each running balance is `initialAmount + sum(transactions)`, so
				// restating the opening amount shifts both by the same delta instead of
				// recomputing them from scratch.
				const nextInitial = round2(input.initialAmount);
				const shift = nextInitial - current.initialAmount;
				patch.initialAmount = nextInitial;
				patch.totalBalance = round2(current.totalBalance + shift);
				patch.realBalance = round2(current.realBalance + shift);
			}

			tx.update(docRef, patch);
			return ok({ ...current, ...patch } as T);
		});
	} catch (cause) {
		return failFrom<T>(`Could not update the ${label.toLowerCase()}`, cause);
	}
}
