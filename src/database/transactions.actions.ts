import "server-only";

import type {
	DocumentData,
	DocumentReference,
	DocumentSnapshot,
	Transaction as FirestoreTransaction,
} from "firebase-admin/firestore";
import { COLLECTIONS, withId } from "@/database/collections";
import db from "@/database/db";
import { notFound, owned, ref } from "@/database/entities";
import { type ActionResult, fail, failFrom, ok } from "@/database/result";
import {
	collect,
	enumValue,
	type FieldErrors,
	isoDate,
	nonEmptyString,
	nonNegativeNumber,
	optionalId,
	round2,
} from "@/database/validators";
import {
	type Account,
	type Category,
	type CreateTransactionInput,
	type Owner,
	type Saldo,
	type SharedTransaction,
	type Transaction,
	type TransactionFilters,
	TransactionType,
	type UpdateTransactionInput,
	type Viewer,
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
 * A saldo moves only when the document names one. The document decides, not
 * the owner's current saldo mode: a transaction recorded with saldos off moves
 * accounts only, and one recorded before they were switched off still moves
 * its saldo.
 *
 * Pass `sign: -1` to reverse a posting.
 */
function postings(txn: Posted, sign = 1): Posting[] {
	const moves: Posting[] = [];
	const move = (docRef: DocumentReference, direction: number) =>
		moves.push({
			docRef,
			delta: {
				total: sign * direction * txn.totalAmount,
				real: sign * direction * txn.realAmount,
			},
		});
	const transfer = txn.type === TransactionType.TRANSFER;
	// A transfer's origin is debited like an expense.
	const direction = transfer || txn.type === TransactionType.EXPENSE ? -1 : 1;
	move(accountRef(txn.accountId), direction);
	if (txn.saldoId) {
		move(saldoRef(txn.saldoId), direction);
	}
	if (transfer) {
		// Validation refuses a transfer without a destination account, so the
		// fallback only meets a document written outside the app — and `doc("")`
		// throws, which the caller's catch turns into a failed result.
		move(accountRef(txn.toAccountId ?? ""), 1);
		if (txn.toSaldoId) {
			move(saldoRef(txn.toSaldoId), 1);
		}
	}
	return moves;
}

interface Target {
	label: string;
	id: string;
	docRef: DocumentReference;
}

/**
 * Everything a transaction points at: its account, category and saldo (when it
 * has one), plus a transfer's destination account and saldo (likewise).
 */
function targetsOf(txn: Posted & Pick<Transaction, "categoryId">): Target[] {
	const targets: Target[] = [
		{ label: "Account", id: txn.accountId, docRef: accountRef(txn.accountId) },
		{
			label: "Category",
			id: txn.categoryId,
			docRef: categoryRef(txn.categoryId),
		},
	];
	if (txn.saldoId) {
		targets.push({
			label: "Saldo",
			id: txn.saldoId,
			docRef: saldoRef(txn.saldoId),
		});
	}
	if (txn.type === TransactionType.TRANSFER) {
		const toAccountId = txn.toAccountId ?? "";
		targets.push({
			label: "Destination account",
			id: toAccountId,
			docRef: accountRef(toAccountId),
		});
		if (txn.toSaldoId) {
			targets.push({
				label: "Destination saldo",
				id: txn.toSaldoId,
				docRef: saldoRef(txn.toSaldoId),
			});
		}
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
 *
 * With no saldo on either end, the accounts alone must differ, and the clash is
 * reported on the account only: with saldos off, the form has no saldo field
 * to show it on.
 */
function validateDestination(
	input: CreateTransactionInput,
	useSaldos: boolean,
): Record<string, string | null> {
	const toAccountId = nonEmptyString(input.toAccountId);
	const toSaldoId = useSaldos
		? nonEmptyString(input.toSaldoId)
		: optionalId(input.toSaldoId);
	// `""` and absent both mean "no saldo".
	const fromSaldo = input.saldoId || undefined;
	const toSaldo = input.toSaldoId || undefined;
	const saldoInvolved = fromSaldo !== undefined || toSaldo !== undefined;
	const sameEnds =
		toAccountId === null &&
		toSaldoId === null &&
		input.toAccountId === input.accountId &&
		toSaldo === fromSaldo;
	let clash: string | null = null;
	if (sameEnds) {
		clash = saldoInvolved
			? "account and saldo cannot both match the origin"
			: "must differ from the origin account";
	}
	return {
		toAccountId: toAccountId ?? clash,
		toSaldoId: toSaldoId ?? (saldoInvolved ? clash : null),
	};
}

/**
 * With saldos on, a write must carry a saldo (and a transfer a destination
 * saldo); with them off, it need not. Either way a saldo that is there is
 * checked like any other target, so editing an older transaction with saldos
 * off keeps, and still moves, the saldo it was recorded with.
 */
function validate(
	input: CreateTransactionInput,
	useSaldos: boolean,
): FieldErrors | null {
	const amountsAreNumbers =
		nonNegativeNumber(input?.totalAmount) === null &&
		nonNegativeNumber(input?.realAmount) === null;
	const totalIsNumber = nonNegativeNumber(input?.totalAmount) === null;
	return collect({
		date: isoDate(input?.date),
		description: nonEmptyString(input?.description),
		accountId: nonEmptyString(input?.accountId),
		saldoId: useSaldos
			? nonEmptyString(input?.saldoId)
			: optionalId(input?.saldoId),
		categoryId: nonEmptyString(input?.categoryId),
		type: enumValue(input?.type, Object.values(TransactionType)),
		totalAmount: nonNegativeNumber(input?.totalAmount),
		realAmount:
			nonNegativeNumber(input?.realAmount) ??
			(amountsAreNumbers && input.realAmount > input.totalAmount
				? "cannot be greater than the total amount"
				: null),
		...(input?.type === TransactionType.TRANSFER
			? validateDestination(input, useSaldos)
			: {}),
		// Only checked where it is stored. Like `realAmount`, it may not exceed
		// the total, but it is not checked against `realAmount`: a bill split with
		// other people too leaves room for their parts.
		...(storesShare(input)
			? {
					sharedAmount:
						nonNegativeNumber(input.sharedAmount) ??
						(totalIsNumber && (input.sharedAmount as number) > input.totalAmount
							? "cannot be greater than the total amount"
							: null),
				}
			: {}),
	});
}

/** A shared expense is the only document that stores `sharedAmount`. */
function storesShare(input: CreateTransactionInput | undefined): boolean {
	return input?.type === TransactionType.EXPENSE && input.shared === true;
}

/**
 * The document to store, field by field, so nothing else in `input` is ever
 * written. The owner comes from the argument, never from the input. `shared`
 * is always written, and is `true` only on an expense: as with a transfer's
 * destination, changing the type drops it, and with it `sharedAmount`, which
 * is stored only beside `shared: true`. A saldo is stored only when there is
 * one, never as `""`.
 */
function normalize(
	input: CreateTransactionInput,
	owner: Owner,
): Omit<Transaction, "id"> {
	const data: Omit<Transaction, "id"> = {
		date: input.date,
		description: input.description.trim(),
		totalAmount: round2(input.totalAmount),
		realAmount: round2(input.realAmount),
		accountId: input.accountId,
		categoryId: input.categoryId,
		type: input.type,
		ownerId: owner.id,
		shared: storesShare(input),
	};
	if (data.shared) {
		data.sharedAmount = round2(input.sharedAmount as number);
	}
	if (input.saldoId) {
		data.saldoId = input.saldoId;
	}
	// Only a transfer stores a destination. Turning one into an expense drops
	// it, since every write here is a `tx.set` of the whole document.
	if (input.type === TransactionType.TRANSFER) {
		data.toAccountId = input.toAccountId;
		if (input.toSaldoId) {
			data.toSaldoId = input.toSaldoId;
		}
	}
	return data;
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
 * category are independent dimensions, so each is checked only for existence,
 * ownership and active status — any category may pair with any saldo.
 *
 * Each target must belong to the transaction's owner, and one that does not is
 * "not found", exactly like a missing one. This is what stops a forged form
 * from posting to, or transferring into, the partner's account.
 *
 * `enforceActive` lists the document paths the caller is newly pointing at: an
 * archived target may never receive a *new* posting, but an existing
 * transaction must stay editable even after its account has been archived.
 */
function checkTargets(
	snaps: Snapshots,
	targets: Target[],
	enforceActive: Set<string>,
	owner: Owner,
): string | null {
	for (const target of targets) {
		const snap = snaps.get(target.docRef.path);
		if (!(snap && owned(snap, owner))) {
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
	owner: Owner,
	input: CreateTransactionInput,
): Promise<ActionResult<Transaction>> {
	const fieldErrors = validate(input, owner.useSaldos);
	if (fieldErrors) {
		return fail<Transaction>("Invalid transaction", fieldErrors);
	}

	try {
		return await db.runTransaction(async (tx) => {
			const data = normalize(input, owner);
			const targets = targetsOf(data);
			// Firestore requires every read before the first write.
			const snaps = await readAll(tx, refsOf(targets));
			const problem = checkTargets(
				snaps,
				targets,
				new Set(targets.map((target) => target.docRef.path)),
				owner,
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
	owner: Owner,
	id: string,
): Promise<ActionResult<Transaction>> {
	if (nonEmptyString(id)) {
		return fail<Transaction>("A transaction id is required");
	}
	try {
		const snap = await ref(COLLECTIONS.transactions).doc(id).get();
		if (!owned(snap, owner)) {
			return notFound<Transaction>(LABEL, id);
		}
		return ok(withId<Transaction>(snap));
	} catch (cause) {
		return failFrom<Transaction>("Could not load the transaction", cause);
	}
}

/**
 * `date` is a zero-padded ISO string, so a lexicographic range is a correct
 * month filter and needs no composite index. The owner and the optional id
 * filters are applied in memory for the same reason: an equality on `ownerId`
 * beside the range on `date` would need a composite index.
 */
export async function listTransactions(
	owner: Owner,
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
			.filter((doc) => owned(doc, owner))
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

/**
 * The shared expenses of the viewer and of the viewer's partner, in a date
 * range, newest first: **the only read that crosses owners.**
 *
 * It returns the `SharedTransaction` projection, built field by field, even
 * for the viewer's own rows: never the account, the saldo or the real amount.
 * `sharedAmount` is in it on purpose: it is what the other person owes.
 * Whatever renders this cannot leak a field it was never given (the DTO
 * pattern from Next's authentication guide).
 *
 * The same date-range query as `listTransactions`; the owners, `shared` and
 * the type are filtered in memory, for the same reason. The partner is the
 * viewer's stored `partnerId`, which only `createUser` writes, never anything
 * from a request. Category names come from each owner's own categories,
 * archived ones included, so a row never borrows the other person's name for
 * an id.
 */
export async function listSharedTransactions(
	viewer: Viewer,
	range: Pick<TransactionFilters, "from" | "to">,
): Promise<ActionResult<SharedTransaction[]>> {
	const fieldErrors = collect({
		from: isoDate(range?.from),
		to: isoDate(range?.to),
	});
	if (fieldErrors) {
		return fail<SharedTransaction[]>("Invalid range", fieldErrors);
	}
	if (range.from > range.to) {
		return fail<SharedTransaction[]>(
			"The start date must not be after the end date",
		);
	}
	// A viewer without an id sees nothing, not even through a `partnerId`, as
	// an owner without an id matches nothing in `owned`.
	const isId = (id: unknown): id is string =>
		typeof id === "string" && id !== "";
	if (!isId(viewer?.id)) {
		return ok([]);
	}
	const owners = isId(viewer.partnerId)
		? [viewer.id, viewer.partnerId]
		: [viewer.id];

	try {
		const [snap, ...categorySnaps] = await Promise.all([
			ref(COLLECTIONS.transactions)
				.where("date", ">=", range.from)
				.where("date", "<=", range.to)
				.orderBy("date", "desc")
				.get(),
			...owners.map((id) =>
				ref(COLLECTIONS.categories).where("ownerId", "==", id).get(),
			),
		]);
		const categoryNames = new Map(
			owners.map((id, index) => [
				id,
				new Map(
					categorySnaps[index].docs.map((doc) => [
						doc.id,
						String(doc.get("name")),
					]),
				),
			]),
		);

		const rows = snap.docs
			.filter(
				(doc) =>
					doc.get("shared") === true &&
					doc.get("type") === TransactionType.EXPENSE &&
					owners.includes(doc.get("ownerId")),
			)
			.map((doc): SharedTransaction => {
				const ownerId: string = doc.get("ownerId");
				return {
					id: doc.id,
					date: doc.get("date"),
					description: doc.get("description"),
					totalAmount: doc.get("totalAmount"),
					// Every shared expense stores one; none was shared before the
					// field existed (checked on 2026-11-03), so 0 meets only a
					// document edited outside the app.
					sharedAmount: doc.get("sharedAmount") ?? 0,
					categoryName:
						categoryNames.get(ownerId)?.get(doc.get("categoryId")) ??
						"(removida)",
					ownerId,
				};
			});
		return ok(rows);
	} catch (cause) {
		return failFrom<SharedTransaction[]>(
			"Could not list the shared transactions",
			cause,
		);
	}
}

export async function updateTransaction(
	owner: Owner,
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
			if (!owned(snap, owner)) {
				return notFound<Transaction>(LABEL, id);
			}

			const current = withId<Transaction>(snap);
			// A field the form did not send (`undefined`, dropped by `strip`) keeps
			// its stored value: with saldos off the form has no saldo fields, and
			// the transaction keeps its saldo.
			const merged = { ...current, ...patch };
			const fieldErrors = validate(merged, owner.useSaldos);
			if (fieldErrors) {
				return fail<Transaction>("Invalid transaction", fieldErrors);
			}
			// The whole document is rewritten with `tx.set`, so `normalize` has to
			// write `ownerId` and `shared` again, or an edit would erase them.
			const next = normalize(merged, owner);

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
			const problem = checkTargets(snaps, newTargets, reassigned, owner);
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
	owner: Owner,
	id: string,
): Promise<ActionResult<Transaction>> {
	try {
		return await db.runTransaction(async (tx) => {
			const docRef = ref(COLLECTIONS.transactions).doc(id);
			const snap = await tx.get(docRef);
			if (!owned(snap, owner)) {
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
