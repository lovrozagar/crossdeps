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
		expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
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
		expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
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

function fetchToEnv(): string {
	return `bun -e ${JSON.stringify(`const dest=process.env.DEST; const res=await fetch(process.env.URL); if(!res.ok) throw new Error("download failed "+res.status+" "+process.env.URL); await Bun.write(dest, await res.arrayBuffer()); const {chmodSync}=await import("node:fs"); chmodSync(dest, 0o755);`)}`
}

function fetchArchiveToDir(): string {
	return `bun -e ${JSON.stringify(`const dest=process.env.DEST; const url=process.env.URL; const archive=dest+".dl"; const res=await fetch(url); if(!res.ok) throw new Error("download failed "+res.status+" "+url); await Bun.write(archive, await res.arrayBuffer()); const {execSync}=await import("node:child_process"); const {dirname}=await import("node:path"); execSync("tar -xf "+JSON.stringify(archive)+" -C "+JSON.stringify(dirname(dest)), {stdio:"inherit"});`)}`
}

function allOs(cmd: string) {
	return {
		"linux-apt": cmd,
		"linux-dnf": cmd,
		"linux-pacman": cmd,
		macos: cmd,
		windows: cmd,
	}
}

describe("real install", () => {
	test("downloads jq, stripe-cli, and cloudflared when CROSSDEPS_REAL_INSTALL=1", async () => {
		if (process.env.CROSSDEPS_REAL_INSTALL !== "1") return

		const os = detectOs()
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-bins-"))
		const bindir = join(dir, "bin")
		mkdirSync(bindir)
		const cpu = process.arch === "arm64" ? "arm64" : "amd64"
		const stripeArch = process.arch === "arm64" ? "arm64" : "x86_64"
		const exe = os === "windows" ? ".exe" : ""

		const jqDest = join(bindir, `jq${exe}`)
		const jqUrl =
			os === "windows"
				? "https://github.com/jqlang/jq/releases/download/jq-1.8.1/jq-windows-amd64.exe"
				: os === "macos"
					? `https://github.com/jqlang/jq/releases/download/jq-1.8.1/jq-macos-${cpu}`
					: `https://github.com/jqlang/jq/releases/download/jq-1.8.1/jq-linux-${cpu}`

		const stripeDest = join(bindir, os === "windows" ? "stripe.exe" : "stripe")
		const stripeUrl =
			os === "windows"
				? "https://github.com/stripe/stripe-cli/releases/download/v1.35.0/stripe_1.35.0_windows_x86_64.zip"
				: os === "macos"
					? `https://github.com/stripe/stripe-cli/releases/download/v1.35.0/stripe_1.35.0_mac-os_${stripeArch}.tar.gz`
					: `https://github.com/stripe/stripe-cli/releases/download/v1.35.0/stripe_1.35.0_linux_${stripeArch}.tar.gz`

		const cfDest = join(bindir, `cloudflared${exe}`)
		const cfUrl =
			os === "windows"
				? "https://github.com/cloudflare/cloudflared/releases/download/2026.2.0/cloudflared-windows-amd64.exe"
				: os === "macos"
					? `https://github.com/cloudflare/cloudflared/releases/download/2026.2.0/cloudflared-darwin-${cpu}.tgz`
					: `https://github.com/cloudflare/cloudflared/releases/download/2026.2.0/cloudflared-linux-${cpu}`

		const fileCmd = fetchToEnv()
		const archiveCmd = fetchArchiveToDir()

		writeFileSync(
			join(dir, "crossdeps.config.ts"),
			`export default {
	deps: {
		cloudflared: {
			check: { command: ${JSON.stringify(`${cfDest} --version`)} },
			description: "Cloudflare Tunnel client",
			os: ${JSON.stringify(allOs(os === "macos" ? archiveCmd : fileCmd))},
			required: true,
			version: "2026.2.0",
		},
		jq: {
			check: { command: ${JSON.stringify(`${jqDest} --version`)} },
			description: "JSON processor",
			os: ${JSON.stringify(allOs(fileCmd))},
			required: true,
			version: "1.8.1",
		},
		"stripe-cli": {
			check: { command: ${JSON.stringify(`${stripeDest} version`)} },
			description: "Stripe CLI",
			os: ${JSON.stringify(allOs(archiveCmd))},
			required: true,
			version: "1.35.0",
		},
	},
}
`,
		)

		const tools = [
			{ dest: jqDest, name: "jq", url: jqUrl },
			{ dest: stripeDest, name: "stripe-cli", url: stripeUrl },
			{ dest: cfDest, name: "cloudflared", url: cfUrl },
		]

		for (const tool of tools) {
			const install = await runCli(["install", tool.name, "--config", join(dir, "crossdeps.config.ts")], {
				cwd: dir,
				env: { DEST: tool.dest, URL: tool.url },
			})
			expect(install.exitCode, `${tool.name}\n${install.stdout}\n${install.stderr}`).toBe(0)
			expect(install.stdout, tool.name).toContain("Installed successfully")

			const check = await runCli(["check", tool.name, "--config", join(dir, "crossdeps.config.ts")], {
				cwd: dir,
			})
			expect(check.exitCode, tool.name).toBe(0)
			expect(check.stdout, tool.name).toContain(`${tool.name === "stripe-cli" ? "stripe-cli" : tool.name}@`)
		}
	}, 120_000)
})
