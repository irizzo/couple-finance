import type {
	CollectionReference,
	DocumentData,
	DocumentSnapshot,
} from "firebase-admin/firestore";
import { withId } from "@/database/collections";
import db from "@/database/db";
import { type ActionResult, fail, failFrom, ok } from "@/database/result";
import {
	collect,
	finiteNumber,
	nonEmptyString,
	optionalText,
	round2,
	trimmedText,
} from "@/database/validators";
import type { ListOptions, Owner } from "@/types";

/**
 * Shared implementation behind the `*.actions.ts` files, which keep to one
 * entity each and re-export none of this.
 *
 * Every helper takes the `owner` first, as every action does: `src/database`
 * knows nothing about sessions, so whose data a call reaches is an argument.
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
	description: string;
	initialAmount: number;
	totalBalance: number;
	realBalance: number;
	archived: boolean;
	ownerId: string;
}

export interface NamedEntity {
	id: string;
	name: string;
	description: string;
	archived: boolean;
	ownerId: string;
}

export function ref(collection: string): CollectionReference {
	return db.collection(collection);
}

export function notFound<T>(label: string, id: string): ActionResult<T> {
	return fail<T>(`${label} "${id}" was not found`);
}

/**
 * True when the document exists and belongs to `owner`. Every read or write by
 * id goes through it, and a document of someone else's then reads exactly like
 * a missing one, with the same message, so probing an id reveals nothing.
 *
 * An owner without an id matches nothing, rather than every document that has
 * no `ownerId` either.
 */
export function owned(
	snap: DocumentSnapshot<DocumentData>,
	owner: Owner,
): boolean {
	return (
		snap.exists &&
		typeof owner?.id === "string" &&
		owner.id !== "" &&
		snap.get("ownerId") === owner.id
	);
}

/**
 * Guards a reference before anything points at it: the target has to exist,
 * belong to `owner` and still be active. Returns the problem as a message, or
 * `null` when the reference is good — the shape callers fold into their own
 * `fail(...)`.
 *
 * Parameterized by collection because budgets need exactly this check against
 * saldos *and* categories.
 */
export async function assertActive(
	owner: Owner,
	collection: string,
	id: string,
	label: string,
): Promise<string | null> {
	const snap = await ref(collection).doc(id).get();
	if (!owned(snap, owner)) {
		return `${label} "${id}" was not found`;
	}
	// Only `archived` is read, so only `archived` is claimed — not every field
	// `NamedEntity` happens to carry.
	if ((snap.data() as { archived: boolean }).archived) {
		return `${label} "${id}" is archived`;
	}
	return null;
}

export async function getEntity<T extends { id: string }>(
	owner: Owner,
	collection: string,
	id: string,
	label: string,
): Promise<ActionResult<T>> {
	if (nonEmptyString(id)) {
		return fail<T>(`A ${label.toLowerCase()} id is required`);
	}
	try {
		const snap = await ref(collection).doc(id).get();
		if (!owned(snap, owner)) {
			return notFound<T>(label, id);
		}
		return ok(withId<T>(snap));
	} catch (cause) {
		return failFrom<T>(`Could not load the ${label.toLowerCase()}`, cause);
	}
}

/**
 * The owner's entities, filtered on `ownerId` in Firestore, which the automatic
 * single-field index serves. `archived` and the order are applied in memory:
 * pairing either with the owner filter would need a composite index, and these
 * collections are small enough that it buys nothing. Only `archived: false`
 * counts as active, as the Firestore equality filter this replaced did.
 */
export async function listEntities<T extends NamedEntity>(
	owner: Owner,
	collection: string,
	label: string,
	options: ListOptions = {},
): Promise<ActionResult<T[]>> {
	try {
		const snap = await ref(collection).where("ownerId", "==", owner.id).get();
		const entities = snap.docs
			.map((doc) => withId<T>(doc))
			.filter((entity) => options.includeArchived || entity.archived === false)
			.sort((a, b) => a.name.localeCompare(b.name));
		return ok(entities);
	} catch (cause) {
		return failFrom<T[]>(`Could not list the ${label.toLowerCase()}s`, cause);
	}
}

export async function setArchived<T extends NamedEntity>(
	owner: Owner,
	collection: string,
	id: string,
	archived: boolean,
	label: string,
): Promise<ActionResult<T>> {
	try {
		const docRef = ref(collection).doc(id);
		const snap = await docRef.get();
		if (!owned(snap, owner)) {
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
	owner: Owner,
	collection: string,
	input: { name: string; description?: string },
	label: string,
): Promise<ActionResult<T>> {
	const fieldErrors = collect({
		name: nonEmptyString(input?.name),
		description: optionalText(input?.description),
	});
	if (fieldErrors) {
		return fail<T>(`Invalid ${label.toLowerCase()}`, fieldErrors);
	}

	try {
		const docRef = ref(collection).doc();
		// `archived: false` is mandatory, not a default: `listEntities` counts only
		// `archived === false` as active, so a document missing the field would
		// drop out of every active list. `description` is written for the same
		// reason — as `""` when omitted, never left out — and `ownerId` because a
		// document without one belongs to no one and is never listed.
		const data = {
			name: input.name.trim(),
			description: trimmedText(input.description),
			archived: false,
			ownerId: owner.id,
		};
		await docRef.set(data);
		return ok({ id: docRef.id, ...data } as T);
	} catch (cause) {
		return failFrom<T>(`Could not create the ${label.toLowerCase()}`, cause);
	}
}

export async function updateNamedEntity<T extends NamedEntity>(
	owner: Owner,
	collection: string,
	id: string,
	input: { name?: string; description?: string },
	label: string,
): Promise<ActionResult<T>> {
	if (input?.name === undefined && input?.description === undefined) {
		return fail<T>("Nothing to update");
	}
	const fieldErrors = collect({
		...(input.name !== undefined ? { name: nonEmptyString(input.name) } : {}),
		...(input.description !== undefined
			? { description: optionalText(input.description) }
			: {}),
	});
	if (fieldErrors) {
		return fail<T>(`Invalid ${label.toLowerCase()}`, fieldErrors);
	}

	try {
		const docRef = ref(collection).doc(id);
		const snap = await docRef.get();
		if (!owned(snap, owner)) {
			return notFound<T>(label, id);
		}

		const patch: Partial<NamedEntity> = {};
		if (input.name !== undefined) {
			patch.name = input.name.trim();
		}
		if (input.description !== undefined) {
			// `""` is a real value here: it clears the description.
			patch.description = trimmedText(input.description);
		}
		await docRef.update(patch);
		return ok({ ...withId<T>(snap), ...patch });
	} catch (cause) {
		return failFrom<T>(`Could not update the ${label.toLowerCase()}`, cause);
	}
}

export async function createBalanceEntity<T extends BalanceEntity>(
	owner: Owner,
	collection: string,
	input: { name: string; description?: string; initialAmount: number },
	label: string,
): Promise<ActionResult<T>> {
	const fieldErrors = collect({
		name: nonEmptyString(input?.name),
		description: optionalText(input?.description),
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
			// Mandatory, not a default — see `createNamedEntity`.
			description: trimmedText(input.description),
			initialAmount,
			// A single opening amount seeds both balances: before any transaction
			// exists, what moved and what is owed are the same figure.
			totalBalance: initialAmount,
			realBalance: initialAmount,
			archived: false,
			ownerId: owner.id,
		};
		await docRef.set(data);
		return ok({ id: docRef.id, ...data } as T);
	} catch (cause) {
		return failFrom<T>(`Could not create the ${label.toLowerCase()}`, cause);
	}
}

export async function updateBalanceEntity<T extends BalanceEntity>(
	owner: Owner,
	collection: string,
	id: string,
	input: { name?: string; description?: string; initialAmount?: number },
	label: string,
): Promise<ActionResult<T>> {
	const fieldErrors = collect({
		...(input?.name !== undefined ? { name: nonEmptyString(input.name) } : {}),
		...(input?.description !== undefined
			? { description: optionalText(input.description) }
			: {}),
		...(input?.initialAmount !== undefined
			? { initialAmount: finiteNumber(input.initialAmount) }
			: {}),
	});
	if (fieldErrors) {
		return fail<T>(`Invalid ${label.toLowerCase()}`, fieldErrors);
	}
	if (
		input?.name === undefined &&
		input?.description === undefined &&
		input?.initialAmount === undefined
	) {
		return fail<T>("Nothing to update");
	}

	try {
		return await db.runTransaction(async (tx) => {
			const docRef = ref(collection).doc(id);
			const snap = await tx.get(docRef);
			if (!owned(snap, owner)) {
				return notFound<T>(label, id);
			}

			const current = withId<T>(snap);
			const patch: Partial<BalanceEntity> = {};
			if (input.name !== undefined) {
				patch.name = input.name.trim();
			}
			if (input.description !== undefined) {
				patch.description = trimmedText(input.description);
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
