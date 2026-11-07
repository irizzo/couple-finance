import { formatMonthLabel, monthChoices } from "@/lib/month";
import type { SelectOption } from "./TransactionForm";

/** How far back and ahead the "Referente a" select reaches from today. */
const SETTLE_MONTHS_BEFORE = 12;
const SETTLE_MONTHS_AFTER = 1;

interface NamedArchivable {
	id: string;
	name: string;
	archived: boolean;
}

/**
 * Builds the `<select>` options for the transaction form.
 *
 * `archivedSuffix` is supplied by the caller because it agrees in gender —
 * "(arquivada)" for a conta or categoria, "(arquivado)" for a saldo. The edit
 * route passes archived entities through on purpose: a transaction stays
 * editable after its account has been archived, and an active-only list would
 * silently drop the value it currently holds.
 */
export function toOptions(
	entities: NamedArchivable[],
	archivedSuffix: string,
): SelectOption[] {
	return entities.map((entity) => ({
		id: entity.id,
		label: entity.archived ? `${entity.name} ${archivedSuffix}` : entity.name,
	}));
}

/**
 * The months a payment may settle, labelled "Outubro de 2026", newest first,
 * around `anchor` (the current month). `keep` is the value already chosen,
 * kept on offer even when it falls outside the range.
 */
export function settleMonthOptions(
	anchor: string,
	keep?: string,
): SelectOption[] {
	return monthChoices(
		anchor,
		SETTLE_MONTHS_BEFORE,
		SETTLE_MONTHS_AFTER,
		keep,
	).map((month) => ({ id: month, label: formatMonthLabel(month) }));
}
