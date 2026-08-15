#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose=(docker compose -f "${root}/compose.yml")

if [ "$#" -gt 0 ]; then
	targets=("$@")
else
	targets=(linux-apt linux-dnf linux-pacman windows macos)
fi

echo "== build linux images =="
"${compose[@]}" build linux-apt linux-dnf linux-pacman

fail=0
for target in "${targets[@]}"; do
	echo
	echo "== ${target} =="
	if ! "${compose[@]}" run --rm --no-deps "${target}"; then
		echo "!! ${target} failed"
		fail=1
	fi
done

exit "${fail}"
