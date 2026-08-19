const cli = `${import.meta.dir}/../../../packages/core/src/cli.ts`

export async function runCli(
	args: string[],
	opts: { cwd?: string; env?: Record<string, string | undefined> } = {},
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
	const env: Record<string, string | undefined> = { ...process.env, ...opts.env }
	if (opts.env && "CROSSDEPS_OS" in opts.env && opts.env.CROSSDEPS_OS === undefined) {
		delete env.CROSSDEPS_OS
	}
	const proc = Bun.spawn(["bun", cli, ...args], {
		cwd: opts.cwd ?? process.cwd(),
		env,
		stderr: "pipe",
		stdout: "pipe",
	})
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	])
	return { exitCode, stderr, stdout }
}

export function bunWrite(envKey: string, value: string): string {
	return `bun -e ${JSON.stringify(`await Bun.write(process.env.${envKey}, ${JSON.stringify(value)})`)}`
}

export function bunAppend(envKey: string, value: string): string {
	return `bun -e ${JSON.stringify(`const p=process.env.${envKey}; const prev=await Bun.file(p).exists()?await Bun.file(p).text():""; await Bun.write(p, prev+${JSON.stringify(value)})`)}`
}

export function bunLog(value: string): string {
	return `bun -e ${JSON.stringify(`console.log(${JSON.stringify(value)})`)}`
}

export function bunRead(envKey: string): string {
	return `bun -e ${JSON.stringify(`console.log((await Bun.file(process.env.${envKey}).text()).trim())`)}`
}
