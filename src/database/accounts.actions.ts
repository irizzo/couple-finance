"use server";

import { COLLECTIONS } from "@/database/collections";
import {
	createBalanceEntity,
	getEntity,
	listEntities,
	setArchived,
	updateBalanceEntity,
} from "@/database/entities";
import type { ActionResult } from "@/database/result";
import type {
	Account,
	CreateAccountInput,
	ListOptions,
	UpdateAccountInput,
} from "@/types";

const COLLECTION = COLLECTIONS.accounts;
const LABEL = "Account";

export async function createAccount(
	input: CreateAccountInput,
): Promise<ActionResult<Account>> {
	return createBalanceEntity<Account>(COLLECTION, input, LABEL);
}

export async function getAccount(id: string): Promise<ActionResult<Account>> {
	return getEntity<Account>(COLLECTION, id, LABEL);
}

export async function listAccounts(
	options: ListOptions = {},
): Promise<ActionResult<Account[]>> {
	return listEntities<Account>(COLLECTION, LABEL, options);
}

export async function updateAccount(
	id: string,
	input: UpdateAccountInput,
): Promise<ActionResult<Account>> {
	return updateBalanceEntity<Account>(COLLECTION, id, input, LABEL);
}

/** Accounts are never hard-deleted: transactions keep pointing at them. */
export async function archiveAccount(
	id: string,
): Promise<ActionResult<Account>> {
	return setArchived<Account>(COLLECTION, id, true, LABEL);
}

export async function unarchiveAccount(
	id: string,
): Promise<ActionResult<Account>> {
	return setArchived<Account>(COLLECTION, id, false, LABEL);
}
