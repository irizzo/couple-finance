import { round2 } from "@/database/validators";

/**
 * Currency display and form parsing. Pure, so it cannot live in a `"use server"`
 * module. Rounding is delegated to `round2` from the data layer's validators —
 * there is one definition of "money has two decimal places" in this codebase.
 */

const BRL = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

/**
 * `<input type="number">` submits a dot decimal ("90.5"), but a pasted value may
 * arrive pt-BR formatted ("1.234,56") — a comma means the dots are thousands
 * separators.
 */
function normalizeDecimal(raw: string): string {
	return raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
}

export function formatCurrency(value: number): string {
	return BRL.format(value);
}

/**
 * Parses a money field out of a `FormData` entry. Returns `NaN` for anything
 * missing or unparseable rather than coercing to 0, so the data layer's
 * `finiteNumber` validator rejects it and the field gets a real error message —
 * silently saving a R$0 transaction would be worse than refusing it.
 */
export function parseAmount(value: FormDataEntryValue | null): number {
	if (typeof value !== "string" || value.trim() === "") {
		return Number.NaN;
	}
	const parsed = Number(normalizeDecimal(value.trim().replace(/\s/g, "")));
	return Number.isFinite(parsed) ? round2(parsed) : Number.NaN;
}
