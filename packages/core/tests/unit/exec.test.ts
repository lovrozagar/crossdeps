import { describe, expect, it } from "vitest"
import { needsPowerShell, shellInvocation } from "../../src/exec.ts"

describe("needsPowerShell", () => {
	it("detects PowerShell-only syntax", () => {
		expect(needsPowerShell("irm https://deno.land/install.ps1 | iex")).toBe(true)
		expect(needsPowerShell('Invoke-WebRequest -OutFile "$env:LOCALAPPDATA\\bin\\atlas.exe"')).toBe(
			true,
		)
		expect(needsPowerShell("choco install nginx --version=1.29.4 || choco install nginx")).toBe(
			false,
		)
		expect(needsPowerShell('bun -e "await Bun.write(process.env.MARKER, \\"ok\\")"')).toBe(false)
	})
})

describe("shellInvocation", () => {
	it("runs unix commands with bash so multi-line scripts work", () => {
		expect(shellInvocation("echo hi", "linux")).toEqual({
			command: "echo hi",
			shell: "/bin/bash",
		})
	})

	it("uses PowerShell only for PowerShell syntax on Windows", () => {
		const irm = "irm https://deno.land/install.ps1 | iex"
		expect(shellInvocation(irm, "win32")).toEqual({
			args: ["-NoProfile", "-NonInteractive", "-Command", irm],
			file: "powershell.exe",
		})
	})

	it("uses cmd.exe for bun/choco on Windows", () => {
		const inv = shellInvocation("choco install nginx || choco install nginx", "win32")
		expect(inv).toMatchObject({
			command: "choco install nginx || choco install nginx",
		})
		expect("shell" in inv && typeof inv.shell === "string").toBe(true)
		if ("shell" in inv) expect(inv.shell.toLowerCase()).toContain("cmd")
	})
})
