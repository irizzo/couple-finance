import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { signOutForm } from "@/app/_actions/auth";
import { getSessionUser } from "@/app/_actions/session";
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
	// Only /login and /signup are outside the proxy, so in practice this hides
	// the nav there, and on the way to /login for a token the proxy accepted but
	// whose user is gone or whose password has since changed. `cache` shares this
	// read with the page's own `requireUser`.
	const user = await getSessionUser();

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
							{user && (
								<nav aria-label="Seções" className={styles.nav}>
									<NavLink href="/transactions">Transações</NavLink>
									<NavLink href="/budget">Orçamento</NavLink>
									<NavLink href="/settings">Configurações</NavLink>
									<div className={styles.account}>
										<span className={styles.userName}>{user.name}</span>
										<form action={signOutForm}>
											<button className={styles.signOutButton} type="submit">
												Sair
											</button>
										</form>
									</div>
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
