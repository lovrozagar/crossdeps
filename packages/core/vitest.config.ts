import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		exclude: ["**/node_modules/**", "**/dist/**"],
		include: ["tests/**/*.test.ts"],
		passWithNoTests: true,
	},
})
