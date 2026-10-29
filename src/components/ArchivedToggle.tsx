import Link from "next/link";
import styles from "./ArchivedToggle.module.css";

interface ArchivedToggleProps {
	basePath: string;
	showArchived: boolean;
	/** Full sentence, because the gender agrees with the entity: "Mostrar contas arquivadas". */
	showLabel: string;
	hideLabel: string;
}

/**
 * Toggles `?archived=1`, which the page turns into `includeArchived` for the
 * list action. A link rather than client state: the server does the filtering,
 * so the URL should say which view you are looking at.
 */
export function ArchivedToggle({
	basePath,
	showArchived,
	showLabel,
	hideLabel,
}: ArchivedToggleProps) {
	return (
		<Link
			className={styles.toggle}
			href={showArchived ? basePath : `${basePath}?archived=1`}
		>
			{showArchived ? hideLabel : showLabel}
		</Link>
	);
}
