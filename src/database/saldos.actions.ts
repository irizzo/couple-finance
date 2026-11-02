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
	CreateSaldoInput,
	ListOptions,
	Owner,
	Saldo,
	UpdateSaldoInput,
} from "@/types";

const COLLECTION = COLLECTIONS.saldos;
const LABEL = "Saldo";

export async function createSaldo(
	owner: Owner,
	input: CreateSaldoInput,
): Promise<ActionResult<Saldo>> {
	return createBalanceEntity<Saldo>(owner, COLLECTION, input, LABEL);
}

export async function getSaldo(
	owner: Owner,
	id: string,
): Promise<ActionResult<Saldo>> {
	return getEntity<Saldo>(owner, COLLECTION, id, LABEL);
}

export async function listSaldos(
	owner: Owner,
	options: ListOptions = {},
): Promise<ActionResult<Saldo[]>> {
	return listEntities<Saldo>(owner, COLLECTION, LABEL, options);
}

export async function updateSaldo(
	owner: Owner,
	id: string,
	input: UpdateSaldoInput,
): Promise<ActionResult<Saldo>> {
	return updateBalanceEntity<Saldo>(owner, COLLECTION, id, input, LABEL);
}

/** Saldos are never hard-deleted: categories and transactions reference them. */
export async function archiveSaldo(
	owner: Owner,
	id: string,
): Promise<ActionResult<Saldo>> {
	return setArchived<Saldo>(owner, COLLECTION, id, true, LABEL);
}

export async function unarchiveSaldo(
	owner: Owner,
	id: string,
): Promise<ActionResult<Saldo>> {
	return setArchived<Saldo>(owner, COLLECTION, id, false, LABEL);
}
