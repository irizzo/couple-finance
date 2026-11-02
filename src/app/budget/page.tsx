import Link from "next/link";
import { copyBudgetsForm, setBudgetForm } from "@/app/_actions/budgets";
import { requireUser } from "@/app/_actions/session";
import { BudgetTable } from "@/components/BudgetTable";
import { CopyBudgetsButton } from "@/components/CopyBudgetsButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { MonthNav } from "@/components/MonthNav";
import { listBudgets } from "@/database/budgets.actions";
import { listCategories } from "@/database/categories.actions";
import { listSaldos } from "@/database/saldos.actions";
import { listTransactions } from "@/database/transactions.actions";
import {
	formatMonthLabel,
	monthBounds,
	resolveMonth,
	shiftMonth,
} from "@/lib/month";
import { buildBudgetRows } from "@/lib/rollup";
import styles from "../pages.module.css";

interface BudgetPageProps {
	searchParams: Promise<{ month?: string }>;
}

export default async function BudgetPage({ searchParams }: BudgetPageProps) {
	const user = await requireUser();
	const { month: requested } = await searchParams;
	const month = resolveMonth(requested);
	const { from, to } = monthBounds(month);

	// Archived targets are included so that spend already charged to one stays
	// visible; `buildBudgetRows` drops the archived rows that carry no money.
	const [budgets, transactions, saldos, categories] = await Promise.all([
		listBudgets(user, month),
		listTransactions(user, { from, to }),
		listSaldos(user, { includeArchived: true }),
		listCategories(user, { includeArchived: true }),
	]);

	const header = (
		<div className={styles.header}>
			<h1>Orçamento</h1>
			<MonthNav basePath="/budget" month={month} />
		</div>
	);

	// Each result is narrowed on its own: the generics differ, so one pass over an
	// array of them would not make `.data` reachable.
	const errorPage = (message: string) => (
		<div className={styles.page}>
			{header}
			<ErrorBanner>{message}</ErrorBanner>
		</div>
	);
	if (!budgets.ok) {
		return errorPage(budgets.error);
	}
	if (!transactions.ok) {
		return errorPage(transactions.error);
	}
	if (!saldos.ok) {
		return errorPage(saldos.error);
	}
	if (!categories.ok) {
		return errorPage(categories.error);
	}

	const bySaldo = buildBudgetRows({
		scope: "saldo",
		entities: saldos.data,
		budgets: budgets.data,
		transactions: transactions.data,
	});
	const byCategory = buildBudgetRows({
		scope: "category",
		entities: categories.data,
		budgets: budgets.data,
		transactions: transactions.data,
	});

	const nothingConfigured =
		saldos.data.length === 0 && categories.data.length === 0;

	return (
		<div className={styles.page}>
			{header}

			{nothingConfigured ? (
				<p className={styles.lead}>
					O orçamento é definido sobre os saldos e as categorias — crie ao menos
					um de cada para começar a planejar.{" "}
					<Link href="/settings/saldos">Ir para configurações</Link>.
				</p>
			) : (
				<>
					<p className={styles.lead}>
						Planejado contra gasto <strong>real</strong> — a sua parte, não o
						que saiu da conta, que aparece em cinza embaixo. Só despesas entram:
						uma receita no mês não "paga" um estouro. As duas tabelas somam os
						mesmos lançamentos por eixos independentes, então os totais não se
						correspondem. Deixe o campo vazio para remover um alvo do plano;
						zero é uma meta de verdade.
					</p>
					<CopyBudgetsButton
						action={copyBudgetsForm}
						fromLabel={formatMonthLabel(shiftMonth(month, -1))}
						month={month}
					/>
					<BudgetTable
						archivedLabel="arquivado"
						emptyMessage="Nenhum saldo ativo para planejar."
						month={month}
						section={bySaldo}
						setAction={setBudgetForm}
						targetLabel="Saldo"
						title="Por saldo"
					/>
					<BudgetTable
						archivedLabel="arquivada"
						emptyMessage="Nenhuma categoria ativa para planejar."
						month={month}
						section={byCategory}
						setAction={setBudgetForm}
						targetLabel="Categoria"
						title="Por categoria"
					/>
				</>
			)}
		</div>
	);
}
