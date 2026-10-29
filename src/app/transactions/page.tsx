import Link from "next/link";
import { ErrorBanner } from "@/components/ErrorBanner";
import { MonthNav } from "@/components/MonthNav";
import { SummaryCards } from "@/components/SummaryCards";
import { TransactionFilters } from "@/components/TransactionFilters";
import { TransactionsTable } from "@/components/TransactionsTable";
import { listAccounts } from "@/database/accounts.actions";
import { listCategories } from "@/database/categories.actions";
import { listSaldos } from "@/database/saldos.actions";
import { listTransactions } from "@/database/transactions.actions";
import { formatMonthLabel, monthBounds, resolveMonth } from "@/lib/month";
import { indexById, monthSummary } from "@/lib/rollup";
import styles from "../pages.module.css";

/** `searchParams` is a Promise in Next 16 — it has to be awaited. */
interface TransactionsPageProps {
	searchParams: Promise<{
		month?: string;
		accountId?: string;
		saldoId?: string;
		categoryId?: string;
	}>;
}

/** Empty strings arrive from the "Todas" option; they must not become filters. */
function filterValue(raw: string | undefined): string | undefined {
	return raw && raw.trim() !== "" ? raw : undefined;
}

export default async function TransactionsPage({
	searchParams,
}: TransactionsPageProps) {
	const params = await searchParams;
	const month = resolveMonth(params.month);
	const { from, to } = monthBounds(month);

	const selected = {
		accountId: filterValue(params.accountId),
		saldoId: filterValue(params.saldoId),
		categoryId: filterValue(params.categoryId),
	};

	// Archived entities are included on purpose: a transaction stays editable and
	// listable after its account has been archived, so the lookup has to resolve
	// those ids too.
	const [transactions, accounts, saldos, categories] = await Promise.all([
		listTransactions({ from, to, ...selected }),
		listAccounts({ includeArchived: true }),
		listSaldos({ includeArchived: true }),
		listCategories({ includeArchived: true }),
	]);

	const header = (
		<div className={styles.header}>
			<h1>Transações</h1>
			<MonthNav basePath="/transactions" month={month} params={selected} />
		</div>
	);

	// Checked one at a time rather than through a `.find` over the four results:
	// the actions return differently-typed `ActionResult`s, and only an explicit
	// `!result.ok` per value narrows the union so `.data` is reachable below.
	const errorPage = (message: string) => (
		<div className={styles.page}>
			{header}
			<ErrorBanner>{message}</ErrorBanner>
		</div>
	);
	if (!transactions.ok) {
		return errorPage(transactions.error);
	}
	if (!accounts.ok) {
		return errorPage(accounts.error);
	}
	if (!saldos.ok) {
		return errorPage(saldos.error);
	}
	if (!categories.ok) {
		return errorPage(categories.error);
	}

	const nothingConfigured =
		accounts.data.length === 0 ||
		saldos.data.length === 0 ||
		categories.data.length === 0;

	const filtered = Boolean(
		selected.accountId || selected.saldoId || selected.categoryId,
	);

	return (
		<div className={styles.page}>
			{header}

			{nothingConfigured ? (
				<p className={styles.lead}>
					Antes de lançar uma transação é preciso ter ao menos uma conta, um
					saldo e uma categoria.{" "}
					<Link href="/settings/accounts">Ir para configurações</Link>.
				</p>
			) : (
				<>
					<SummaryCards summary={monthSummary(transactions.data)} />
					<TransactionFilters
						accounts={accounts.data}
						categories={categories.data}
						month={month}
						saldos={saldos.data}
						selected={selected}
					/>
					<TransactionsTable
						accounts={indexById(accounts.data)}
						categories={indexById(categories.data)}
						emptyMessage={
							filtered
								? `Nenhum lançamento em ${formatMonthLabel(month)} com esses filtros.`
								: `Nenhum lançamento em ${formatMonthLabel(month)}.`
						}
						saldos={indexById(saldos.data)}
						transactions={transactions.data}
					/>
				</>
			)}
		</div>
	);
}
