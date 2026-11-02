import "server-only";

import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { budgetDocId, COLLECTIONS, withId } from "@/database/collections";
import db from "@/database/db";
import { assertActive, notFound, owned, ref } from "@/database/entities";
import { type ActionResult, fail, failFrom, ok } from "@/database/result";
import {
	collect,
	enumValue,
	isoMonth,
	nonEmptyString,
	nonNegativeNumber,
	round2,
} from "@/database/validators";
import type { Budget, BudgetScope, Owner, SetBudgetInput } from "@/types";

const COLLECTION = COLLECTIONS.budgets;
const LABEL = "Budget";
const SCOPES: readonly BudgetScope[] = ["saldo", "category"];

/**
 * Budgets: one planned amount per (month, scope, target).
 *
 * Two things set this collection apart from the others:
 *
 * * **The document id is derived, not generated** — `${month}__${scope}__${targetId}`.
 *   A target is then unique by construction, so an upsert needs no
 *   duplicate-detection query and no transaction, and a double-submitted form is
 *   idempotent rather than a second row.
 * * **Budgets hard-delete.** Nothing references a budget document, so the
 *   soft-delete treatment accounts/saldos/categories get would only add a field
 *   nobody reads. Clearing a planned amount removes the record.
 *
 * Budgets are per user, because their targets are. The derived id needs no
 * owner in it: target ids are globally unique, and each target has exactly one
 * owner. Each document still stores `ownerId`, so a month can be listed per
 * user.
 */

/** The collection each scope points into. */
function collectionFor(scope: BudgetScope): string {
	return scope === "saldo" ? COLLECTIONS.saldos : COLLECTIONS.categories;
}

function labelFor(scope: BudgetScope): string {
	return scope === "saldo" ? "Saldo" : "Category";
}

/** The ids in one entity collection that may still receive a plan. */
function activeIds(docs: QueryDocumentSnapshot[]): Set<string> {
	return new Set(
		docs.filter((doc) => doc.data().archived !== true).map((doc) => doc.id),
	);
}

/**
 * Creates or replaces the planned amount for one target in one month.
 *
 * The target is checked with the shared `assertActive` from `entities.ts` — the
 * same guard transactions use, which is why it was generalized in Phase 1
 * instead of staying a saldo-only helper. It also has to be the owner's, so
 * the document this replaces, whose id names that target, is the owner's too.
 */
export async function setBudget(
	owner: Owner,
	input: SetBudgetInput,
): Promise<ActionResult<Budget>> {
	const fieldErrors = collect({
		month: isoMonth(input?.month),
		scope: enumValue(input?.scope, SCOPES),
		targetId: nonEmptyString(input?.targetId),
		plannedAmount: nonNegativeNumber(input?.plannedAmount),
	});
	if (fieldErrors) {
		return fail<Budget>("Invalid budget", fieldErrors);
	}

	try {
		const problem = await assertActive(
			owner,
			collectionFor(input.scope),
			input.targetId,
			labelFor(input.scope),
		);
		if (problem) {
			return fail<Budget>(problem);
		}

		const id = budgetDocId(input);
		const data = {
			month: input.month,
			scope: input.scope,
			targetId: input.targetId,
			plannedAmount: round2(input.plannedAmount),
			ownerId: owner.id,
		};
		await ref(COLLECTION).doc(id).set(data);
		return ok({ id, ...data });
	} catch (cause) {
		return failFrom<Budget>("Could not save the budget", cause);
	}
}

/**
 * The owner's budgets for one month, both scopes. A single equality filter, with
 * the owner and the scope applied in memory — same reason the other actions
 * filter in memory: pairing two Firestore filters would need a composite index
 * for nothing.
 */
export async function listBudgets(
	owner: Owner,
	month: string,
): Promise<ActionResult<Budget[]>> {
	if (isoMonth(month)) {
		return fail<Budget[]>("A budget month in the YYYY-MM format is required");
	}
	try {
		const snap = await ref(COLLECTION).where("month", "==", month).get();
		return ok(
			snap.docs
				.filter((doc) => owned(doc, owner))
				.map((doc) => withId<Budget>(doc)),
		);
	} catch (cause) {
		return failFrom<Budget[]>("Could not list the budgets", cause);
	}
}

export async function deleteBudget(
	owner: Owner,
	id: string,
): Promise<ActionResult<Budget>> {
	if (nonEmptyString(id)) {
		return fail<Budget>("A budget id is required");
	}
	try {
		const docRef = ref(COLLECTION).doc(id);
		const snap = await docRef.get();
		if (!owned(snap, owner)) {
			return notFound<Budget>(LABEL, id);
		}
		const existing = withId<Budget>(snap);
		await docRef.delete();
		return ok(existing);
	} catch (cause) {
		return failFrom<Budget>("Could not delete the budget", cause);
	}
}

/**
 * Seeds one month from another — the recurrent-planning convenience, since most
 * targets carry the same figure month to month.
 *
 * Deliberately **additive**: a target already planned in `toMonth` is left
 * alone, and a target whose saldo or category has since been archived is
 * skipped. Copying is a shortcut for typing, so it must never overwrite a
 * number the user set by hand.
 *
 * Only the owner's budgets are copied, and only onto the owner's saldos and
 * categories.
 */
export async function copyBudgets(
	owner: Owner,
	fromMonth: string,
	toMonth: string,
): Promise<ActionResult<{ copied: number; skipped: number }>> {
	const fieldErrors = collect({
		fromMonth: isoMonth(fromMonth),
		toMonth: isoMonth(toMonth),
	});
	if (fieldErrors) {
		return fail<{ copied: number; skipped: number }>(
			"Invalid months",
			fieldErrors,
		);
	}
	if (fromMonth === toMonth) {
		return fail<{ copied: number; skipped: number }>(
			"The source and target months are the same",
		);
	}

	try {
		const [source, target, saldos, categories] = await Promise.all([
			ref(COLLECTION).where("month", "==", fromMonth).get(),
			ref(COLLECTION).where("month", "==", toMonth).get(),
			ref(COLLECTIONS.saldos).where("ownerId", "==", owner.id).get(),
			ref(COLLECTIONS.categories).where("ownerId", "==", owner.id).get(),
		]);

		// One read of each entity collection, rather than an `assertActive` per
		// budget: these are small collections and a copy touches all of them. Kept
		// as one set per scope, so a budget is only ever checked against the
		// collection its `scope` names — the same lookup `setBudget` makes.
		const activeByScope: Record<BudgetScope, Set<string>> = {
			saldo: activeIds(saldos.docs),
			category: activeIds(categories.docs),
		};
		// Every id in `toMonth`, whoever owns it: an id names its target, so a
		// clash can only be the owner's own plan, and skipping is never wrong.
		const existing = new Set(target.docs.map((doc) => doc.id));

		const batch = db.batch();
		let copied = 0;
		let skipped = 0;

		for (const doc of source.docs.filter((each) => owned(each, owner))) {
			const budget = withId<Budget>(doc);
			const id = budgetDocId({ ...budget, month: toMonth });
			// `?.` because `withId` is a blind cast: a stored budget with an unknown
			// scope is skipped rather than crashing the whole copy.
			if (
				existing.has(id) ||
				!activeByScope[budget.scope]?.has(budget.targetId)
			) {
				skipped += 1;
				continue;
			}
			batch.set(ref(COLLECTION).doc(id), {
				month: toMonth,
				scope: budget.scope,
				targetId: budget.targetId,
				plannedAmount: budget.plannedAmount,
				ownerId: owner.id,
			});
			copied += 1;
		}

		if (copied > 0) {
			await batch.commit();
		}
		return ok({ copied, skipped });
	} catch (cause) {
		return failFrom<{ copied: number; skipped: number }>(
			"Could not copy the budgets",
			cause,
		);
	}
}
