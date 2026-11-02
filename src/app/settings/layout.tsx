import { getSessionUser } from "@/app/_actions/session";
import { NavLink } from "@/components/NavLink";
import styles from "./settings.module.css";

/**
 * Sub-navigation shared by the settings screens. `NavLink` prefix-matches, so
 * the top-level "Configurações" link stays highlighted while any of these is
 * open.
 *
 * The Saldos tab is hidden while the user has saldos off. That is display
 * only: each page beneath checks the user itself, and a layout is no place for
 * a check, since it does not re-render on navigation between its pages.
 */
export default async function SettingsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const user = await getSessionUser();

	return (
		<div className={styles.wrap}>
			<nav aria-label="Configurações" className={styles.subnav}>
				<NavLink href="/settings/accounts">Contas</NavLink>
				{user?.useSaldos !== false && (
					<NavLink href="/settings/saldos">Saldos</NavLink>
				)}
				<NavLink href="/settings/categories">Categorias</NavLink>
				<NavLink href="/settings/profile">Perfil</NavLink>
			</nav>
			{children}
		</div>
	);
}
