import {
	archiveCategoryForm,
	createCategoryForm,
	unarchiveCategoryForm,
	updateCategoryForm,
} from "@/app/_actions/categories";
import { requireUser } from "@/app/_actions/session";
import { ArchivedToggle } from "@/components/ArchivedToggle";
import { ErrorBanner } from "@/components/ErrorBanner";
import type { EntityLabels } from "@/components/entity-labels";
import { NamedEntityManager } from "@/components/NamedEntityManager";
import { listCategories } from "@/database/categories.actions";
import styles from "../../pages.module.css";

const PATH = "/settings/categories";

const LABELS: EntityLabels = {
	name: "Nome da categoria",
	placeholder: "Mercado",
	description: "Descrição da categoria",
	descriptionPlaceholder: "Compras do mês e da feira",
	empty: "Nenhuma categoria cadastrada ainda.",
	archivedTag: "arquivada",
	archiveConfirm:
		'Arquivar "{name}"? Os lançamentos existentes continuam intactos, mas novos lançamentos nesta categoria serão recusados.',
};

interface CategoriesPageProps {
	searchParams: Promise<{ archived?: string }>;
}

export default async function CategoriesPage({
	searchParams,
}: CategoriesPageProps) {
	await requireUser();
	const { archived } = await searchParams;
	const includeArchived = archived === "1";
	const result = await listCategories({ includeArchived });

	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<h1>Categorias</h1>
				<ArchivedToggle
					basePath={PATH}
					hideLabel="Ocultar categorias arquivadas"
					showArchived={includeArchived}
					showLabel="Mostrar categorias arquivadas"
				/>
			</div>
			<p className={styles.lead}>
				O detalhe do gasto — "Moradia", "Mercado", "Saúde". Categorias não
				pertencem a um saldo: qualquer categoria combina com qualquer saldo.
				Elas não carregam saldo próprio, só nomeiam o lançamento.
			</p>
			{result.ok ? (
				<NamedEntityManager
					actions={{
						create: createCategoryForm,
						update: updateCategoryForm,
						archive: archiveCategoryForm,
						unarchive: unarchiveCategoryForm,
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
