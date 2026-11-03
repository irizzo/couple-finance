import Link from "next/link";
import { requireUser } from "@/app/_actions/session";
import { updateTransactionForm } from "@/app/_actions/transactions";
import { ErrorBanner } from "@/components/ErrorBanner";
import { TransactionForm } from "@/components/TransactionForm";
import { toOptions } from "@/components/transaction-options";
import { listAccounts } from "@/database/accounts.actions";
import { listCategories } from "@/database/categories.actions";
import { listSaldos } from "@/database/saldos.actions";
import { getTransaction } from "@/database/transactions.actions";
import { getPartnerName } from "@/database/users.actions";
import { ledgerHref, ledgerPath, resolveReturnTo } from "@/lib/shared";
import styles from "../../../pages.module.css";

interface EditTransactionPageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ returnTo?: string }>;
}

const MONTH_LENGTH = 7;

export default async function EditTransactionPage({
	params,
	searchParams,
}: EditTransactionPageProps) {
	const user = await requireUser();
	const { id } = await params;
	// Opened from the shared dashboard, the way back and the redirect after
	// saving go there instead of to the ledger.
	const returnTo = resolveReturnTo((await searchParams).returnTo);
	const backLabel = returnTo ? "Voltar ao compartilhado" : "Voltar ao extrato";

	// Archived entities included: an existing transaction stays editable after
	// its account has been archived, and an active-only list would silently drop
	// the value the record currently holds.
	const [existing, accounts, saldos, categories, partner] = await Promise.all([
		getTransaction(user, id),
		listAccounts(user, { includeArchived: true }),
		listSaldos(user, { includeArchived: true }),
		listCategories(user, { includeArchived: true }),
		getPartnerName(user),
	]);

	// Takes an href because the month is only knowable once the record has been
	// read: it belongs to the transaction, not to the URL that opened the form.
	// Before that, "voltar" can only mean the current month.
	const header = (backHref: string) => (
		<div className={styles.header}>
			<h1>Editar lançamento</h1>
			<Link href={backHref}>{backLabel}</Link>
		</div>
	);

	// A failed read is reported with its own message rather than flattened into a
	// 404: "was not found" and a Firestore outage are different problems, and the
	// action already distinguishes them.
	const errorPage = (message: string) => (
		<div className={styles.page}>
			{header(ledgerPath(returnTo))}
			<ErrorBanner>{message}</ErrorBanner>
		</div>
	);
	if (!existing.ok) {
		return errorPage(existing.error);
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
	if (!partner.ok) {
		return errorPage(partner.error);
	}

	const txn = existing.data;
	const backHref = ledgerHref(txn.date.slice(0, MONTH_LENGTH), returnTo);

	return (
		<div className={styles.page}>
			{header(backHref)}
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
					saldoId: txn.saldoId ?? "",
					categoryId: txn.categoryId,
					type: txn.type,
					toAccountId: txn.toAccountId ?? "",
					toSaldoId: txn.toSaldoId ?? "",
					shared: txn.shared === true,
					sharedAmount:
						txn.sharedAmount === undefined ? "" : String(txn.sharedAmount),
				}}
				partnerName={partner.data}
				returnTo={returnTo}
				saldos={toOptions(saldos.data, "(arquivado)")}
				showSaldos={user.useSaldos}
				submitLabel="Salvar alterações"
				transactionId={txn.id}
			/>
		</div>
	);
}
