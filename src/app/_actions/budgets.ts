"use server";

import { revalidatePath } from "next/cache";
import {
	copyBudgets,
	deleteBudget,
	setBudget,
} from "@/database/budgets.actions";
import { parseAmount } from "@/lib/money";
import { shiftMonth } from "@/lib/month";
import type { BudgetScope } from "@/types";
import {
	type FormState,
	formValues,
	fromResult,
	textField,
} from "./form-state";

/**
 * Form adapters for budgets.
 *
 * `revalidatePath` targets `/budget` only: a budget is a plan, so writing one
 * moves no balance and changes nothing on the ledger or the settings screens.
 * That is the opposite of a transaction write, which has to revalidate the whole
 * layout.
 */

const PATH = "/budget";

export async function setBudgetForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	const raw = textField(formData, "plannedAmount").trim();
	const budgetId = textField(formData, "budgetId");

	// An emptied field means "stop planning this target", not "plan zero" — zero
	// is a real target (spend nothing here), so the two cannot be conflated.
	if (raw === "") {
		if (budgetId === "") {
			return { status: "ok" };
		}
		const removed = await deleteBudget(budgetId);
		if (removed.ok) {
			revalidatePath(PATH);
		}
		return fromResult(removed);
	}

	const result = await setBudget({
		month: textField(formData, "month"),
		scope: textField(formData, "scope") as BudgetScope,
		targetId: textField(formData, "targetId"),
		plannedAmount: parseAmount(raw),
	});
	if (result.ok) {
		revalidatePath(PATH);
	}
	return fromResult(result, formValues(formData));
}

/**
 * Seeds the month in view from the one before it. Additive by design — see
 * `copyBudgets` — so this is safe to press twice, and says what it did because
 * a no-op and a successful copy look identical on the page otherwise.
 */
export async function copyBudgetsForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	const month = textField(formData, "month");
	const result = await copyBudgets(shiftMonth(month, -1), month);
	if (!result.ok) {
		return fromResult(result);
	}

	revalidatePath(PATH);
	const { copied, skipped } = result.data;
	if (copied === 0 && skipped === 0) {
		return { status: "ok", message: "O mês anterior não tem orçamento." };
	}
	const copiedPart =
		copied === 1 ? "1 valor copiado" : `${copied} valores copiados`;
	const skippedPart =
		skipped === 0 ? "" : ` · ${skipped} já definido(s) ou arquivado(s)`;
	return { status: "ok", message: `${copiedPart}${skippedPart}` };
}
