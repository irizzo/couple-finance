"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
	createTransaction,
	deleteTransaction,
	updateTransaction,
} from "@/database/transactions.actions";
import { parseAmount } from "@/lib/money";
import { ledgerHref } from "@/lib/shared";
import type { CreateTransactionInput, TransactionType } from "@/types";
import {
	type FormState,
	formValues,
	fromResult,
	presentField,
	textField,
} from "./form-state";
import { requireUser } from "./session";

/**
 * Form adapters for transactions.
 *
 * A transaction write moves balances on **both** the account and the saldo it
 * references, and those balances surface on the settings screens as well as
 * here — so these revalidate the whole tree rather than one route.
 *
 * Create and update redirect to the ledger, or to the shared dashboard when
 * the form carries `returnTo=shared`. `ledgerHref` matches that value against
 * the one allowed, so the field cannot point the redirect anywhere else.
 */

const MONTH_LENGTH = 7; // "YYYY-MM" out of an ISO "YYYY-MM-DD"

function readInput(formData: FormData): CreateTransactionInput {
	return {
		date: textField(formData, "date"),
		description: textField(formData, "description"),
		totalAmount: parseAmount(formData.get("totalAmount")),
		realAmount: parseAmount(formData.get("realAmount")),
		accountId: textField(formData, "accountId"),
		// Absent, not `""`, when the form has no saldo fields (saldos off).
		saldoId: presentField(formData, "saldoId"),
		categoryId: textField(formData, "categoryId"),
		// Unvalidated on the way in; `enumValue` in the action rejects anything
		// that is not a real TransactionType and reports it as a field error.
		type: textField(formData, "type") as TransactionType,
		// Read whatever the type: the data layer requires them on a transfer and
		// drops them from anything else.
		toAccountId: textField(formData, "toAccountId"),
		toSaldoId: presentField(formData, "toSaldoId"),
		// An unchecked box is not submitted at all, so absent means "not
		// shared"; the data layer also refuses to share anything but an expense.
		shared: textField(formData, "shared") === "on",
		// Rendered only while the box is checked. Absent, an edit keeps the
		// stored part; the data layer requires one only on a shared expense.
		sharedAmount: formData.has("sharedAmount")
			? parseAmount(formData.get("sharedAmount"))
			: undefined,
	};
}

export async function createTransactionForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	const user = await requireUser();
	const result = await createTransaction(user, readInput(formData));
	if (!result.ok) {
		return fromResult(result, formValues(formData));
	}
	revalidatePath("/", "layout");
	// Land on the month the transaction belongs to, not the month the form was
	// opened from — they differ whenever you backdate or duplicate forward.
	redirect(
		ledgerHref(
			result.data.date.slice(0, MONTH_LENGTH),
			textField(formData, "returnTo"),
		),
	);
}

export async function updateTransactionForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	const user = await requireUser();
	const result = await updateTransaction(
		user,
		textField(formData, "id"),
		readInput(formData),
	);
	if (!result.ok) {
		return fromResult(result, formValues(formData));
	}
	revalidatePath("/", "layout");
	redirect(
		ledgerHref(
			result.data.date.slice(0, MONTH_LENGTH),
			textField(formData, "returnTo"),
		),
	);
}

/**
 * Transactions are hard-deleted — nothing references them — and the balances
 * they moved are unwound in the same atomic step by the data layer. No redirect:
 * this is invoked from a row, and the ledger should stay put.
 */
export async function deleteTransactionForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	const user = await requireUser();
	const result = await deleteTransaction(user, textField(formData, "id"));
	if (result.ok) {
		revalidatePath("/", "layout");
	}
	return fromResult(result);
}
