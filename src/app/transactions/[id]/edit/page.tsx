import Link from "next/link";
import { updateTransactionForm } from "@/app/_actions/transactions";
import { ErrorBanner } from "@/components/ErrorBanner";
import { TransactionForm } from "@/components/TransactionForm";
import { toOptions } from "@/components/transaction-options";
import { listAccounts } from "@/database/accounts.actions";
import { listCategories } from "@/database/categories.actions";
import { listSaldos } from "@/database/saldos.actions";
import { getTransaction } from "@/database/transactions.actions";
import styles from "../../../pages.module.css";

interface EditTransactionPageProps {
	params: Promise<{ id: string }>;
}

const MONTH_LENGTH = 7;

export default async function EditTransactionPage({
	params,
}: EditTransactionPageProps) {
	const { id } = await params;

	// Archived entities included: an existing transaction stays editable after
	// its account has been archived, and an active-only list would silently drop
	// the value the record currently holds.
	const [existing, accounts, saldos, categories] = await Promise.all([
		getTransaction(id),
		listAccounts({ includeArchived: true }),
		listSaldos({ includeArchived: true }),
		listCategories({ includeArchived: true }),
	]);

	const header = (
		<div className={styles.header}>
			<h1>Editar lançamento</h1>
			<Link href="/transactions">Voltar ao extrato</Link>
		</div>
	);

	// A failed read is reported with its own message rather than flattened into a
	// 404: "was not found" and a Firestore outage are different problems, and the
	// action already distinguishes them.
	if (!existing.ok) {
		return (
			<div className={styles.page}>
				{header}
				<ErrorBanner>{existing.error}</ErrorBanner>
			</div>
		);
	}
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

	const txn = existing.data;
	const backHref = `/transactions?month=${txn.date.slice(0, MONTH_LENGTH)}`;

	return (
		<div className={styles.page}>
			{header}
			<TransactionForm
				accounts={toOptions(accounts.data, "(arquivada)")}
				action={updateTransactionForm}
				cancelHref={backHref}
				categories={toOptions(categories.data, "(arquivada)")}
				initial={{
					date: txn.date,
					description: txn.description,
					totalAmount: String(txn.totalAmount),
					realAmount: String(txn.realAmount),
					accountId: txn.accountId,
					saldoId: txn.saldoId,
					categoryId: txn.categoryId,
					type: txn.type,
				}}
				saldos={toOptions(saldos.data, "(arquivado)")}
				submitLabel="Salvar alterações"
				transactionId={txn.id}
			/>
		</div>
	);
}
