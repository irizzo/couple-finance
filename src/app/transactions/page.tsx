import { MonthNav } from "@/components/MonthNav";
import { Placeholder } from "@/components/Placeholder";
import { resolveMonth } from "@/lib/month";
import styles from "../pages.module.css";

/** `searchParams` is a Promise in Next 16 — it has to be awaited. */
interface TransactionsPageProps {
	searchParams: Promise<{ month?: string }>;
}

export default async function TransactionsPage({
	searchParams,
}: TransactionsPageProps) {
	const { month: requested } = await searchParams;
	const month = resolveMonth(requested);

	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<h1>Transações</h1>
				<MonthNav basePath="/transactions" month={month} />
			</div>
			<Placeholder phase="Fase 4">
				O extrato mensal entra aqui: resumo do mês, filtros por conta, saldo e
				categoria, e a tabela de lançamentos.
			</Placeholder>
		</div>
	);
}
