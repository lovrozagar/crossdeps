import { describe, expect, it } from "vitest"
import type { SystemDepConfig } from "../../src/config.ts"
import { defineConfig, interpolate, resolveCheckCommand, resolveOsCommand, versionsMatch } from "../../src/config.ts"

function dep(overrides: Partial<SystemDepConfig> = {}): SystemDepConfig {
	return {
		description: "test dep",
		os: { all: "echo {{name}}-{{version}}" },
		required: true,
		version: "1.2.3",
		...overrides,
	}
}

describe("interpolate", () => {
	it("replaces name, version, and major", () => {
		expect(interpolate("{{name}}@{{version}} ({{major}})", "node", "22.12.0")).toBe("node@22.12.0 (22)")
	})

	it("replaces arch with a known value", () => {
		const result = interpolate("bin-{{arch}}", "jq", "1.8.1")
		expect(result === "bin-arm64" || result === "bin-amd64").toBe(true)
	})

	it("uses the full version as major when there is no dot", () => {
		expect(interpolate("{{major}}", "rust", "stable")).toBe("stable")
	})
})

describe("resolveOsCommand", () => {
	it("uses the specific OS command over all", () => {
		const command = resolveOsCommand(
			"git",
			dep({
				os: {
					all: "echo all",
					"linux-apt": "apt install git={{version}}",
				},
				version: "2.39.5",
			}),
			"linux-apt",
		)
		expect(command).toBe("apt install git=2.39.5")
	})

	it("falls back to all when the OS key is omitted", () => {
		expect(resolveOsCommand("bun", dep({ os: { all: "install {{name}}" } }), "macos")).toBe("install bun")
	})

	it("returns null when the OS is explicitly unavailable", () => {
		expect(resolveOsCommand("dnsmasq", dep({ os: { all: "install dnsmasq", windows: false } }), "windows")).toBeNull()
	})

	it("returns null when neither the OS key nor all is set", () => {
		expect(resolveOsCommand("epiphany", dep({ os: { "linux-apt": "apt install epiphany" } }), "macos")).toBeNull()
	})
})

describe("resolveCheckCommand", () => {
	it("defaults to name --version", () => {
		expect(resolveCheckCommand("node", dep())).toBe("node --version")
	})

	it("interpolates a custom check command", () => {
		expect(resolveCheckCommand("atlas", dep({ check: { command: "{{name}} version {{version}}" } }))).toBe(
			"atlas version 1.2.3",
		)
	})
})

describe("versionsMatch", () => {
	it("treats latest as a match for any parsed version", () => {
		expect(versionsMatch("1.3.11", "latest")).toBe(true)
	})

	it("matches equal strings and substrings either way", () => {
		expect(versionsMatch("24.19.0", "24.19.0")).toBe(true)
		expect(versionsMatch("1.0.1", "v1.0.1-1c2aa24-canary")).toBe(true)
		expect(versionsMatch("v1.0.1-1c2aa24-canary", "1.0.1")).toBe(true)
	})

	it("rejects a different version", () => {
		expect(versionsMatch("25.5.0", "24.19.0")).toBe(false)
	})

	it("rejects stable against a semver string", () => {
		expect(versionsMatch("1.2.3", "stable")).toBe(false)
		expect(versionsMatch("stable", "1.2.3")).toBe(false)
	})
})

describe("defineConfig", () => {
	it("defaults packageJsonPath to package.json", () => {
		const config = defineConfig({ deps: { bun: dep() } })
		expect(config.packageJsonPath).toBe("package.json")
		expect(config.deps.bun?.version).toBe("1.2.3")
	})

	it("keeps an explicit packageJsonPath", () => {
		const config = defineConfig({
			deps: {},
			packageJsonPath: "./apps/web/package.json",
		})
		expect(config.packageJsonPath).toBe("./apps/web/package.json")
	})
})
