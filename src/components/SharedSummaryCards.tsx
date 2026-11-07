import Link from "next/link";
import { paymentHref, type Settlement, type SharedSummary } from "@/lib/shared";
import controls from "./controls.module.css";
import { Money } from "./Money";
import styles from "./SummaryCards.module.css";

interface SharedSummaryCardsProps {
	summary: SharedSummary;
	viewerId: string;
	partnerName: string;
	/** The month in view: the acerto a payment registered from here settles. */
	month: string;
	/**
	 * False while a category filter is on: the cards then show one category's
	 * acerto, which is not what anyone pays.
	 */
	offerPayment: boolean;
}

/**
 * "Você deve R$ 30,00 a Ana" or "Ana deve R$ 30,00 a você", in the present
 * for what is left and in the past ("devia", lowercase, mid-sentence) for what
 * was owed before the payments.
 */
function owing(
	settlement: Settlement,
	viewerId: string,
	partnerName: string,
	tense: "deve" | "devia",
): React.ReactNode {
	const you = tense === "deve" ? "Você" : "você";
	return settlement.debtorId === viewerId ? (
		<>
			{you} {tense} <Money value={settlement.amount} /> a {partnerName}
		</>
	) : (
		<>
			{partnerName} {tense} <Money value={settlement.amount} /> a você
		</>
	);
}

/**
 * The shared month at a glance. Each card leads with the **shared** figure,
 * the part of whoever did not pay, which is what the settlement nets, and
 * carries the total underneath, as the ledger's cards lead with the real
 * figure. These follow the category filter but never the owner filter (see
 * `sharedDashboard`).
 *
 * The Acerto card shows what is left after the payments toward this month,
 * with what was owed before them beneath when there are any. While the viewer
 * owes something (and no category is filtered), it offers "Registrar
 * pagamento", a plain link to the create form prefilled with the amount, so
 * this stays a Server Component.
 */
export function SharedSummaryCards({
	summary,
	viewerId,
	partnerName,
	month,
	offerPayment,
}: SharedSummaryCardsProps) {
	const { settlement, payments } = summary;
	const settlementText =
		settlement === null
			? "Tudo certo"
			: owing(settlement, viewerId, partnerName, "deve");
	const before =
		summary.beforePayments === null
			? "não havia nada a acertar"
			: owing(summary.beforePayments, viewerId, partnerName, "devia");
	const paid = [
		payments.viewer > 0 && (
			<span key="viewer">
				você <Money value={payments.viewer} />
			</span>
		),
		payments.partner > 0 && (
			<span key="partner">
				{partnerName} <Money value={payments.partner} />
			</span>
		),
	].filter(Boolean);

	return (
		<div className={styles.grid}>
			<div className={styles.card}>
				<span className={styles.label}>Total compartilhado</span>
				<span className={styles.value}>
					<Money secondary={summary.total.total} value={summary.total.shared} />
				</span>
				<span className={styles.count}>
					{summary.count === 1 ? "1 despesa" : `${summary.count} despesas`}
				</span>
			</div>
			<div className={styles.card}>
				<span className={styles.label}>Pago por você</span>
				<span className={styles.value}>
					<Money
						secondary={summary.paid.viewer.total}
						value={summary.paid.viewer.shared}
					/>
				</span>
				<span className={styles.count}>parte de {partnerName}</span>
			</div>
			<div className={styles.card}>
				<span className={styles.label}>Pago por {partnerName}</span>
				<span className={styles.value}>
					<Money
						secondary={summary.paid.partner.total}
						value={summary.paid.partner.shared}
					/>
				</span>
				<span className={styles.count}>sua parte</span>
			</div>
			<div className={styles.card}>
				<span className={styles.label}>Acerto</span>
				<span className={styles.sentence}>{settlementText}</span>
				{paid.length > 0 && (
					<span className={styles.count}>
						Antes dos pagamentos, {before}. Pagamentos: {paid[0]}
						{paid.length > 1 && <> · {paid[1]}</>}.
					</span>
				)}
				{offerPayment &&
					settlement !== null &&
					settlement.debtorId === viewerId && (
						<Link
							className={`${controls.button} ${controls.compact} ${styles.cardAction}`}
							href={paymentHref(month, settlement.amount)}
						>
							Registrar pagamento
						</Link>
					)}
			</div>
		</div>
	);
}
