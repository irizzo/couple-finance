import { requireUser } from "@/app/_actions/session";
import { deleteTransactionForm } from "@/app/_actions/transactions";
import { ErrorBanner } from "@/components/ErrorBanner";
import { MonthNav } from "@/components/MonthNav";
import { SharedFilters } from "@/components/SharedFilters";
import { SharedSummaryCards } from "@/components/SharedSummaryCards";
import { SharedTable } from "@/components/SharedTable";
import { listSharedTransactions } from "@/database/transactions.actions";
import { getPartnerName } from "@/database/users.actions";
import { formatMonthLabel, resolveMonth } from "@/lib/month";
import { categoryKey, RETURN_TO_SHARED, sharedDashboard } from "@/lib/shared";
import styles from "../pages.module.css";

/** A repeated parameter arrives as an array, which is never a filter. */
type Param = string | string[] | undefined;

interface SharedPageProps {
	searchParams: Promise<{ month?: Param; owner?: Param; category?: Param }>;
}

function single(raw: Param): string | undefined {
	return typeof raw === "string" && raw.trim() !== "" ? raw : undefined;
}

/**
 * Both people's shared expenses for one month: what each paid, each person's
 * part, and the settlement that nets the parts and the payments toward this
 * month's acerto. Everything on it comes from `listSharedTransactions`, the
 * one read that crosses owners, so it can show nothing beyond that
 * projection.
 */
export default async function SharedPage({ searchParams }: SharedPageProps) {
	const user = await requireUser();
	const params = await searchParams;
	const month = resolveMonth(params.month);

	const [shared, partner] = await Promise.all([
		listSharedTransactions(user, month),
		getPartnerName(user),
	]);

	// Only the two people's ids are an owner filter: any other value would
	// empty the table with the select still reading "Ambos". A category is
	// keyed the way the options are, so a hand-typed "Mercado" still matches.
	const owner = single(params.owner);
	const category = single(params.category);
	const selected = {
		owner:
			owner !== undefined && [user.id, user.partnerId].includes(owner)
				? owner
				: undefined,
		category:
			category === undefined ? undefined : categoryKey(category) || undefined,
	};

	const header = (
		<div className={styles.header}>
			<h1>Compartilhado</h1>
			<div className={styles.headerActions}>
				<MonthNav basePath="/shared" month={month} params={selected} />
			</div>
		</div>
	);

	const errorPage = (message: string) => (
		<div className={styles.page}>
			{header}
			<ErrorBanner>{message}</ErrorBanner>
		</div>
	);
	if (!shared.ok) {
		return errorPage(shared.error);
	}
	if (!partner.ok) {
		return errorPage(partner.error);
	}

	const partnerId = user.partnerId;
	const partnerName = partner.data;
	if (!partnerId || partnerName === null) {
		return (
			<div className={styles.page}>
				{header}
				<p className={styles.lead}>
					Aqui aparecem as despesas que vocês dois compartilham, quem pagou cada
					uma, a parte de cada um e o acerto. O painel começa a funcionar quando
					a outra pessoa se cadastrar.
				</p>
			</div>
		);
	}

	const view = sharedDashboard(
		shared.data,
		{ viewerId: user.id, partnerId },
		{ ownerId: selected.owner, categoryKey: selected.category },
	);
	const monthLabel = formatMonthLabel(month);
	const emptyMessage =
		shared.data.length === 0
			? `Nenhuma despesa compartilhada em ${monthLabel}. Para compartilhar uma, escolha “Dividir com ${partnerName}” ao lançar a despesa.`
			: `Nenhuma despesa compartilhada em ${monthLabel} com esses filtros.`;

	return (
		<div className={styles.page}>
			{header}
			<SharedSummaryCards
				month={month}
				offerPayment={selected.category === undefined}
				partnerName={partnerName}
				summary={view.summary}
				viewerId={user.id}
			/>
			<p className={styles.lead}>
				“Compartilhado” é a parte de quem não pagou. O acerto compara o que cada
				um deve ao outro e desconta os pagamentos referentes a{" "}
				{monthLabel.toLowerCase()}, mesmo os feitos depois.
			</p>
			{view.summary.payments.partner > 0 && (
				<p className={styles.lead}>
					O pagamento de {partnerName} já conta no acerto, e você não precisa
					registrá-lo aqui. Para acertar o saldo da sua conta, lance uma receita
					com valor real 0.
				</p>
			)}
			{view.paymentsHidden && (
				<p className={styles.lead}>
					Com uma categoria filtrada, os pagamentos ficam de fora dos cartões e
					da tabela, porque não pertencem a uma categoria.
				</p>
			)}
			{selected.owner && (
				<p className={styles.lead}>
					A tabela mostra só o que{" "}
					{selected.owner === user.id ? "você pagou" : `${partnerName} pagou`}.
					Os cartões continuam somando as duas pessoas, para que o acerto
					continue valendo.
				</p>
			)}
			<SharedFilters
				categories={view.categories}
				month={month}
				partnerId={partnerId}
				partnerName={partnerName}
				selected={selected}
				viewerId={user.id}
			/>
			<SharedTable
				deleteAction={deleteTransactionForm}
				emptyMessage={emptyMessage}
				partnerName={partnerName}
				returnTo={RETURN_TO_SHARED}
				rows={view.rows}
				viewerId={user.id}
			/>
		</div>
	);
}
