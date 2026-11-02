import "server-only";

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

/** The pair of balance movements a transaction causes on one document. */
interface Delta {
	total: number;
	real: number;
}

const NO_DELTA: Delta = { total: 0, real: 0 };

/** One balance a transaction moves, and by how much. */
interface Posting {
	docRef: DocumentReference;
	delta: Delta;
}

type Posted = Pick<
	Transaction,
	| "totalAmount"
	| "realAmount"
	| "type"
	| "accountId"
	| "saldoId"
	| "toAccountId"
	| "toSaldoId"
>;

/**
 * Every balance a transaction moves. Both amounts post to both balances, on the
 * account *and* on the saldo. That is the split-expense model from CLAUDE.MD:
 * an R$90 internet bill split 50/50 moves each entity's `totalBalance` by R$90
 * (what actually left the bank) and its `realBalance` by R$45 (the share
 * genuinely owed). Expenses pull both down, receitas push both up.
 *
 * A transfer is both at once: it pulls its origin account and saldo down and
 * pushes its destination pair up by the same amounts. When the two ends share
 * an account (or a saldo), that document gets a debit and a matching credit,
 * which `accumulate` cancels into no write at all.
 *
 * Pass `sign: -1` to reverse a posting.
 */
function postings(txn: Posted, sign = 1): Posting[] {
	const moved = (direction: number): Delta => ({
		total: sign * direction * txn.totalAmount,
		real: sign * direction * txn.realAmount,
	});
	if (txn.type === TransactionType.TRANSFER) {
		// Validation refuses a transfer without both destination ids, so the
		// fallback only meets a document written outside the app — and `doc("")`
		// throws, which the caller's catch turns into a failed result.
		return [
			{ docRef: accountRef(txn.accountId), delta: moved(-1) },
			{ docRef: saldoRef(txn.saldoId), delta: moved(-1) },
			{ docRef: accountRef(txn.toAccountId ?? ""), delta: moved(1) },
			{ docRef: saldoRef(txn.toSaldoId ?? ""), delta: moved(1) },
		];
	}
	const direction = txn.type === TransactionType.EXPENSE ? -1 : 1;
	return [
		{ docRef: accountRef(txn.accountId), delta: moved(direction) },
		{ docRef: saldoRef(txn.saldoId), delta: moved(direction) },
	];
}

interface Target {
	label: string;
	id: string;
	docRef: DocumentReference;
}

/**
 * Everything a transaction points at: its account, saldo and category, plus a
 * transfer's destination pair.
 */
function targetsOf(txn: Posted & Pick<Transaction, "categoryId">): Target[] {
	const targets: Target[] = [
		{ label: "Account", id: txn.accountId, docRef: accountRef(txn.accountId) },
		{ label: "Saldo", id: txn.saldoId, docRef: saldoRef(txn.saldoId) },
		{
			label: "Category",
			id: txn.categoryId,
			docRef: categoryRef(txn.categoryId),
		},
	];
	if (txn.type === TransactionType.TRANSFER) {
		const toAccountId = txn.toAccountId ?? "";
		const toSaldoId = txn.toSaldoId ?? "";
		targets.push(
			{
				label: "Destination account",
				id: toAccountId,
				docRef: accountRef(toAccountId),
			},
			{
				label: "Destination saldo",
				id: toSaldoId,
				docRef: saldoRef(toSaldoId),
			},
		);
	}
	return targets;
}

const refsOf = (items: { docRef: DocumentReference }[]) =>
	items.map((item) => item.docRef);

function strip(input: UpdateTransactionInput): UpdateTransactionInput {
	return Object.fromEntries(
		Object.entries(input ?? {}).filter(([, value]) => value !== undefined),
	) as UpdateTransactionInput;
}

/**
 * A transfer's destination may repeat the origin's account or its saldo — a
 * move between saldos inside one account, or between accounts under one saldo
 * — but not both, since that would move nothing. The clash is reported on both
 * fields, because changing either one resolves it.
 */
function validateDestination(
	input: CreateTransactionInput,
): Record<string, string | null> {
	const toAccountId = nonEmptyString(input.toAccountId);
	const toSaldoId = nonEmptyString(input.toSaldoId);
	const sameEnds =
		toAccountId === null &&
		toSaldoId === null &&
		input.toAccountId === input.accountId &&
		input.toSaldoId === input.saldoId;
	const clash = sameEnds
		? "account and saldo cannot both match the origin"
		: null;
	return {
		toAccountId: toAccountId ?? clash,
		toSaldoId: toSaldoId ?? clash,
	};
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
		...(input?.type === TransactionType.TRANSFER
			? validateDestination(input)
			: {}),
	});
}

function normalize(input: CreateTransactionInput): Omit<Transaction, "id"> {
	const data = {
		date: input.date,
		description: input.description.trim(),
		totalAmount: round2(input.totalAmount),
		realAmount: round2(input.realAmount),
		accountId: input.accountId,
		saldoId: input.saldoId,
		categoryId: input.categoryId,
		type: input.type,
	};
	// Only a transfer stores a destination. Turning one into an expense drops
	// it, since every write here is a `tx.set` of the whole document.
	return input.type === TransactionType.TRANSFER
		? { ...data, toAccountId: input.toAccountId, toSaldoId: input.toSaldoId }
		: data;
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
 * Verifies everything a transaction points at (see `targetsOf`). Saldo and
 * category are independent dimensions, so each is checked only for existence
 * and active status — any category may pair with any saldo.
 *
 * `enforceActive` lists the document paths the caller is newly pointing at: an
 * archived target may never receive a *new* posting, but an existing
 * transaction must stay editable even after its account has been archived.
 */
function checkTargets(
	snaps: Snapshots,
	targets: Target[],
	enforceActive: Set<string>,
): string | null {
	for (const target of targets) {
		const snap = snaps.get(target.docRef.path);
		if (!snap?.exists) {
			return `${target.label} "${target.id}" was not found`;
		}
		const entity = withId<Account | Saldo | Category>(snap);
		if (entity.archived && enforceActive.has(target.docRef.path)) {
			return `${target.label} "${target.id}" is archived`;
		}
	}

	return null;
}

/**
 * Deltas are accumulated per document before any write, so an edit that keeps
 * the same account (reverse the old amount, apply the new one) collapses into a
 * single balance write instead of two that would overwrite each other. The same
 * holds inside one transfer whose ends share an account or a saldo.
 */
function accumulate(deltas: Map<string, Delta>, moves: Posting[]): void {
	for (const { docRef, delta } of moves) {
		const running = deltas.get(docRef.path) ?? NO_DELTA;
		deltas.set(docRef.path, {
			total: running.total + delta.total,
			real: running.real + delta.real,
		});
	}
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
			const targets = targetsOf(data);
			// Firestore requires every read before the first write.
			const snaps = await readAll(tx, refsOf(targets));
			const problem = checkTargets(
				snaps,
				targets,
				new Set(targets.map((target) => target.docRef.path)),
			);
			if (problem) {
				return fail<Transaction>(problem);
			}

			const deltas = new Map<string, Delta>();
			accumulate(deltas, postings(data));

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

		// A transfer belongs to both of its ends, so filtering by either account
		// (or either saldo) finds it.
		const matches = snap.docs
			.map((doc) => withId<Transaction>(doc))
			.filter(
				(txn) =>
					(!filters.accountId ||
						txn.accountId === filters.accountId ||
						txn.toAccountId === filters.accountId) &&
					(!filters.saldoId ||
						txn.saldoId === filters.saldoId ||
						txn.toSaldoId === filters.saldoId) &&
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
			const oldTargets = targetsOf(current);
			const newTargets = targetsOf(next);
			const snaps = await readAll(tx, [
				...refsOf(oldTargets),
				...refsOf(newTargets),
			]);
			// Only what the transaction did not already point at must be active —
			// in any role, so reversing a transfer's direction is not a new posting.
			const kept = new Set(oldTargets.map((target) => target.docRef.path));
			const reassigned = new Set(
				newTargets
					.map((target) => target.docRef.path)
					.filter((path) => !kept.has(path)),
			);
			const problem = checkTargets(snaps, newTargets, reassigned);
			if (problem) {
				return fail<Transaction>(problem);
			}

			const deltas = new Map<string, Delta>();
			accumulate(deltas, postings(current, -1));
			accumulate(deltas, postings(next));

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
			const reversal = postings(current, -1);
			const snaps = await readAll(tx, refsOf(reversal));

			const deltas = new Map<string, Delta>();
			accumulate(deltas, reversal);

			tx.delete(docRef);
			writeBalances(tx, snaps, deltas);

			return ok(current);
		});
	} catch (cause) {
		return failFrom<Transaction>("Could not delete the transaction", cause);
	}
}

/*
 * Duplication deliberately has no action of its own. A server-side copy would
 * have to write immediately, and these transactions are recurrent but *not*
 * fixed — the amount usually needs a tweak first. `/transactions/new?from=<id>`
 * prefills the form from `getTransaction` instead, so nothing is written until
 * the figures have been checked.
 */
