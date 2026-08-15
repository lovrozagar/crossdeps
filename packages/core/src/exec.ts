import { execFileSync, execSync } from "node:child_process"

export type ShellInvocation =
	| { args: string[]; file: string }
	| { command: string; shell: string }

export function shellInvocation(
	command: string,
	platform: NodeJS.Platform = process.platform,
): ShellInvocation {
	if (platform === "win32") {
		return {
			args: ["-NoProfile", "-NonInteractive", "-Command", command],
			file: "powershell.exe",
		}
	}
	return { command, shell: "/bin/bash" }
}

export function runShellCommand(command: string, platform: NodeJS.Platform = process.platform): void {
	const invocation = shellInvocation(command, platform)
	if ("file" in invocation) {
		execFileSync(invocation.file, invocation.args, { stdio: "inherit" })
		return
	}
	execSync(invocation.command, { shell: invocation.shell, stdio: "inherit" })
}
