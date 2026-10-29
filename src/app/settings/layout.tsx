import { NavLink } from "@/components/NavLink";
import styles from "./settings.module.css";

/**
 * Sub-navigation shared by the three settings screens. `NavLink` prefix-matches,
 * so the top-level "Configurações" link stays highlighted while any of these is
 * open.
 */
export default function SettingsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className={styles.wrap}>
			<nav aria-label="Configurações" className={styles.subnav}>
				<NavLink href="/settings/accounts">Contas</NavLink>
				<NavLink href="/settings/saldos">Saldos</NavLink>
				<NavLink href="/settings/categories">Categorias</NavLink>
			</nav>
			{children}
		</div>
	);
}
