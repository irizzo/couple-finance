import { MonthNav } from "@/components/MonthNav";
import { Placeholder } from "@/components/Placeholder";
import { resolveMonth } from "@/lib/month";
import styles from "../pages.module.css";

interface BudgetPageProps {
	searchParams: Promise<{ month?: string }>;
}

export default async function BudgetPage({ searchParams }: BudgetPageProps) {
	const { month: requested } = await searchParams;
	const month = resolveMonth(requested);

	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<h1>Orçamento</h1>
				<MonthNav basePath="/budget" month={month} />
			</div>
			<Placeholder phase="Fase 6">
				O planejamento mensal entra aqui: duas tabelas independentes, uma por
				saldo e uma por categoria, com planejado, realizado e saldo restante.
			</Placeholder>
		</div>
	);
}
