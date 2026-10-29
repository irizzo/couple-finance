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
	CreateSaldoInput,
	ListOptions,
	Saldo,
	UpdateSaldoInput,
} from "@/types";

const COLLECTION = COLLECTIONS.saldos;
const LABEL = "Saldo";

export async function createSaldo(
	input: CreateSaldoInput,
): Promise<ActionResult<Saldo>> {
	return createBalanceEntity<Saldo>(COLLECTION, input, LABEL);
}

export async function getSaldo(id: string): Promise<ActionResult<Saldo>> {
	return getEntity<Saldo>(COLLECTION, id, LABEL);
}

export async function listSaldos(
	options: ListOptions = {},
): Promise<ActionResult<Saldo[]>> {
	return listEntities<Saldo>(COLLECTION, LABEL, options);
}

export async function updateSaldo(
	id: string,
	input: UpdateSaldoInput,
): Promise<ActionResult<Saldo>> {
	return updateBalanceEntity<Saldo>(COLLECTION, id, input, LABEL);
}

/** Saldos are never hard-deleted: categories and transactions reference them. */
export async function archiveSaldo(id: string): Promise<ActionResult<Saldo>> {
	return setArchived<Saldo>(COLLECTION, id, true, LABEL);
}

export async function unarchiveSaldo(id: string): Promise<ActionResult<Saldo>> {
	return setArchived<Saldo>(COLLECTION, id, false, LABEL);
}
