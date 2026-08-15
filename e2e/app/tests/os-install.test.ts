import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { detectOs, OS_TARGETS, resolveOsCommand } from "@scriptgun/crossdeps"
import { bunLog, bunWrite, runCli } from "./helpers.ts"

function writeOsFixture(dir: string): string {
	const configPath = join(dir, "crossdeps.config.ts")
	writeFileSync(
		configPath,
		`export default {
	deps: {
		marker: {
			check: { command: "crossdeps-definitely-missing --version" },
			description: "per-OS install marker",
			os: {
				"linux-apt": ${JSON.stringify(bunWrite("MARKER", "linux-apt"))},
				"linux-dnf": ${JSON.stringify(bunWrite("MARKER", "linux-dnf"))},
				"linux-pacman": ${JSON.stringify(bunWrite("MARKER", "linux-pacman"))},
				macos: ${JSON.stringify(bunWrite("MARKER", "macos"))},
				windows: ${JSON.stringify(bunWrite("MARKER", "windows"))},
			},
			required: true,
			version: "1.0.0",
		},
		"unix-only": {
			check: { command: ${JSON.stringify(bunLog("0.1.0"))} },
			description: "unavailable on Windows",
			os: {
				"linux-apt": ${JSON.stringify(bunLog("unix"))},
				"linux-dnf": ${JSON.stringify(bunLog("unix"))},
				"linux-pacman": ${JSON.stringify(bunLog("unix"))},
				macos: ${JSON.stringify(bunLog("unix"))},
				windows: false,
			},
			required: false,
			version: "0.1.0",
		},
	},
}
`,
	)
	return configPath
}

describe("OS install matrix", () => {
	test("detectOs matches EXPECT_OS when the docker harness sets it", () => {
		const expected = process.env.EXPECT_OS
		if (expected) {
			expect(detectOs()).toBe(expected)
			return
		}
		expect([...OS_TARGETS]).toContain(detectOs())
	})

	test("install runs the command for the active OS", async () => {
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-os-"))
		const marker = join(dir, "os.txt")
		const configPath = writeOsFixture(dir)
		const os = detectOs()

		const selected = resolveOsCommand(
			"marker",
			{
				description: "per-OS install marker",
				os: {
					"linux-apt": bunWrite("MARKER", "linux-apt"),
					"linux-dnf": bunWrite("MARKER", "linux-dnf"),
					"linux-pacman": bunWrite("MARKER", "linux-pacman"),
					macos: bunWrite("MARKER", "macos"),
					windows: bunWrite("MARKER", "windows"),
				},
				required: true,
				version: "1.0.0",
			},
			os,
		)
		expect(selected).toContain(os)

		const result = await runCli(["install", "marker", "--config", configPath], {
			cwd: dir,
			env: { MARKER: marker },
		})
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("Installed successfully")
		expect(readFileSync(marker, "utf-8")).toBe(os)
	})

	test("--os forces the windows command on this host", async () => {
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-os-flag-"))
		const marker = join(dir, "os.txt")
		const configPath = writeOsFixture(dir)

		const result = await runCli(["install", "marker", "--os", "windows", "--config", configPath], {
			cwd: dir,
			env: { CROSSDEPS_OS: undefined, MARKER: marker },
		})
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("Installed successfully")
		expect(readFileSync(marker, "utf-8")).toBe("windows")
	})

	test("windows marks unix-only as unavailable", async () => {
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-os-unavail-"))
		const configPath = writeOsFixture(dir)

		const result = await runCli(["install", "unix-only", "--os", "windows", "--config", configPath], {
			cwd: dir,
			env: { CROSSDEPS_OS: undefined },
		})
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("not available on windows")
	})

	test("unknown --os fails", async () => {
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-os-bad-"))
		const configPath = writeOsFixture(dir)
		const result = await runCli(["install", "--os", "freebsd", "--config", configPath], {
			cwd: dir,
			env: { CROSSDEPS_OS: undefined },
		})
		expect(result.exitCode).toBe(1)
		expect(result.stderr).toContain("Unknown OS target: freebsd")
	})
})

describe("real install", () => {
	test("downloads jq when CROSSDEPS_REAL_INSTALL=1", async () => {
		if (process.env.CROSSDEPS_REAL_INSTALL !== "1") return

		const os = detectOs()
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-jq-"))
		const bindir = join(dir, "bin")
		mkdirSync(bindir)
		const arch = process.arch === "arm64" ? "arm64" : "amd64"
		const asset =
			os === "windows"
				? "jq-windows-amd64.exe"
				: os === "macos"
					? `jq-macos-${arch}`
					: `jq-linux-${arch}`
		const dest = join(bindir, os === "windows" ? "jq.exe" : "jq")
		const url = `https://github.com/jqlang/jq/releases/download/jq-1.8.1/${asset}`
		const download = `bun -e ${JSON.stringify(`const dest=process.env.JQ_BIN; const res=await fetch(process.env.JQ_URL); if(!res.ok) throw new Error("download failed "+res.status); await Bun.write(dest, await res.arrayBuffer()); const {chmodSync}=await import("node:fs"); chmodSync(dest, 0o755);`)}`

		writeFileSync(
			join(dir, "crossdeps.config.ts"),
			`export default {
	deps: {
		jq: {
			check: { command: ${JSON.stringify(`${dest} --version`)} },
			description: "JSON processor",
			os: {
				"linux-apt": ${JSON.stringify(download)},
				"linux-dnf": ${JSON.stringify(download)},
				"linux-pacman": ${JSON.stringify(download)},
				macos: ${JSON.stringify(download)},
				windows: ${JSON.stringify(download)},
			},
			required: true,
			version: "1.8.1",
		},
	},
}
`,
		)

		const install = await runCli(["install", "jq", "--config", join(dir, "crossdeps.config.ts")], {
			cwd: dir,
			env: { JQ_BIN: dest, JQ_URL: url },
		})
		expect(install.exitCode).toBe(0)
		expect(install.stdout).toContain("Installed successfully")

		const check = await runCli(["check", "jq", "--config", join(dir, "crossdeps.config.ts")], {
			cwd: dir,
		})
		expect(check.exitCode).toBe(0)
		expect(check.stdout).toContain("jq@1.8.1")
	})
})
