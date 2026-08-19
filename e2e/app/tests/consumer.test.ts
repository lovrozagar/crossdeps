import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { describe, expect, test } from "bun:test"
import { detectOs } from "@lovrozagar/crossdeps"
import { bunBinary, extraConfig, label, order, presentCheck, presentInstall, presentPinMatches } from "../src/app.ts"
import config from "../crossdeps.config.ts"
import { bunAppend, bunLog, bunRead, bunWrite, runCli } from "./helpers.ts"

const appDir = join(import.meta.dir, "..")

describe("e2e-app consumes @lovrozagar/crossdeps", () => {
	test("defineConfig export has fixture deps", () => {
		expect(Object.keys(config.deps).sort()).toEqual(["absent", "present", "stale", "unix-only"])
		expect(config.packageJsonPath).toBe("package.json")
	})

	test("library helpers resolve against the consumer config", () => {
		expect(presentCheck).toContain("1.0.0")
		expect(presentInstall).toContain("installed-present")
		expect(order).toEqual(expect.arrayContaining(["absent", "present", "unix-only"]))
		expect(label).toBe("present@1.0.0")
		expect(presentPinMatches).toBe(true)
		expect(bunBinary).toBeTruthy()
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
		expect(result.stdout).not.toContain("--upgrade")
		expect(result.stdout).not.toContain("Installed successfully")
	})

	test("matching install --upgrade still skips", async () => {
		const result = await runCli(["install", "present", "--upgrade"], { cwd: appDir })
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("Already installed")
		expect(result.stdout).not.toContain("Installed successfully")
		expect(result.stdout).not.toContain("installed-present")
	})

	test("install skips a version mismatch unless --upgrade", async () => {
		const skipped = await runCli(["install", "stale"], { cwd: appDir })
		expect(skipped.exitCode).toBe(0)
		expect(skipped.stdout).toContain("Already installed (9.9.9)")
		expect(skipped.stdout).toContain("crossdeps install stale --upgrade")

		const upgraded = await runCli(["install", "stale", "--upgrade"], { cwd: appDir })
		expect(upgraded.exitCode).toBe(0)
		expect(upgraded.stdout).toContain("Installed successfully")
		expect(upgraded.stdout).toContain("PATH still has 9.9.9")
	})

	test("mismatch install skips with path and --upgrade hint", async () => {
		const result = await runCli(["install", "stale"], { cwd: appDir })
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("Already installed (9.9.9)")
		expect(result.stdout).toMatch(/expected 1\.0\.0\) \S+/)
		expect(result.stdout).toContain("crossdeps install stale --upgrade")
		expect(result.stdout).not.toContain("Installed successfully")
	})

	test("mismatch install --upgrade runs the installer", async () => {
		const result = await runCli(["install", "stale", "--upgrade"], { cwd: appDir })
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("Installed successfully")
		expect(result.stdout).toContain("upgraded-stale")
		expect(result.stdout).not.toContain("Already installed")
	})

	test("install --upgrade warns when PATH still reports the old version", async () => {
		const result = await runCli(["install", "stale", "--upgrade"], { cwd: appDir })
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("Installed successfully")
		expect(result.stdout).toContain("PATH still has 9.9.9")
		expect(result.stdout).toMatch(/PATH still has 9\.9\.9 \(expected 1\.0\.0\) \S+/)
	})

	test("install --upgrade does not warn when check version matches after install", async () => {
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-upgrade-match-"))
		const versionFile = join(dir, "version.txt")
		writeFileSync(versionFile, "9.9.9")
		writeFileSync(
			join(dir, "crossdeps.config.ts"),
			`export default {
	deps: {
		bump: {
			check: { command: ${JSON.stringify(bunRead("VERSION_FILE"))} },
			description: "mismatch then match",
			os: { all: ${JSON.stringify(bunWrite("VERSION_FILE", "1.0.0"))} },
			required: true,
			version: "1.0.0",
		},
	},
}
`,
		)
		const result = await runCli(["install", "bump", "--upgrade", "--config", join(dir, "crossdeps.config.ts")], {
			cwd: dir,
			env: { VERSION_FILE: versionFile },
		})
		expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
		expect(result.stdout).toContain("Installed successfully")
		expect(result.stdout).not.toContain("PATH still has")
		expect(readFileSync(versionFile, "utf-8")).toBe("1.0.0")
	})

	test("install --dry-run --upgrade prints dry-run and does not skip", async () => {
		const result = await runCli(["install", "--dry-run", "--upgrade", "stale"], { cwd: appDir })
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("dry-run:")
		expect(result.stdout).not.toContain("Already installed")
		expect(result.stdout).not.toContain("Installed successfully")
		expect(result.stdout).not.toContain("PATH still has")
	})

	test("check all mismatch includes a path and the --upgrade footer", async () => {
		const result = await runCli(["check"], { cwd: appDir })
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toMatch(/stale@9\.9\.9 \(expected 1\.0\.0\) \S+/)
		expect(result.stdout).toContain("crossdeps install --upgrade")
	})

	test("check named mismatch exits 0 and prints expected plus path", async () => {
		const result = await runCli(["check", "stale"], { cwd: appDir })
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("expected 1.0.0")
		expect(result.stdout).toMatch(/stale@9\.9\.9 \(expected 1\.0\.0\) \S+/)
	})

	test("--upgrade on check is ignored", async () => {
		const named = await runCli(["check", "stale"], { cwd: appDir })
		const namedFlag = await runCli(["check", "stale", "--upgrade"], { cwd: appDir })
		const namedFlagBefore = await runCli(["check", "--upgrade", "stale"], { cwd: appDir })
		expect(named.exitCode).toBe(0)
		expect(namedFlag.exitCode).toBe(named.exitCode)
		expect(namedFlag.stdout).toBe(named.stdout)
		expect(namedFlagBefore.exitCode).toBe(named.exitCode)
		expect(namedFlagBefore.stdout).toBe(named.stdout)

		const all = await runCli(["check"], { cwd: appDir })
		const allFlag = await runCli(["check", "--upgrade"], { cwd: appDir })
		expect(allFlag.exitCode).toBe(all.exitCode)
		expect(allFlag.stdout).toBe(all.stdout)
	})

	test("install --upgrade accepts either flag order", async () => {
		const flagFirst = await runCli(["install", "--upgrade", "stale"], { cwd: appDir })
		expect(flagFirst.exitCode).toBe(0)
		expect(flagFirst.stdout).toContain("Installed successfully")

		const nameFirst = await runCli(["install", "stale", "--upgrade"], { cwd: appDir })
		expect(nameFirst.exitCode).toBe(0)
		expect(nameFirst.stdout).toContain("Installed successfully")
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
		expect(result.stdout).not.toContain("PATH still has")
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

const PATH_PROBE = "crossdeps-path-probe"
const LOGIN_PATH_WARN = "could not read login-shell PATH; using this process PATH"

function writePathProbe(dir: string, version: string): void {
	const isWin = process.platform === "win32"
	const file = join(dir, isWin ? `${PATH_PROBE}.cmd` : PATH_PROBE)
	if (isWin) {
		writeFileSync(file, `@echo off\r\necho ${version}\r\n`)
	} else {
		writeFileSync(file, `#!/bin/sh\necho ${version}\n`, { mode: 0o755 })
		chmodSync(file, 0o755)
	}
}

function writeProbeConfig(dir: string, version = "4.4.4"): string {
	const configPath = join(dir, "crossdeps.config.ts")
	writeFileSync(
		configPath,
		`export default {
	deps: {
		probe: {
			check: { command: "${PATH_PROBE} --version" },
			description: "path probe",
			os: { all: "echo unused" },
			required: true,
			version: ${JSON.stringify(version)},
		},
	},
}
`,
	)
	return configPath
}

function writeFakeLoginShell(dir: string, loginPath: string): string {
	const file = join(dir, "fake-login-shell")
	writeFileSync(
		file,
		`#!/bin/sh
if [ "$1" = "-lc" ]; then
  PATH=${JSON.stringify(loginPath)} eval "$2"
  exit $?
fi
exit 1
`,
		{ mode: 0o755 },
	)
	chmodSync(file, 0o755)
	return file
}

describe("CLI check PATH snapshot", () => {
	test("--here uses this process PATH", async () => {
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-path-here-"))
		writePathProbe(dir, "4.4.4")
		const configPath = writeProbeConfig(dir)
		const path = `${dir}${delimiter}${process.env.PATH ?? ""}`

		const here = await runCli(["check", "--here", "probe", "--config", configPath], { cwd: dir, env: { PATH: path } })
		expect(here.exitCode, `${here.stdout}\n${here.stderr}`).toBe(0)
		expect(here.stdout).toContain("probe@4.4.4")
		expect(here.stderr).not.toContain(LOGIN_PATH_WARN)

		const hereAfter = await runCli(["check", "probe", "--here", "--config", configPath], {
			cwd: dir,
			env: { PATH: path },
		})
		expect(hereAfter.exitCode).toBe(0)
		expect(hereAfter.stdout).toContain("probe@4.4.4")
		expect(hereAfter.stderr).not.toContain(LOGIN_PATH_WARN)
	})

	test("install uses process PATH and ignores --here", async () => {
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-path-install-"))
		writePathProbe(dir, "4.4.4")
		const configPath = writeProbeConfig(dir)
		const path = `${dir}${delimiter}${process.env.PATH ?? ""}`

		const installed = await runCli(["install", "probe", "--here", "--config", configPath], {
			cwd: dir,
			env: { PATH: path, SHELL: "/no/such/crossdeps-shell" },
		})
		expect(installed.exitCode, `${installed.stdout}\n${installed.stderr}`).toBe(0)
		expect(installed.stdout).toContain("Already installed (4.4.4)")
		expect(installed.stderr).not.toContain(LOGIN_PATH_WARN)
	})

	test("check --here still works when login spawn would fail", async () => {
		const result = await runCli(["check", "--here", "present"], {
			cwd: appDir,
			env: { SHELL: "/no/such/crossdeps-shell" },
		})
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("present@1.0.0")
		expect(result.stderr).not.toContain(LOGIN_PATH_WARN)
	})
})

describe("CLI check PATH snapshot (unix login shell)", () => {
	test("check uses the PATH printed by $SHELL -lc", async () => {
		if (process.platform === "win32") return
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-path-login-"))
		const loginDir = join(dir, "login")
		const processDir = join(dir, "proc")
		mkdirSync(loginDir)
		mkdirSync(processDir)
		writePathProbe(loginDir, "3.2.1")
		writePathProbe(processDir, "9.9.9")
		writeProbeConfig(dir, "3.2.1")
		const shell = writeFakeLoginShell(dir, loginDir)
		const path = `${processDir}${delimiter}${process.env.PATH ?? ""}`

		const result = await runCli(["check", "probe", "--config", join(dir, "crossdeps.config.ts")], {
			cwd: dir,
			env: { PATH: path, SHELL: shell },
		})
		expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
		expect(result.stdout).toContain("probe@3.2.1")
		expect(result.stdout).not.toContain("9.9.9")
		expect(result.stderr).not.toContain(LOGIN_PATH_WARN)
	})

	test("login spawn fail falls back to process PATH with one warning", async () => {
		if (process.platform === "win32") return
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-path-fail-"))
		writePathProbe(dir, "4.4.4")
		writeProbeConfig(dir)
		const path = `${dir}${delimiter}${process.env.PATH ?? ""}`

		const result = await runCli(["check", "probe", "--config", join(dir, "crossdeps.config.ts")], {
			cwd: dir,
			env: { PATH: path, SHELL: "/no/such/crossdeps-shell" },
		})
		expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
		expect(result.stdout).toContain("probe@4.4.4")
		expect(result.stderr).toContain(LOGIN_PATH_WARN)
	})

	test("empty login PATH falls back to process PATH with one warning", async () => {
		if (process.platform === "win32") return
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-path-empty-"))
		writePathProbe(dir, "4.4.4")
		writeProbeConfig(dir)
		const shell = writeFakeLoginShell(dir, "")
		const path = `${dir}${delimiter}${process.env.PATH ?? ""}`

		const result = await runCli(["check", "probe", "--config", join(dir, "crossdeps.config.ts")], {
			cwd: dir,
			env: { PATH: path, SHELL: shell },
		})
		expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
		expect(result.stdout).toContain("probe@4.4.4")
		expect(result.stderr).toContain(LOGIN_PATH_WARN)
	})
})
