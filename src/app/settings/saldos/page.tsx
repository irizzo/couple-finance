import {
	archiveSaldoForm,
	createSaldoForm,
	unarchiveSaldoForm,
	updateSaldoForm,
} from "@/app/_actions/saldos";
import { ArchivedToggle } from "@/components/ArchivedToggle";
import { BalanceEntityManager } from "@/components/BalanceEntityManager";
import { ErrorBanner } from "@/components/ErrorBanner";
import type { EntityLabels } from "@/components/entity-labels";
import { listSaldos } from "@/database/saldos.actions";
import styles from "../../pages.module.css";

const PATH = "/settings/saldos";

const LABELS: EntityLabels = {
	name: "Nome do saldo",
	placeholder: "Essenciais",
	description: "Descrição do saldo",
	descriptionPlaceholder: "Contas fixas, mercado e saúde",
	empty: "Nenhum saldo cadastrado ainda.",
	archivedTag: "arquivado",
	archiveConfirm:
		'Arquivar "{name}"? Os lançamentos existentes continuam intactos, mas novos lançamentos neste saldo serão recusados.',
};

interface SaldosPageProps {
	searchParams: Promise<{ archived?: string }>;
}

export default async function SaldosPage({ searchParams }: SaldosPageProps) {
	const { archived } = await searchParams;
	const includeArchived = archived === "1";
	const result = await listSaldos({ includeArchived });

	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<h1>Saldos</h1>
				<ArchivedToggle
					basePath={PATH}
					hideLabel="Ocultar saldos arquivados"
					showArchived={includeArchived}
					showLabel="Mostrar saldos arquivados"
				/>
			</div>
			<p className={styles.lead}>
				Os grupos amplos de gasto — "Essenciais", "Lazer". Cada transação aponta
				para um saldo e, de forma independente, para uma categoria.
			</p>
			{result.ok ? (
				<BalanceEntityManager
					actions={{
						create: createSaldoForm,
						update: updateSaldoForm,
						archive: archiveSaldoForm,
						unarchive: unarchiveSaldoForm,
					}}
					entities={result.data}
					labels={LABELS}
				/>
			) : (
				<ErrorBanner>{result.error}</ErrorBanner>
			)}
		</div>
	);
}
