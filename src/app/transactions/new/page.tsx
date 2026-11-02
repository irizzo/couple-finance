import Link from "next/link";
import { createTransactionForm } from "@/app/_actions/transactions";
import { ErrorBanner } from "@/components/ErrorBanner";
import {
	TransactionForm,
	type TransactionFormValues,
} from "@/components/TransactionForm";
import { toOptions } from "@/components/transaction-options";
import { listAccounts } from "@/database/accounts.actions";
import { listCategories } from "@/database/categories.actions";
import { listSaldos } from "@/database/saldos.actions";
import { getTransaction } from "@/database/transactions.actions";
import { currentMonth, resolveMonth, today } from "@/lib/month";
import styles from "../../pages.module.css";

interface NewTransactionPageProps {
	searchParams: Promise<{ month?: string; from?: string }>;
}

const BLANK: TransactionFormValues = {
	date: "",
	description: "",
	totalAmount: "",
	realAmount: "",
	accountId: "",
	saldoId: "",
	categoryId: "",
	type: "expense",
	toAccountId: "",
	toSaldoId: "",
};

export default async function NewTransactionPage({
	searchParams,
}: NewTransactionPageProps) {
	const { month: requested, from } = await searchParams;
	const month = resolveMonth(requested);
	const backHref = `/transactions?month=${month}`;

	// Opening the form from a past or future month pre-dates it to that month's
	// first day instead of today: otherwise saving would redirect to a different
	// month than the one being read. Today is still the default for the current
	// month, which is the common case and what duplication relies on.
	const defaultDate = month === currentMonth() ? today() : `${month}-01`;

	// Active entities only: an archived target may not receive a *new* posting,
	// so offering one would only produce a rejection.
	const [accounts, saldos, categories, source] = await Promise.all([
		listAccounts(),
		listSaldos(),
		listCategories(),
		from ? getTransaction(from) : Promise.resolve(null),
	]);

	const header = (
		<div className={styles.header}>
			<h1>{from ? "Duplicar lançamento" : "Novo lançamento"}</h1>
			<Link href={backHref}>Voltar ao extrato</Link>
		</div>
	);

	if (!accounts.ok) {
		return (
			<div className={styles.page}>
				{header}
				<ErrorBanner>{accounts.error}</ErrorBanner>
			</div>
		);
	}
	if (!saldos.ok) {
		return (
			<div className={styles.page}>
				{header}
				<ErrorBanner>{saldos.error}</ErrorBanner>
			</div>
		);
	}
	if (!categories.ok) {
		return (
			<div className={styles.page}>
				{header}
				<ErrorBanner>{categories.error}</ErrorBanner>
			</div>
		);
	}

	if (
		accounts.data.length === 0 ||
		saldos.data.length === 0 ||
		categories.data.length === 0
	) {
		return (
			<div className={styles.page}>
				{header}
				<p className={styles.lead}>
					É preciso ter ao menos uma conta, um saldo e uma categoria ativos
					antes de lançar uma transação.{" "}
					<Link href="/settings/accounts">Ir para configurações</Link>.
				</p>
			</div>
		);
	}

	// Duplicating copies everything but the date, which resets to the default for
	// the month in view: the point of the feature is not retyping a recurrent
	// expense whose amount may still need a tweak. Nothing is written until submit.
	const initial: TransactionFormValues =
		source?.ok === true
			? {
					date: defaultDate,
					description: source.data.description,
					totalAmount: String(source.data.totalAmount),
					realAmount: String(source.data.realAmount),
					accountId: source.data.accountId,
					saldoId: source.data.saldoId,
					categoryId: source.data.categoryId,
					type: source.data.type,
					toAccountId: source.data.toAccountId ?? "",
					toSaldoId: source.data.toSaldoId ?? "",
				}
			: { ...BLANK, date: defaultDate };

	return (
		<div className={styles.page}>
			{header}
			{source && !source.ok && (
				<ErrorBanner>
					Não foi possível carregar o lançamento de origem: {source.error}
				</ErrorBanner>
			)}
			<TransactionForm
				accounts={toOptions(accounts.data, "(arquivada)")}
				action={createTransactionForm}
				cancelHref={backHref}
				categories={toOptions(categories.data, "(arquivada)")}
				initial={initial}
				saldos={toOptions(saldos.data, "(arquivado)")}
				submitLabel="Salvar lançamento"
			/>
		</div>
	);
}
