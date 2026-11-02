import "server-only";

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
	Owner,
	UpdateAccountInput,
} from "@/types";

const COLLECTION = COLLECTIONS.accounts;
const LABEL = "Account";

export async function createAccount(
	owner: Owner,
	input: CreateAccountInput,
): Promise<ActionResult<Account>> {
	return createBalanceEntity<Account>(owner, COLLECTION, input, LABEL);
}

export async function getAccount(
	owner: Owner,
	id: string,
): Promise<ActionResult<Account>> {
	return getEntity<Account>(owner, COLLECTION, id, LABEL);
}

export async function listAccounts(
	owner: Owner,
	options: ListOptions = {},
): Promise<ActionResult<Account[]>> {
	return listEntities<Account>(owner, COLLECTION, LABEL, options);
}

export async function updateAccount(
	owner: Owner,
	id: string,
	input: UpdateAccountInput,
): Promise<ActionResult<Account>> {
	return updateBalanceEntity<Account>(owner, COLLECTION, id, input, LABEL);
}

/** Accounts are never hard-deleted: transactions keep pointing at them. */
export async function archiveAccount(
	owner: Owner,
	id: string,
): Promise<ActionResult<Account>> {
	return setArchived<Account>(owner, COLLECTION, id, true, LABEL);
}

export async function unarchiveAccount(
	owner: Owner,
	id: string,
): Promise<ActionResult<Account>> {
	return setArchived<Account>(owner, COLLECTION, id, false, LABEL);
}
