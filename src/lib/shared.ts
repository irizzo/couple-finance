import { round2 } from "@/database/validators";
import type { SharedTransaction } from "@/types";

/**
 * The shared dashboard's arithmetic, over the rows `listSharedTransactions`
 * returns. Pure and Firestore-free, like `rollup.ts`: the page fetches, these
 * reduce. Each figure is a pair: the `sharedAmount`, the part of whoever did
 * not pay, which the settlement nets, and the `totalAmount` beside it. The
 * real amount is the owner's alone and never reaches this module.
 */

/** Combining diacritical marks, which NFD splits off their letter. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

const NOTHING: SharedPair = { shared: 0, total: 0 };

function add(pair: SharedPair, row: SharedTransaction): SharedPair {
	return {
		shared: pair.shared + row.sharedAmount,
		total: pair.total + row.totalAmount,
	};
}

function rounded(pair: SharedPair): SharedPair {
	return { shared: round2(pair.shared), total: round2(pair.total) };
}

/**
 * The merge key for a category name: trimmed, lowercased, accents removed.
 * "Mercado", "mercado " and "Mêrcado" are one category on the dashboard, since
 * each person names their own.
 */
export function categoryKey(name: string): string {
	return name
		.normalize("NFD")
		.replace(COMBINING_MARKS, "")
		.toLowerCase()
		.trim();
}

export interface SharedCategoryOption {
	key: string;
	label: string;
}

/**
 * One option per merged category, sorted by key. The label is the viewer's own
 * spelling when they have one, else the partner's.
 */
export function sharedCategoryOptions(
	rows: SharedTransaction[],
	viewerId: string,
): SharedCategoryOption[] {
	const labels = new Map<string, { label: string; own: boolean }>();
	for (const row of rows) {
		const key = categoryKey(row.categoryName);
		const own = row.ownerId === viewerId;
		const current = labels.get(key);
		if (current === undefined || (own && !current.own)) {
			labels.set(key, { label: row.categoryName, own });
		}
	}
	return [...labels]
		.map(([key, { label }]) => ({ key, label }))
		.sort((a, b) => a.key.localeCompare(b.key, "pt-BR"));
}

export interface SharedFilterValues {
	ownerId?: string;
	/** Already a `categoryKey`. */
	categoryKey?: string;
}

export function filterShared(
	rows: SharedTransaction[],
	filters: SharedFilterValues,
): SharedTransaction[] {
	return rows.filter(
		(row) =>
			(filters.ownerId === undefined || row.ownerId === filters.ownerId) &&
			(filters.categoryKey === undefined ||
				categoryKey(row.categoryName) === filters.categoryKey),
	);
}

/** Who owes whom once both people's parts are netted. */
export interface Settlement {
	debtorId: string;
	creditorId: string;
	amount: number;
}

/** A sum of shared parts, and of the totals they were taken from. */
export interface SharedPair {
	shared: number;
	total: number;
}

export interface SharedSummary {
	/** Both people's expenses together: `paid.viewer + paid.partner`. */
	total: SharedPair;
	/**
	 * By who paid. `paid.viewer.shared` is what the partner owes the viewer,
	 * and `paid.partner.shared` what the viewer owes the partner.
	 */
	paid: { viewer: SharedPair; partner: SharedPair };
	count: number;
	/** `null` when the two parts cancel out, or when there is no partner. */
	settlement: Settlement | null;
}

/**
 * The cards' figures. A row owned by anyone but the two people is left out of
 * every figure, so `total` is always the sum of the two `paid`.
 *
 * The settlement nets what each owes the other: the partner's parts of what
 * the viewer paid, against the viewer's parts of what the partner paid. Any
 * split is expressed by the parts themselves, so there is no 50/50 here.
 */
export function sharedSummary(
	rows: SharedTransaction[],
	viewerId: string,
	partnerId: string | null,
): SharedSummary {
	let viewer = NOTHING;
	let partner = NOTHING;
	let count = 0;
	for (const row of rows) {
		if (row.ownerId === viewerId) {
			viewer = add(viewer, row);
			count += 1;
		} else if (partnerId && row.ownerId === partnerId) {
			partner = add(partner, row);
			count += 1;
		}
	}
	const paid = { viewer: rounded(viewer), partner: rounded(partner) };
	// Positive: the partner owes the viewer.
	const net = round2(paid.viewer.shared - paid.partner.shared);

	let settlement: Settlement | null = null;
	if (partnerId && net !== 0) {
		settlement =
			net > 0
				? { debtorId: partnerId, creditorId: viewerId, amount: net }
				: { debtorId: viewerId, creditorId: partnerId, amount: -net };
	}
	return {
		total: rounded({
			shared: paid.viewer.shared + paid.partner.shared,
			total: paid.viewer.total + paid.partner.total,
		}),
		paid,
		count,
		settlement,
	};
}

export interface SharedDashboard {
	/** Follows the category filter only. */
	summary: SharedSummary;
	/** Follows both filters. */
	rows: SharedTransaction[];
	/** From every row of the month, so filtering never empties the select. */
	categories: SharedCategoryOption[];
}

/**
 * The whole page from one month's rows.
 *
 * **The cards ignore the owner filter.** Narrowing them to one person would
 * zero the other's card and turn the settlement into nonsense; only the table
 * narrows. A selected category this month does not have still gets an
 * option, labelled with its key, so the select shows the filter that emptied
 * the table instead of falling back to "Todas".
 */
export function sharedDashboard(
	rows: SharedTransaction[],
	people: { viewerId: string; partnerId: string | null },
	filters: SharedFilterValues,
): SharedDashboard {
	const categories = sharedCategoryOptions(rows, people.viewerId);
	const selected = filters.categoryKey;
	if (
		selected !== undefined &&
		!categories.some((option) => option.key === selected)
	) {
		categories.push({ key: selected, label: selected });
		categories.sort((a, b) => a.key.localeCompare(b.key, "pt-BR"));
	}
	return {
		summary: sharedSummary(
			filterShared(rows, { categoryKey: selected }),
			people.viewerId,
			people.partnerId,
		),
		rows: filterShared(rows, filters),
		categories,
	};
}

/**
 * The `returnTo` value that sends a transaction form back to the dashboard
 * instead of the ledger. It arrives from a URL and a form field, so it is
 * matched against this one value and never used as a path: there is no
 * open-redirect surface.
 */
export const RETURN_TO_SHARED = "shared";

export function resolveReturnTo(
	value: unknown,
): typeof RETURN_TO_SHARED | undefined {
	return value === RETURN_TO_SHARED ? RETURN_TO_SHARED : undefined;
}

/** `/shared` for `returnTo=shared`, `/transactions` for anything else. */
export function ledgerPath(returnTo: unknown): string {
	return resolveReturnTo(returnTo) ? "/shared" : "/transactions";
}

export function ledgerHref(month: string, returnTo: unknown): string {
	return `${ledgerPath(returnTo)}?month=${month}`;
}
