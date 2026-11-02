import { defineConfig } from "vitest/config";

/**
 * Specs sit beside the code they cover as `*.spec.ts`. What they cover is pure:
 * nothing under `src/lib` reaches a Firestore handle, so there is nothing to
 * mock.
 */
export default defineConfig({
	resolve: {
		// `@/*` comes from `paths` in tsconfig.json rather than a second copy here.
		tsconfigPaths: true,
	},
	test: {
		include: ["src/**/*.spec.ts"],
		// Deliberately *not* the couple's zone: `month.ts` names São Paulo itself,
		// and the specs prove it never leans on the server's. Pinned so they mean
		// the same thing on any machine; west of São Paulo and with no DST, so the
		// month-boundary instants fall on different dates here and there.
		// biome-ignore lint/style/useNamingConvention: an environment variable.
		env: { TZ: "Pacific/Honolulu" },
	},
});
