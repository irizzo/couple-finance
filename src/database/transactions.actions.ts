"use server";

import type {
	DocumentData,
	DocumentReference,
	DocumentSnapshot,
	Transaction as FirestoreTransaction,
} from "firebase-admin/firestore";
import { COLLECTIONS, withId } from "@/database/collections";
import db from "@/database/db";
import { notFound, ref } from "@/database/entities";
import { type ActionResult, fail, failFrom, ok } from "@/database/result";
import {
	collect,
	enumValue,
	type FieldErrors,
	isoDate,
	nonEmptyString,
	nonNegativeNumber,
	round2,
} from "@/database/validators";
import {
	type Account,
	type Category,
	type CreateTransactionInput,
	type Saldo,
	type Transaction,
	type TransactionFilters,
	TransactionType,
	type UpdateTransactionInput,
} from "@/types";

const LABEL = "Transaction";

const accountRef = (id: string) => ref(COLLECTIONS.accounts).doc(id);
const saldoRef = (id: string) => ref(COLLECTIONS.saldos).doc(id);
const categoryRef = (id: string) => ref(COLLECTIONS.categories).doc(id);

/** Expenses pull a balance down, receitas push it up. */
function signed(amount: number, type: TransactionType): number {
	return type === TransactionType.EXPENSE ? -amount : amount;
}

/** The pair of balance movements a single transaction causes. */
interface Delta {
	total: number;
	real: number;
}

const NO_DELTA: Delta = { total: 0, real: 0 };

/**
 * Both amounts post to both balances, on the account *and* on the saldo. That
 * is the split-expense model from CLAUDE.MD: an R$90 internet bill split 50/50
 * moves each entity's `totalBalance` by R$90 (what actually left the bank) and
 * its `realBalance` by R$45 (the share genuinely owed). Pass `sign: -1` to
 * reverse a posting.
 */
function postings(
	txn: Pick<Transaction, "totalAmount" | "realAmount" | "type">,
	sign = 1,
): Delta {
	return {
		total: sign * signed(txn.totalAmount, txn.type),
		real: sign * signed(txn.realAmount, txn.type),
	};
}

function strip(input: UpdateTransactionInput): UpdateTransactionInput {
	return Object.fromEntries(
		Object.entries(input ?? {}).filter(([, value]) => value !== undefined),
	) as UpdateTransactionInput;
}

function validate(input: CreateTransactionInput): FieldErrors | null {
	const amountsAreNumbers =
		nonNegativeNumber(input?.totalAmount) === null &&
		nonNegativeNumber(input?.realAmount) === null;
	return collect({
		date: isoDate(input?.date),
		description: nonEmptyString(input?.description),
		accountId: nonEmptyString(input?.accountId),
		saldoId: nonEmptyString(input?.saldoId),
		categoryId: nonEmptyString(input?.categoryId),
		type: enumValue(input?.type, Object.values(TransactionType)),
		totalAmount: nonNegativeNumber(input?.totalAmount),
		realAmount:
			nonNegativeNumber(input?.realAmount) ??
			(amountsAreNumbers && input.realAmount > input.totalAmount
				? "cannot be greater than the total amount"
				: null),
	});
}

function normalize(input: CreateTransactionInput): Omit<Transaction, "id"> {
	return {
		date: input.date,
		description: input.description.trim(),
		totalAmount: round2(input.totalAmount),
		realAmount: round2(input.realAmount),
		accountId: input.accountId,
		saldoId: input.saldoId,
		categoryId: input.categoryId,
		type: input.type,
	};
}

type Snapshots = Map<string, DocumentSnapshot<DocumentData>>;

async function readAll(
	tx: FirestoreTransaction,
	refs: DocumentReference[],
): Promise<Snapshots> {
	const unique = [...new Map(refs.map((r) => [r.path, r])).values()];
	const snaps = await tx.getAll(...unique);
	return new Map(snaps.map((snap, index) => [unique[index].path, snap]));
}

/**
 * Verifies the account, saldo and category a transaction posts to. `enforceActive`
 * lists the ids the caller is newly pointing at: an archived target may never
 * receive a *new* posting, but an existing transaction must stay editable even
 * after its account has been archived.
 */
function checkTargets(
	snaps: Snapshots,
	txn: Pick<Transaction, "accountId" | "saldoId" | "categoryId">,
	enforceActive: Set<string>,
): string | null {
	const targets = [
		{ label: "Account", id: txn.accountId, ref: accountRef(txn.accountId) },
		{ label: "Saldo", id: txn.saldoId, ref: saldoRef(txn.saldoId) },
		{ label: "Category", id: txn.categoryId, ref: categoryRef(txn.categoryId) },
	];

	for (const target of targets) {
		const snap = snaps.get(target.ref.path);
		if (!snap?.exists) {
			return `${target.label} "${target.id}" was not found`;
		}
		const entity = withId<Account | Saldo | Category>(snap);
		if (entity.archived && enforceActive.has(target.id)) {
			return `${target.label} "${target.id}" is archived`;
		}
	}

	const category = withId<Category>(
		snaps.get(
			categoryRef(txn.categoryId).path,
		) as DocumentSnapshot<DocumentData>,
	);
	if (category.saldoId !== txn.saldoId) {
		return `Category "${category.name}" belongs to saldo "${category.saldoId}", not "${txn.saldoId}"`;
	}
	return null;
}

/**
 * Deltas are accumulated per document before any write, so an edit that keeps
 * the same account (reverse the old amount, apply the new one) collapses into a
 * single balance write instead of two that would overwrite each other.
 */
function accumulate(
	deltas: Map<string, Delta>,
	docRef: DocumentReference,
	delta: Delta,
): void {
	const running = deltas.get(docRef.path) ?? NO_DELTA;
	deltas.set(docRef.path, {
		total: running.total + delta.total,
		real: running.real + delta.real,
	});
}

function writeBalances(
	tx: FirestoreTransaction,
	snaps: Snapshots,
	deltas: Map<string, Delta>,
): void {
	for (const [path, delta] of deltas) {
		if (delta.total === 0 && delta.real === 0) {
			continue;
		}
		const snap = snaps.get(path);
		if (!snap?.exists) {
			continue;
		}
		const current = withId<Account | Saldo>(snap);
		tx.update(snap.ref, {
			totalBalance: round2(current.totalBalance + delta.total),
			realBalance: round2(current.realBalance + delta.real),
		});
	}
}

export async function createTransaction(
	input: CreateTransactionInput,
): Promise<ActionResult<Transaction>> {
	const fieldErrors = validate(input);
	if (fieldErrors) {
		return fail<Transaction>("Invalid transaction", fieldErrors);
	}

	try {
		return await db.runTransaction(async (tx) => {
			const data = normalize(input);
			// Firestore requires every read before the first write.
			const snaps = await readAll(tx, [
				accountRef(data.accountId),
				saldoRef(data.saldoId),
				categoryRef(data.categoryId),
			]);
			const problem = checkTargets(
				snaps,
				data,
				new Set([data.accountId, data.saldoId, data.categoryId]),
			);
			if (problem) {
				return fail<Transaction>(problem);
			}

			const deltas = new Map<string, Delta>();
			accumulate(deltas, accountRef(data.accountId), postings(data));
			accumulate(deltas, saldoRef(data.saldoId), postings(data));

			const docRef = ref(COLLECTIONS.transactions).doc();
			tx.set(docRef, data);
			writeBalances(tx, snaps, deltas);

			return ok({ id: docRef.id, ...data });
		});
	} catch (cause) {
		return failFrom<Transaction>("Could not create the transaction", cause);
	}
}

export async function getTransaction(
	id: string,
): Promise<ActionResult<Transaction>> {
	if (nonEmptyString(id)) {
		return fail<Transaction>("A transaction id is required");
	}
	try {
		const snap = await ref(COLLECTIONS.transactions).doc(id).get();
		if (!snap.exists) {
			return notFound<Transaction>(LABEL, id);
		}
		return ok(withId<Transaction>(snap));
	} catch (cause) {
		return failFrom<Transaction>("Could not load the transaction", cause);
	}
}

/**
 * `date` is a zero-padded ISO string, so a lexicographic range is a correct
 * month filter and needs no composite index. The optional id filters are applied
 * in memory for the same reason.
 */
export async function listTransactions(
	filters: TransactionFilters,
): Promise<ActionResult<Transaction[]>> {
	const fieldErrors = collect({
		from: isoDate(filters?.from),
		to: isoDate(filters?.to),
	});
	if (fieldErrors) {
		return fail<Transaction[]>("Invalid filters", fieldErrors);
	}
	if (filters.from > filters.to) {
		return fail<Transaction[]>("The start date must not be after the end date");
	}

	try {
		const snap = await ref(COLLECTIONS.transactions)
			.where("date", ">=", filters.from)
			.where("date", "<=", filters.to)
			.orderBy("date", "desc")
			.get();

		const matches = snap.docs
			.map((doc) => withId<Transaction>(doc))
			.filter(
				(txn) =>
					(!filters.accountId || txn.accountId === filters.accountId) &&
					(!filters.saldoId || txn.saldoId === filters.saldoId) &&
					(!filters.categoryId || txn.categoryId === filters.categoryId),
			);
		return ok(matches);
	} catch (cause) {
		return failFrom<Transaction[]>("Could not list the transactions", cause);
	}
}

export async function updateTransaction(
	id: string,
	input: UpdateTransactionInput,
): Promise<ActionResult<Transaction>> {
	const patch = strip(input);
	if (Object.keys(patch).length === 0) {
		return fail<Transaction>("Nothing to update");
	}

	try {
		return await db.runTransaction(async (tx) => {
			const docRef = ref(COLLECTIONS.transactions).doc(id);
			const snap = await tx.get(docRef);
			if (!snap.exists) {
				return notFound<Transaction>(LABEL, id);
			}

			const current = withId<Transaction>(snap);
			const merged = { ...current, ...patch };
			const fieldErrors = validate(merged);
			if (fieldErrors) {
				return fail<Transaction>("Invalid transaction", fieldErrors);
			}
			const next = normalize(merged);

			// Both the old and the new targets are needed: reassigning an account
			// has to credit one document and debit the other.
			const snaps = await readAll(tx, [
				accountRef(current.accountId),
				accountRef(next.accountId),
				saldoRef(current.saldoId),
				saldoRef(next.saldoId),
				categoryRef(next.categoryId),
			]);
			const reassigned = new Set(
				[
					next.accountId === current.accountId ? null : next.accountId,
					next.saldoId === current.saldoId ? null : next.saldoId,
					next.categoryId === current.categoryId ? null : next.categoryId,
				].filter((value): value is string => value !== null),
			);
			const problem = checkTargets(snaps, next, reassigned);
			if (problem) {
				return fail<Transaction>(problem);
			}

			const deltas = new Map<string, Delta>();
			accumulate(deltas, accountRef(current.accountId), postings(current, -1));
			accumulate(deltas, saldoRef(current.saldoId), postings(current, -1));
			accumulate(deltas, accountRef(next.accountId), postings(next));
			accumulate(deltas, saldoRef(next.saldoId), postings(next));

			tx.set(docRef, next);
			writeBalances(tx, snaps, deltas);

			return ok({ id, ...next });
		});
	} catch (cause) {
		return failFrom<Transaction>("Could not update the transaction", cause);
	}
}

/**
 * Transactions are hard-deleted — nothing references them — but the balances
 * they moved have to be unwound in the same atomic step.
 */
export async function deleteTransaction(
	id: string,
): Promise<ActionResult<Transaction>> {
	try {
		return await db.runTransaction(async (tx) => {
			const docRef = ref(COLLECTIONS.transactions).doc(id);
			const snap = await tx.get(docRef);
			if (!snap.exists) {
				return notFound<Transaction>(LABEL, id);
			}

			const current = withId<Transaction>(snap);
			const snaps = await readAll(tx, [
				accountRef(current.accountId),
				saldoRef(current.saldoId),
			]);

			const deltas = new Map<string, Delta>();
			accumulate(deltas, accountRef(current.accountId), postings(current, -1));
			accumulate(deltas, saldoRef(current.saldoId), postings(current, -1));

			tx.delete(docRef);
			writeBalances(tx, snaps, deltas);

			return ok(current);
		});
	} catch (cause) {
		return failFrom<Transaction>("Could not delete the transaction", cause);
	}
}

/**
 * Copies a recurrent-but-not-fixed transaction instead of retyping it; pass the
 * new `date` (or any other field) as an override. Routed through
 * `createTransaction` so validation and balance updates stay identical.
 */
export async function duplicateTransaction(
	id: string,
	overrides: UpdateTransactionInput = {},
): Promise<ActionResult<Transaction>> {
	const existing = await getTransaction(id);
	if (!existing.ok) {
		return existing;
	}

	const source = existing.data;
	return createTransaction({
		date: source.date,
		description: source.description,
		totalAmount: source.totalAmount,
		realAmount: source.realAmount,
		accountId: source.accountId,
		saldoId: source.saldoId,
		categoryId: source.categoryId,
		type: source.type,
		...strip(overrides),
	});
}
