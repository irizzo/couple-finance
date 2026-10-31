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
		// Every caller of `currentMonth` / `today` is a Server Component, so their
		// "local time" is the server process's. Pinned to the users' own zone, so
		// the month-boundary specs mean the same thing on any machine.
		// biome-ignore lint/style/useNamingConvention: an environment variable.
		env: { TZ: "America/Sao_Paulo" },
	},
});
