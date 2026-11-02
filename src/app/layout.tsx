import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { signOutForm } from "@/app/_actions/auth";
import { hasSession } from "@/app/_actions/session";
import { NavLink } from "@/components/NavLink";
import "./globals.css";
import styles from "./layout.module.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Couple Finance",
	description:
		"Organizador de finanças com despesas divididas: valor total pago e valor real devido.",
};

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	// Only /login is outside the proxy, so in practice this hides the nav there
	// and nowhere else.
	const signedIn = await hasSession();

	return (
		<html
			className={`${geistSans.variable} ${geistMono.variable}`}
			lang="pt-BR"
		>
			<body>
				<div className={styles.shell}>
					<header className={styles.header}>
						<div className={styles.headerInner}>
							<span className={styles.brand}>Couple Finance</span>
							{signedIn && (
								<nav aria-label="Seções" className={styles.nav}>
									<NavLink href="/transactions">Transações</NavLink>
									<NavLink href="/budget">Orçamento</NavLink>
									<NavLink href="/settings">Configurações</NavLink>
									<form action={signOutForm} className={styles.signOut}>
										<button className={styles.signOutButton} type="submit">
											Sair
										</button>
									</form>
								</nav>
							)}
						</div>
					</header>
					<main className={styles.main}>{children}</main>
				</div>
			</body>
		</html>
	);
}
