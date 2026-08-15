import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { detectOs } from "@scriptgun/crossdeps"
import { extraConfig, label, order, presentCheck, presentInstall } from "../src/app.ts"
import config from "../crossdeps.config.ts"
import { bunAppend, bunLog, bunWrite, runCli } from "./helpers.ts"

const appDir = join(import.meta.dir, "..")

describe("e2e-app consumes @scriptgun/crossdeps", () => {
	test("defineConfig export has fixture deps", () => {
		expect(Object.keys(config.deps).sort()).toEqual(["absent", "present", "unix-only"])
		expect(config.packageJsonPath).toBe("package.json")
	})

	test("library helpers resolve against the consumer config", () => {
		expect(presentCheck).toContain("1.0.0")
		expect(presentInstall).toContain("installed-present")
		expect(order).toEqual(expect.arrayContaining(["absent", "present", "unix-only"]))
		expect(label).toBe("present@1.0.0")
		expect(extraConfig().deps.jq?.version).toBe("1.8.1")
	})

	test("detectOs returns a known target", () => {
		expect(["linux-apt", "linux-dnf", "linux-pacman", "macos", "windows"]).toContain(detectOs())
	})
})

describe("CLI as a workspace consumer", () => {
	test("check reports the present fixture dep", async () => {
		const result = await runCli(["check", "present"], { cwd: appDir })
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("present@1.0.0")
	})

	test("check exits 1 for a missing required dep when targeted", async () => {
		const result = await runCli(["check", "absent"], { cwd: appDir })
		expect(result.exitCode).toBe(1)
		expect(result.stdout).toContain("not installed")
	})

	test("check all succeeds because the only required dep is present", async () => {
		const result = await runCli(["check"], { cwd: appDir })
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("crossdeps — System Dependencies Check")
		expect(result.stdout).toContain("present@1.0.0")
		expect(result.stdout).toContain("absent")
	})

	test("install skips an already-present dep", async () => {
		const result = await runCli(["install", "present"], { cwd: appDir })
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("Already installed")
	})

	test("install --config uses the given file", async () => {
		const result = await runCli(["check", "present", "--config", join(appDir, "crossdeps.config.ts")], {
			cwd: appDir,
		})
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("present@1.0.0")
	})

	test("missing config file fails", async () => {
		const result = await runCli(["check"], { cwd: tmpdir() })
		expect(result.exitCode).toBe(1)
		expect(result.stderr).toContain("No crossdeps config found")
	})

	test("unknown command prints usage and fails", async () => {
		const result = await runCli(["wat"], { cwd: appDir })
		expect(result.exitCode).toBe(1)
		expect(result.stdout).toContain("Usage: crossdeps")
		expect(result.stderr).toContain("Unknown command: wat")
	})

	test("unknown dep fails with available names", async () => {
		const result = await runCli(["check", "nope"], { cwd: appDir })
		expect(result.exitCode).toBe(1)
		expect(result.stderr).toContain("Unknown dependency: nope")
		expect(result.stdout).toContain("present")
	})

	test("install writes the command output for a missing dep", async () => {
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-install-"))
		const marker = join(dir, "installed.txt")
		writeFileSync(
			join(dir, "crossdeps.config.ts"),
			`export default {
	deps: {
		fresh: {
			check: { command: "crossdeps-definitely-missing --version" },
			description: "fresh install",
			os: { all: ${JSON.stringify(bunWrite("MARKER", "fresh-ok"))} },
			required: true,
			version: "3.0.0",
		},
	},
}
`,
		)
		const result = await runCli(["install", "fresh", "--config", join(dir, "crossdeps.config.ts")], {
			cwd: dir,
			env: { MARKER: marker },
		})
		expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
		expect(result.stdout).toContain("Installed successfully")
		expect(readFileSync(marker, "utf-8")).toBe("fresh-ok")
	})

	test("install respects dependsOn order", async () => {
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-order-"))
		const marker = join(dir, "order.txt")
		writeFileSync(
			join(dir, "crossdeps.config.ts"),
			`export default {
	deps: {
		child: {
			check: { command: "crossdeps-definitely-missing --version" },
			dependsOn: ["parent"],
			description: "child",
			os: { all: ${JSON.stringify(bunAppend("MARKER", "child"))} },
			required: true,
			version: "1.0.0",
		},
		parent: {
			check: { command: "crossdeps-definitely-missing --version" },
			description: "parent",
			os: { all: ${JSON.stringify(bunAppend("MARKER", "parent"))} },
			required: true,
			version: "1.0.0",
		},
	},
}
`,
		)
		const result = await runCli(["install", "--config", join(dir, "crossdeps.config.ts")], {
			cwd: dir,
			env: { MARKER: marker },
		})
		expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
		expect(readFileSync(marker, "utf-8")).toBe("parentchild")
	})

	test("sync-pm updates packageManager from the bun dep version", async () => {
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-sync-"))
		writeFileSync(
			join(dir, "package.json"),
			`${JSON.stringify({ name: "sync-fixture", packageManager: "bun@0.0.1" }, null, "\t")}\n`,
		)
		writeFileSync(
			join(dir, "crossdeps.config.ts"),
			`export default {
	deps: {
		bun: {
			description: "bun",
			os: { all: ${JSON.stringify(bunLog("bun"))} },
			required: true,
			version: "1.3.11",
		},
	},
}
`,
		)
		const result = await runCli(["sync-pm", "--config", join(dir, "crossdeps.config.ts")], {
			cwd: dir,
		})
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("Updated packageManager to bun@1.3.11")
		const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8")) as {
			packageManager: string
		}
		expect(pkg.packageManager).toBe("bun@1.3.11")
	})

	test("env writes markers into an isolated HOME", async () => {
		const home = mkdtempSync(join(tmpdir(), "crossdeps-home-"))
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-env-"))
		writeFileSync(
			join(dir, "crossdeps.config.ts"),
			`export default {
	deps: {
		tool: {
			description: "env fixture",
			env: [
				{ key: "TOOL_HOME", value: "$HOME/tool" },
				{ appendToPath: true, key: "PATH", value: "$HOME/tool/bin" },
			],
			os: { all: ${JSON.stringify(bunLog("tool"))} },
			required: true,
			version: "1.0.0",
		},
	},
}
`,
		)
		const result = await runCli(["env", "--config", join(dir, "crossdeps.config.ts")], {
			cwd: dir,
			env: { HOME: home, SHELL: "/bin/bash", USERPROFILE: home },
		})
		expect(result.exitCode).toBe(0)
		const written =
			process.platform === "win32"
				? readFileSync(join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"), "utf-8")
				: readFileSync(join(home, ".bashrc"), "utf-8")
		expect(written).toContain("# tool environment (managed by crossdeps)")
		if (process.platform === "win32") {
			expect(written).toContain('$env:TOOL_HOME = "$HOME/tool"')
			expect(written).toContain('$env:Path += ";$HOME/tool/bin"')
		} else {
			expect(written).toContain('export TOOL_HOME="$HOME/tool"')
			expect(written).toContain('export PATH="$PATH:$HOME/tool/bin"')
		}
	})
})
