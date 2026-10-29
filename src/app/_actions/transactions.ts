"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
	createTransaction,
	deleteTransaction,
	updateTransaction,
} from "@/database/transactions.actions";
import { parseAmount } from "@/lib/money";
import type { CreateTransactionInput, TransactionType } from "@/types";
import {
	type FormState,
	formValues,
	fromResult,
	textField,
} from "./form-state";

/**
 * Form adapters for transactions.
 *
 * A transaction write moves balances on **both** the account and the saldo it
 * references, and those balances surface on the settings screens as well as
 * here — so these revalidate the whole tree rather than one route.
 */

const MONTH_LENGTH = 7; // "YYYY-MM" out of an ISO "YYYY-MM-DD"

function readInput(formData: FormData): CreateTransactionInput {
	return {
		date: textField(formData, "date"),
		description: textField(formData, "description"),
		totalAmount: parseAmount(formData.get("totalAmount")),
		realAmount: parseAmount(formData.get("realAmount")),
		accountId: textField(formData, "accountId"),
		saldoId: textField(formData, "saldoId"),
		categoryId: textField(formData, "categoryId"),
		// Unvalidated on the way in; `enumValue` in the action rejects anything
		// that is not a real TransactionType and reports it as a field error.
		type: textField(formData, "type") as TransactionType,
	};
}

export async function createTransactionForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	const result = await createTransaction(readInput(formData));
	if (!result.ok) {
		return fromResult(result, formValues(formData));
	}
	revalidatePath("/", "layout");
	// Land on the month the transaction belongs to, not the month the form was
	// opened from — they differ whenever you backdate or duplicate forward.
	redirect(`/transactions?month=${result.data.date.slice(0, MONTH_LENGTH)}`);
}

export async function updateTransactionForm(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	const result = await updateTransaction(
		textField(formData, "id"),
		readInput(formData),
	);
	if (!result.ok) {
		return fromResult(result, formValues(formData));
	}
	revalidatePath("/", "layout");
	redirect(`/transactions?month=${result.data.date.slice(0, MONTH_LENGTH)}`);
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
	const result = await deleteTransaction(textField(formData, "id"));
	if (result.ok) {
		revalidatePath("/", "layout");
	}
	return fromResult(result);
}
