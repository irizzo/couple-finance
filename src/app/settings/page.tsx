import { Placeholder } from "@/components/Placeholder";
import styles from "../pages.module.css";

export default function SettingsPage() {
	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<h1>Configurações</h1>
			</div>
			<p className={styles.lead}>
				Contas, saldos e categorias. Saldos são genéricos ("Essenciais") e
				categorias são específicas ("Moradia", "Mercado") — desde a Fase 1 as
				duas são independentes: qualquer categoria combina com qualquer saldo.
			</p>
			<Placeholder phase="Fase 3">
				O CRUD de contas, saldos e categorias entra aqui. É o primeiro passo
				utilizável do app: sem conta, saldo e categoria não existe transação
				para lançar.
			</Placeholder>
		</div>
	);
}
