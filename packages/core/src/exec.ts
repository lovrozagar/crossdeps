import { execFileSync, execSync } from "node:child_process"

export type ShellInvocation =
	| { args: string[]; file: string }
	| { command: string; shell: string | true }

const POWERSHELL_MARKERS = [
	/\birm\b/i,
	/\biex\b/i,
	/\$env:/,
	/Invoke-WebRequest/i,
	/Invoke-Expression/i,
	/New-Item\b/i,
	/Test-Path\b/i,
	/Out-Null/i,
	/Get-Command\b/i,
	/\$LASTEXITCODE/,
]

export function needsPowerShell(command: string): boolean {
	return POWERSHELL_MARKERS.some((re) => re.test(command))
}

export function shellInvocation(
	command: string,
	platform: NodeJS.Platform = process.platform,
): ShellInvocation {
	if (platform === "win32") {
		if (needsPowerShell(command)) {
			return {
				args: ["-NoProfile", "-NonInteractive", "-Command", command],
				file: "powershell.exe",
			}
		}
		/* cmd.exe so bun -e / choco / || keep working */
		return { command, shell: true }
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
