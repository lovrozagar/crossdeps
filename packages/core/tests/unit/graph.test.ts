import { describe, expect, it, vi } from "vitest"
import type { SystemDepConfig } from "../../src/config.ts"
import { sortByDependencies } from "../../src/graph.ts"

function dep(overrides: Partial<SystemDepConfig> = {}): SystemDepConfig {
	return {
		description: "test dep",
		os: { all: "echo ok" },
		required: true,
		version: "1.0.0",
		...overrides,
	}
}

describe("sortByDependencies", () => {
	it("puts dependsOn targets first", () => {
		const sorted = sortByDependencies([
			["npm", dep({ dependsOn: ["node"] })],
			["node", dep()],
		])
		expect(sorted.map(([name]) => name)).toEqual(["node", "npm"])
	})

	it("walks a deeper chain", () => {
		const sorted = sortByDependencies([
			["cli", dep({ dependsOn: ["npm"] })],
			["npm", dep({ dependsOn: ["node"] })],
			["node", dep()],
		])
		expect(sorted.map(([name]) => name)).toEqual(["node", "npm", "cli"])
	})

	it("ignores dependsOn names that are not in the set", () => {
		const sorted = sortByDependencies([["agent-browser", dep({ dependsOn: ["rust"] })]])
		expect(sorted.map(([name]) => name)).toEqual(["agent-browser"])
	})

	it("breaks cycles without duplicating entries", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		const sorted = sortByDependencies([
			["a", dep({ dependsOn: ["b"] })],
			["b", dep({ dependsOn: ["a"] })],
		])
		expect(sorted.map(([name]) => name).sort()).toEqual(["a", "b"])
		expect(warn).toHaveBeenCalled()
		warn.mockRestore()
	})
})
