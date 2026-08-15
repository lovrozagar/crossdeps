import { describe, expect, it } from "vitest"
import { shellInvocation } from "../../src/exec.ts"

describe("shellInvocation", () => {
	it("runs unix commands with bash so multi-line scripts work", () => {
		expect(shellInvocation("echo hi", "linux")).toEqual({
			command: "echo hi",
			shell: "/bin/bash",
		})
		expect(shellInvocation("echo hi", "darwin")).toEqual({
			command: "echo hi",
			shell: "/bin/bash",
		})
	})

	it("runs Windows commands in PowerShell so irm/iex and choco both work", () => {
		const irm = "irm https://deno.land/install.ps1 | iex"
		expect(shellInvocation(irm, "win32")).toEqual({
			args: ["-NoProfile", "-NonInteractive", "-Command", irm],
			file: "powershell.exe",
		})
	})
})
