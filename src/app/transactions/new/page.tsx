import Link from "next/link";
import { requireUser } from "@/app/_actions/session";
import { createTransactionForm } from "@/app/_actions/transactions";
import { ErrorBanner } from "@/components/ErrorBanner";
import {
	TransactionForm,
	type TransactionFormValues,
} from "@/components/TransactionForm";
import {
	settleMonthOptions,
	toOptions,
} from "@/components/transaction-options";
import { listAccounts } from "@/database/accounts.actions";
import { listCategories } from "@/database/categories.actions";
import { listSaldos } from "@/database/saldos.actions";
import { getTransaction } from "@/database/transactions.actions";
import { getPartnerName } from "@/database/users.actions";
import { parseAmount } from "@/lib/money";
import {
	currentMonth,
	formatMonthLabel,
	isMonth,
	resolveMonth,
	today,
} from "@/lib/month";
import { ledgerHref, resolveReturnTo } from "@/lib/shared";
import styles from "../../pages.module.css";

interface NewTransactionPageProps {
	searchParams: Promise<{
		month?: string;
		from?: string;
		returnTo?: string;
		/** From the Acerto card: open as a payment toward this month's acerto. */
		settles?: string;
		amount?: string;
	}>;
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
	shared: false,
	settlement: false,
	sharedAmount: "",
	settlesMonth: "",
};

export default async function NewTransactionPage({
	searchParams,
}: NewTransactionPageProps) {
	const user = await requireUser();
	const {
		month: requested,
		from,
		returnTo: requestedReturn,
		settles: requestedSettles,
		amount: requestedAmount,
	} = await searchParams;
	const month = resolveMonth(requested);
	// Opened from the shared dashboard, the way back and the redirect after
	// saving go there instead of to the ledger.
	const returnTo = resolveReturnTo(requestedReturn);
	// "Registrar pagamento" on the Acerto card names the month the payment
	// settles, and the way back from it is that month's dashboard. A malformed
	// value is ignored, like any hand-edited parameter.
	const settles =
		!from && isMonth(requestedSettles) ? requestedSettles : undefined;
	const backHref = ledgerHref(
		settles !== undefined && returnTo ? settles : month,
		returnTo,
	);
	const backLabel = returnTo ? "Voltar ao compartilhado" : "Voltar ao extrato";

	// Opening the form from a past or future month pre-dates it to that month's
	// first day instead of today: otherwise saving would redirect to a different
	// month than the one being read. Today is still the default for the current
	// month, which is the common case and what duplication relies on.
	const defaultDate = month === currentMonth() ? today() : `${month}-01`;

	// Active entities only: an archived target may not receive a *new* posting,
	// so offering one would only produce a rejection.
	const [accounts, saldos, categories, partner, source] = await Promise.all([
		listAccounts(user),
		listSaldos(user),
		listCategories(user),
		getPartnerName(user),
		from ? getTransaction(user, from) : Promise.resolve(null),
	]);

	// A payment needs the partner it is paid to: without one, the form has no
	// sharing radios to carry it.
	const paying = settles !== undefined && partner.ok && partner.data !== null;
	let heading = "Novo lançamento";
	if (from) {
		heading = "Duplicar lançamento";
	} else if (paying) {
		heading = "Registrar pagamento";
	}

	const header = (
		<div className={styles.header}>
			<h1>{heading}</h1>
			<Link href={backHref}>{backLabel}</Link>
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
	if (!partner.ok) {
		return (
			<div className={styles.page}>
				{header}
				<ErrorBanner>{partner.error}</ErrorBanner>
			</div>
		);
	}

	if (
		accounts.data.length === 0 ||
		(user.useSaldos && saldos.data.length === 0) ||
		categories.data.length === 0
	) {
		return (
			<div className={styles.page}>
				{header}
				<p className={styles.lead}>
					É preciso ter ao menos{" "}
					{user.useSaldos
						? "uma conta, um saldo e uma categoria ativos"
						: "uma conta e uma categoria ativas"}{" "}
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
					saldoId: source.data.saldoId ?? "",
					categoryId: source.data.categoryId,
					type: source.data.type,
					toAccountId: source.data.toAccountId ?? "",
					toSaldoId: source.data.toSaldoId ?? "",
					shared: source.data.shared === true,
					settlement: source.data.settlement === true,
					sharedAmount:
						source.data.sharedAmount === undefined
							? ""
							: String(source.data.sharedAmount),
					settlesMonth: source.data.settlesMonth ?? "",
				}
			: { ...BLANK, date: defaultDate };
	// From the Acerto card: dated today (the link carries no `month`), for what
	// is owed, as a despesa whose real share is all of it. Nothing is written
	// until submit, so the amount can still be changed for a partial payment.
	if (paying && settles !== undefined) {
		const amount = parseAmount(requestedAmount ?? null);
		const owed = Number.isFinite(amount) && amount > 0 ? String(amount) : "";
		Object.assign(initial, {
			description: `Acerto com ${partner.data} · ${formatMonthLabel(settles)}`,
			totalAmount: owed,
			realAmount: owed,
			settlement: true,
			settlesMonth: settles,
		});
	}

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
				partnerName={partner.data}
				returnTo={returnTo}
				saldos={toOptions(saldos.data, "(arquivado)")}
				settleMonths={settleMonthOptions(currentMonth(), initial.settlesMonth)}
				showSaldos={user.useSaldos}
				submitLabel={paying ? "Registrar pagamento" : "Salvar lançamento"}
			/>
		</div>
	);
}
