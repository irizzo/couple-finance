import {
	archiveAccountForm,
	createAccountForm,
	unarchiveAccountForm,
	updateAccountForm,
} from "@/app/_actions/accounts";
import { ArchivedToggle } from "@/components/ArchivedToggle";
import { BalanceEntityManager } from "@/components/BalanceEntityManager";
import { ErrorBanner } from "@/components/ErrorBanner";
import type { EntityLabels } from "@/components/entity-labels";
import { listAccounts } from "@/database/accounts.actions";
import styles from "../../pages.module.css";

const PATH = "/settings/accounts";

const LABELS: EntityLabels = {
	name: "Nome da conta",
	placeholder: "Conta corrente",
	empty: "Nenhuma conta cadastrada ainda.",
	archivedTag: "arquivada",
	archiveConfirm:
		'Arquivar "{name}"? Os lançamentos existentes continuam intactos, mas novos lançamentos nesta conta serão recusados.',
};

interface AccountsPageProps {
	searchParams: Promise<{ archived?: string }>;
}

export default async function AccountsPage({
	searchParams,
}: AccountsPageProps) {
	const { archived } = await searchParams;
	const includeArchived = archived === "1";
	const result = await listAccounts({ includeArchived });

	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<h1>Contas</h1>
				<ArchivedToggle
					basePath={PATH}
					hideLabel="Ocultar contas arquivadas"
					showArchived={includeArchived}
					showLabel="Mostrar contas arquivadas"
				/>
			</div>
			<p className={styles.lead}>
				Onde o dinheiro realmente entra e sai. O <strong>saldo total</strong> é
				o que saiu do banco; o <strong>saldo real</strong> desconta a parte de
				outras pessoas nas despesas divididas.
			</p>
			{result.ok ? (
				<BalanceEntityManager
					actions={{
						create: createAccountForm,
						update: updateAccountForm,
						archive: archiveAccountForm,
						unarchive: unarchiveAccountForm,
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
