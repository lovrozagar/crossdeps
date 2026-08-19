import { chmodSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { describe, expect, it } from "vitest"
import { OS_TARGETS } from "../../src/config.ts"
import { processPath } from "../../src/path.ts"
import {
	commandExists,
	commandLookup,
	detectOs,
	detectOsFromPlatform,
	parseOsTarget,
	whichBinary,
} from "../../src/platform.ts"

/** Prepend `dir` so Windows still finds `where.exe` on the rest of PATH. */
function searchPathWith(dir: string): string {
	return `${dir}${delimiter}${processPath()}`
}

describe("commandExists", () => {
	it("returns true for a command on PATH", () => {
		expect(commandExists("sh")).toBe(true)
	})

	it("returns false for a missing command", () => {
		expect(commandExists("crossdeps-definitely-not-installed")).toBe(false)
	})

	it("returns true for an existing file path", () => {
		const file = join(mkdtempSync(join(tmpdir(), "crossdeps-cmd-")), "tool")
		writeFileSync(file, "")
		expect(commandExists(file)).toBe(true)
	})
})

describe("parseOsTarget", () => {
	it("accepts every known target", () => {
		for (const target of OS_TARGETS) {
			expect(parseOsTarget(target)).toBe(target)
		}
	})

	it("rejects an unknown target", () => {
		expect(() => parseOsTarget("freebsd")).toThrow(/Unknown OS target: freebsd/)
	})
})

describe("detectOs", () => {
	it("returns a known OS target", () => {
		expect([...OS_TARGETS]).toContain(detectOs())
	})

	it("maps darwin and win32 without running those kernels", () => {
		expect(detectOsFromPlatform("darwin")).toBe("macos")
		expect(detectOsFromPlatform("win32")).toBe("windows")
	})

	it("honors an explicit override", () => {
		expect(detectOs("windows")).toBe("windows")
		expect(detectOs("macos")).toBe("macos")
		expect(detectOs("linux-dnf")).toBe("linux-dnf")
	})

	it("rejects an unknown override", () => {
		expect(() => detectOs("freebsd")).toThrow(/Unknown OS target/)
	})
})

describe("whichBinary", () => {
	it("resolves a command on PATH", () => {
		expect(whichBinary("sh")).toMatch(/sh/)
	})

	it("returns null for a missing command", () => {
		expect(whichBinary("crossdeps-definitely-not-installed")).toBeNull()
	})

	it("returns an existing file path as-is", () => {
		const file = join(mkdtempSync(join(tmpdir(), "crossdeps-which-")), "tool")
		writeFileSync(file, "")
		expect(whichBinary(file)).toBe(file)
	})

	it("strips surrounding quotes before resolving an existing file", () => {
		const file = join(mkdtempSync(join(tmpdir(), "crossdeps-which-q-")), "tool")
		writeFileSync(file, "")
		expect(whichBinary(`"${file}"`)).toBe(file)
		expect(whichBinary(`'${file}'`)).toBe(file)
	})

	it("returns null for an empty token", () => {
		expect(whichBinary("")).toBeNull()
		expect(whichBinary('""')).toBeNull()
		expect(whichBinary("''")).toBeNull()
	})

	it("resolves a command from an explicit search PATH", () => {
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-which-path-"))
		const isWin = process.platform === "win32"
		const name = isWin ? "crossdeps-path-probe.cmd" : "crossdeps-path-probe"
		const file = join(dir, name)
		writeFileSync(file, isWin ? "@echo off\r\necho 1.0.0\r\n" : "#!/bin/sh\necho 1.0.0\n")
		if (!isWin) chmodSync(file, 0o755)
		const token = "crossdeps-path-probe"
		expect(whichBinary(token, process.platform, searchPathWith(dir))).toBeTruthy()
		expect(whichBinary(token, process.platform, searchPathWith(join(dir, "missing")))).toBeNull()
	})
})

describe("commandExists with search PATH", () => {
	it("finds a probe only on the given PATH", () => {
		const dir = mkdtempSync(join(tmpdir(), "crossdeps-exists-path-"))
		const isWin = process.platform === "win32"
		const file = join(dir, isWin ? "crossdeps-exists-probe.cmd" : "crossdeps-exists-probe")
		writeFileSync(file, isWin ? "@echo off\r\n" : "#!/bin/sh\n")
		if (!isWin) chmodSync(file, 0o755)
		const token = "crossdeps-exists-probe"
		expect(commandExists(token, searchPathWith(dir))).toBe(true)
		expect(commandExists(token, searchPathWith(join(dir, "empty")))).toBe(false)
	})
})

describe("commandLookup", () => {
	it("uses where.exe on Windows and command -v elsewhere", () => {
		expect(commandLookup("bun", "win32")).toBe("where bun >nul 2>&1")
		expect(commandLookup("bun", "darwin")).toBe("command -v bun >/dev/null 2>&1")
		expect(commandLookup("bun", "linux")).toBe("command -v bun >/dev/null 2>&1")
	})
})
