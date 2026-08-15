import { dirname, join } from "node:path"
import { describe, expect, test } from "bun:test"
import {
	OS_TARGETS,
	resolveCheckCommand,
	resolveOsCommand,
	sortByDependencies,
	type OsTarget,
} from "@scriptgun/crossdeps"
import catalog from "../../../examples/consumer/crossdeps.config.ts"
import { runCli } from "./helpers.ts"

const catalogPath = join(import.meta.dir, "../../../examples/consumer/crossdeps.config.ts")
const catalogDir = dirname(catalogPath)

const NAMES = Object.keys(catalog.deps).sort()

function availableOn(name: string, os: OsTarget): boolean {
	return resolveOsCommand(name, catalog.deps[name]!, os) !== null
}

describe("monorepo catalog — every dep and command", () => {
	test("loads the full 24-dep catalog", () => {
		expect(NAMES).toEqual([
			"agent-browser",
			"android-sdk",
			"android-studio",
			"atlas",
			"bun",
			"claude",
			"cloudflared",
			"deno",
			"dnsmasq",
			"docker",
			"epiphany",
			"firefox",
			"flux",
			"foundry",
			"git",
			"google-chrome",
			"jq",
			"nginx",
			"node",
			"npm",
			"playwright-deps",
			"rust",
			"stripe-cli",
			"tauri-deps",
		])
	})

	test("every resolved install command is interpolated", () => {
		const resolved: Array<{ cmd: string; name: string; os: OsTarget }> = []
		for (const name of NAMES) {
			const dep = catalog.deps[name]!
			for (const os of OS_TARGETS) {
				const cmd = resolveOsCommand(name, dep, os)
				if (cmd) resolved.push({ cmd, name, os })
			}
		}
		expect(resolved.length).toBeGreaterThan(80)
		for (const { cmd, name, os } of resolved) {
			expect(cmd, `${name} on ${os}`).not.toContain("{{")
			expect(cmd.trim().length).toBeGreaterThan(0)
		}
	})

	test("check commands interpolate or default to name --version", () => {
		expect(resolveCheckCommand("adb-missing", catalog.deps["android-sdk"]!)).toBe("adb --version")
		expect(resolveCheckCommand("node", catalog.deps.node!)).toBe("node --version")
		expect(resolveCheckCommand("atlas", catalog.deps.atlas!)).toBe("atlas version")
		expect(resolveCheckCommand("nginx", catalog.deps.nginx!)).toBe("nginx -v 2>&1")
		expect(resolveCheckCommand("stripe-cli", catalog.deps["stripe-cli"]!)).toBe("stripe version")
	})

	test("dependsOn is honored in install order", () => {
		const order = sortByDependencies(Object.entries(catalog.deps)).map(([name]) => name)
		expect(order.indexOf("rust")).toBeLessThan(order.indexOf("agent-browser"))
		expect(order.indexOf("rust")).toBeLessThan(order.indexOf("tauri-deps"))
		expect(order.indexOf("android-sdk")).toBeLessThan(order.indexOf("android-studio"))
		expect(order.indexOf("node")).toBeLessThan(order.indexOf("npm"))
		expect(order.indexOf("npm")).toBeLessThan(order.indexOf("claude"))
	})

	test("env blocks exist on android-sdk, deno, and rust", () => {
		expect(catalog.deps["android-sdk"]?.env?.some((e) => e.key === "ANDROID_HOME")).toBe(true)
		expect(catalog.deps.deno?.env?.some((e) => e.key === "DENO_INSTALL")).toBe(true)
		expect(catalog.deps.rust?.env?.some((e) => e.key === "CARGO_HOME")).toBe(true)
	})

	test("unavailable combinations match the monorepo catalog", () => {
		const missing: Record<string, OsTarget[]> = {
			"android-sdk": ["linux-dnf", "linux-pacman", "windows"],
			"android-studio": ["linux-dnf", "linux-pacman", "windows"],
			dnsmasq: ["windows"],
			epiphany: ["macos", "windows"],
			foundry: ["windows"],
			"google-chrome": ["linux-pacman"],
			"playwright-deps": ["windows"],
		}
		for (const [name, oss] of Object.entries(missing)) {
			for (const os of oss) {
				expect(availableOn(name, os), `${name} should be unavailable on ${os}`).toBe(false)
			}
		}
		expect(availableOn("dnsmasq", "linux-apt")).toBe(true)
		expect(availableOn("tauri-deps", "windows")).toBe(true)
		expect(availableOn("bun", "windows")).toBe(true)
	})

	test("windows commands use choco or powershell, not apt/brew", () => {
		for (const name of NAMES) {
			const cmd = resolveOsCommand(name, catalog.deps[name]!, "windows")
			if (!cmd) continue
			expect(cmd, name).not.toContain("apt-get")
			expect(cmd, name).not.toContain("brew install")
		}
	})

	test("macos commands do not use apt or choco", () => {
		for (const name of NAMES) {
			const cmd = resolveOsCommand(name, catalog.deps[name]!, "macos")
			if (!cmd) continue
			expect(cmd, name).not.toContain("apt-get")
			expect(cmd, name).not.toContain("choco install")
		}
	})
})

describe("CLI dry-run of the monorepo catalog", () => {
	test("prints every dep command for the native OS", async () => {
		const result = await runCli(["install", "--dry-run", "--config", catalogPath], {
			cwd: catalogDir,
		})
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("Dry-run")
		expect(result.stdout).toContain("Found 24 dependencies")
		for (const name of NAMES) {
			expect(result.stdout).toContain(`${name}@`)
		}
	})

	test("dry-run --os windows marks dnsmasq unavailable and uses choco for git", async () => {
		const result = await runCli(
			["install", "--dry-run", "--os", "windows", "--config", catalogPath],
			{ cwd: catalogDir, env: { CROSSDEPS_OS: undefined } },
		)
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("dnsmasq@2.92 — not available on windows")
		expect(result.stdout).toContain("choco install git --version=2.39.5")
		expect(result.stdout).toContain("choco install nodejs --version=22.12.0")
		expect(result.stdout).toContain("irm bun.sh/install.ps1")
	})

	test("dry-run --os macos uses brew and darwin node tarball", async () => {
		const result = await runCli(
			["install", "--dry-run", "--os", "macos", "--config", catalogPath],
			{ cwd: catalogDir, env: { CROSSDEPS_OS: undefined } },
		)
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("brew install git")
		expect(result.stdout).toContain("node-v22.12.0-darwin-")
		expect(result.stdout).toContain("epiphany@46.5 — not available on macos")
	})

	test("dry-run walks linux-apt, linux-dnf, and linux-pacman", async () => {
		for (const os of ["linux-apt", "linux-dnf", "linux-pacman"] as const) {
			const result = await runCli(["install", "--dry-run", "--os", os, "--config", catalogPath], {
				cwd: catalogDir,
				env: { CROSSDEPS_OS: undefined },
			})
			expect(result.exitCode).toBe(0)
			expect(result.stdout).toContain(`Detected OS: ${os}`)
			expect(result.stdout).toContain("Found 24 dependencies")
		}
	})

	test("check git succeeds on CI images that have git", async () => {
		const result = await runCli(["check", "git", "--config", catalogPath], { cwd: catalogDir })
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("git@")
	})
})
