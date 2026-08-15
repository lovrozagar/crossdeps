import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { OS_TARGETS } from "../../src/config.ts"
import { commandExists, commandLookup, detectOs, detectOsFromPlatform, parseOsTarget } from "../../src/platform.ts"

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

describe("commandLookup", () => {
	it("uses where.exe on Windows and command -v elsewhere", () => {
		expect(commandLookup("bun", "win32")).toBe("where bun >nul 2>&1")
		expect(commandLookup("bun", "darwin")).toBe("command -v bun >/dev/null 2>&1")
		expect(commandLookup("bun", "linux")).toBe("command -v bun >/dev/null 2>&1")
	})
})
