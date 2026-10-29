"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./NavLink.module.css";

interface NavLinkProps {
	href: string;
	children: React.ReactNode;
}

/**
 * Top-level nav link that marks itself current. Client-side only because
 * `usePathname` is the one thing here that needs the browser; the links
 * themselves are ordinary `<Link>`s.
 *
 * Matches on prefix so `/settings/accounts` still highlights "Configurações".
 */
export function NavLink({ href, children }: NavLinkProps) {
	const pathname = usePathname();
	const active = pathname === href || pathname.startsWith(`${href}/`);

	return (
		<Link
			aria-current={active ? "page" : undefined}
			className={active ? `${styles.link} ${styles.active}` : styles.link}
			href={href}
		>
			{children}
		</Link>
	);
}
