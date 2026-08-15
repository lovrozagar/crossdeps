#!/usr/bin/env bun
/**
 * Try every dep in the monorepo catalog on this machine.
 * Used by GitHub Actions so Ubuntu / macOS / Windows actually run
 * apt, brew, and choco — not just --dry-run.
 */
import { homedir } from "node:os"
import { join } from "node:path"
import { sortByDependencies } from "@scriptgun/crossdeps"
import catalog from "../examples/consumer/crossdeps.config.ts"

const cli = join(import.meta.dir, "../packages/core/src/cli.ts")
const configPath = join(import.meta.dir, "../examples/consumer/crossdeps.config.ts")
const perDepMs = Number(process.env.CROSSDEPS_INSTALL_TIMEOUT_MS ?? 180_000)

type Outcome = "ok" | "failed" | "timeout"

const names = sortByDependencies(Object.entries(catalog.deps)).map(([name]) => name)
const rows: Array<{ detail: string; name: string; outcome: Outcome }> = []

async function tryOne(name: string): Promise<{ detail: string; outcome: Outcome }> {
	const proc = Bun.spawn(["bun", cli, "install", name, "--config", configPath], {
		cwd: join(import.meta.dir, "../examples/consumer"),
		env: {
			...process.env,
			DEBIAN_FRONTEND: "noninteractive",
			HOMEBREW_NO_AUTO_UPDATE: "1",
			HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK: "1",
		},
		stderr: "pipe",
		stdout: "pipe",
	})

	let timedOut = false
	const killer = setTimeout(() => {
		timedOut = true
		proc.kill()
	}, perDepMs)
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	])
	clearTimeout(killer)

	const text = `${stdout}\n${stderr}`
	if (timedOut) {
		return { detail: "timed out", outcome: "timeout" }
	}
	if (exitCode === 0) {
		const kind = stdout.includes("Already installed")
			? "already installed"
			: stdout.includes("not available")
				? "unavailable on this OS"
				: "installed"
		return { detail: kind, outcome: "ok" }
	}
	const last = text
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.at(-1)
	return { detail: last ?? `exit ${exitCode}`, outcome: "failed" }
}

console.log(`catalog-install — ${names.length} deps, ${perDepMs / 1000}s each`)
console.log(`home=${homedir()} platform=${process.platform}`)
console.log("=".repeat(60))

for (const name of names) {
	console.log(`\n>> ${name}`)
	const result = await tryOne(name)
	rows.push({ name, ...result })
	console.log(`   ${result.outcome}: ${result.detail}`)
}

const ok = rows.filter((r) => r.outcome === "ok").length
const failed = rows.filter((r) => r.outcome === "failed").length
const timeout = rows.filter((r) => r.outcome === "timeout").length

const table = [
	"| dep | result | detail |",
	"| --- | --- | --- |",
	...rows.map((r) => `| ${r.name} | ${r.outcome} | ${r.detail.replaceAll("|", "/")} |`),
	"",
	`ok ${ok} · failed ${failed} · timeout ${timeout} · total ${rows.length}`,
].join("\n")

console.log(`\n${"=".repeat(60)}`)
console.log(table)

const summary = process.env.GITHUB_STEP_SUMMARY
if (summary) {
	await Bun.write(summary, `# Catalog install (${process.platform})\n\n${table}\n`)
}

/* tried every dep — non-zero only if the runner itself could not start any */
if (ok === 0) process.exit(1)
