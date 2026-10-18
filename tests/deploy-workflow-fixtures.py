#!/usr/bin/env python3
"""Exercise the actual remote shell from deploy.yml using local Git fixtures.

No network, SSH, server, or credentials are used. Run with Python 3 and Bash;
on Windows, pass --bash C:/Git/Git/bin/bash.exe if Bash is not on PATH.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile

DEFAULT_WORKFLOW = Path(__file__).resolve().parents[1] / ".github/workflows/deploy.yml"
REMOTE_STAGING = "/root/autodl-tmp/auralink-github-staging/auralink-web"
REMOTE_HELPER = "/root/autodl-tmp/auralink-web-deploy/bin/deploy-web.sh"
REMOTE_LOCK = "/root/autodl-tmp/auralink-web-deploy/runtime/frontend-deployment.lock"


def run(command: list[str], **kwargs) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, text=True, capture_output=True, **kwargs)
    if result.returncode:
        raise RuntimeError(f"Command failed ({result.returncode}): {command!r}\n{result.stderr}")
    return result


def shell_path(path: Path) -> str:
    resolved = str(path.resolve()).replace("\\", "/")
    if os.name == "nt" and len(resolved) > 2 and resolved[1:3] == ":/":
        return "/" + resolved[0].lower() + resolved[2:]
    return resolved


def extract_remote_script(workflow: Path) -> str:
    lines = workflow.read_text(encoding="utf-8-sig").splitlines()
    marker = "          script: |"
    if lines.count(marker) != 1:
        raise AssertionError("Expected exactly one remote shell block")
    start = lines.index(marker) + 1
    block = []
    for line in lines[start:]:
        if line and not line.startswith("            "):
            break
        block.append(line[12:] if line else "")
    script = "\n".join(block).strip() + "\n"
    if script.count('${{ github.sha }}') != 1:
        raise AssertionError("Expected the event SHA to be assigned exactly once")
    if REMOTE_STAGING not in script or REMOTE_HELPER not in script or REMOTE_LOCK not in script:
        raise AssertionError("Existing R25 helper and staging contract changed")
    return script


def write_shell(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8", newline="\n")
    path.chmod(0o755)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bash", default=shutil.which("bash"))
    parser.add_argument("--workflow", type=Path, default=DEFAULT_WORKFLOW)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    git = shutil.which("git")
    if not args.bash or not git:
        parser.error("Bash and Git are required")
    remote_script = extract_remote_script(args.workflow)
    results = []
    with tempfile.TemporaryDirectory(prefix=".deploy-fixtures-", dir=args.workflow.resolve().parents[2], ignore_cleanup_errors=True) as temporary:
        root = Path(temporary)
        origin = root / "origin"
        run([git, "init", "-q", "--initial-branch=release", str(origin)])
        run([git, "-C", str(origin), "config", "user.name", "Deployment Fixture"])
        run([git, "-C", str(origin), "config", "user.email", "fixture@example.invalid"])
        marker = origin / "version.txt"
        marker.write_text("earlier\n", encoding="utf-8")
        run([git, "-C", str(origin), "add", "version.txt"])
        run([git, "-C", str(origin), "commit", "-qm", "earlier release"])
        earlier_sha = run([git, "-C", str(origin), "rev-parse", "HEAD"]).stdout.strip()
        marker.write_text("current\n", encoding="utf-8")
        run([git, "-C", str(origin), "commit", "-qam", "current release"])
        current_sha = run([git, "-C", str(origin), "rev-parse", "HEAD"]).stdout.strip()

        cases = [
            {"name": "matching SHA deploys", "expected": current_sha,
             "fail_fetches": 0, "fetches": 1, "helper": True, "success": True},
            {"name": "advanced release rejects queued SHA", "expected": earlier_sha,
             "fail_fetches": 0, "fetches": 1, "helper": False, "success": False,
             "message": "Release changed while this deployment was queued"},
            {"name": "fetch retry succeeds on third attempt", "expected": current_sha,
             "fail_fetches": 2, "fetches": 3, "helper": True, "success": True},
            {"name": "exhausted fetch retries block deploy", "expected": current_sha,
             "fail_fetches": 3, "fetches": 3, "helper": False, "success": False,
             "message": "Failed to fetch release after 3 attempts"},
            {"name": "invalid staging blocks fetch and deploy", "expected": current_sha,
             "invalid_staging": True, "fetches": 0, "helper": False, "success": False,
             "message": "Web staging directory is not a Git repository"},
            {"name": "missing helper blocks fetch and deploy", "expected": current_sha,
             "missing_helper": True, "fetches": 0, "helper": False, "success": False,
             "message": "Web deployment helper is not executable"},
            {"name": "helper failure propagates", "expected": current_sha,
             "helper_exit": 23, "fetches": 1, "helper": True, "success": False},
        ]
        for index, case in enumerate(cases):
            directory = root / f"case-{index}"
            directory.mkdir()
            staging = directory / "staging"
            run([git, "clone", "-q", "--no-checkout", str(origin), str(staging)])
            if case.get("invalid_staging"):
                staging = directory / "non-repository"
                staging.mkdir()
            fixture_bin = directory / "bin"
            fixture_bin.mkdir()
            counter = directory / "fetch-count.txt"
            helper_call = directory / "helper-args.txt"
            helper = directory / "deploy-web.sh"
            lock = directory / "frontend-deployment.lock"
            write_shell(fixture_bin / "git", """#!/usr/bin/env bash
set -eu
if [[ " $* " == *" fetch --no-tags origin release "* ]]; then
  count=0
  if [ -f "$FIXTURE_COUNTER" ]; then
    read -r count < "$FIXTURE_COUNTER"
  fi
  count=$((count + 1))
  printf '%s\\n' "$count" > "$FIXTURE_COUNTER"
  if [ "$count" -le "$FIXTURE_FAIL_FETCHES" ]; then
    echo "Simulated local fetch failure" >&2
    exit 1
  fi
fi
exec "$FIXTURE_REAL_GIT" "$@"
""")
            write_shell(fixture_bin / "sleep", "#!/usr/bin/env bash\nexit 0\n")
            write_shell(helper, """#!/usr/bin/env bash
set -eu
printf '%s\\n' "$@" > "$FIXTURE_HELPER_CALL"
exit "$FIXTURE_HELPER_EXIT"
""")
            if case.get("missing_helper"):
                helper = directory / "missing-deploy-web.sh"
            script = remote_script.replace('${{ github.sha }}', case["expected"])
            script = script.replace(REMOTE_STAGING, shlex.quote(shell_path(staging)))
            script = script.replace(REMOTE_HELPER, shlex.quote(shell_path(helper)))
            script = script.replace(REMOTE_LOCK, shlex.quote(shell_path(lock)))
            script = 'export PATH="$FIXTURE_BIN:$PATH"\n' + script
            script_file = directory / "remote-script.sh"
            write_shell(script_file, script)
            environment = os.environ.copy()
            environment.update({
                "FIXTURE_BIN": shell_path(fixture_bin),
                "FIXTURE_REAL_GIT": shell_path(Path(git)),
                "FIXTURE_COUNTER": shell_path(counter),
                "FIXTURE_FAIL_FETCHES": str(case.get("fail_fetches", 0)),
                "FIXTURE_HELPER_CALL": shell_path(helper_call),
                "FIXTURE_HELPER_EXIT": str(case.get("helper_exit", 0)),
                "GIT_TERMINAL_PROMPT": "0",
            })
            run([args.bash, "-n", shell_path(script_file)], env=environment)
            result = subprocess.run([args.bash, shell_path(script_file)],
                                    text=True, capture_output=True, env=environment)
            fetches = int(counter.read_text().strip()) if counter.exists() else 0
            arguments = helper_call.read_text().splitlines() if helper_call.exists() else None
            output = result.stdout + result.stderr
            assert (result.returncode == 0) == case["success"], (case["name"], output)
            assert fetches == case["fetches"], (case["name"], fetches, output)
            assert (arguments is not None) == case["helper"], (case["name"], output)
            if arguments is not None:
                assert arguments == ["deploy", case["expected"]], (case["name"], arguments)
            if case.get("message"):
                assert case["message"] in output, (case["name"], output)
            if case.get("helper_exit"):
                assert result.returncode == case["helper_exit"], (case["name"], result.returncode)
            results.append({"case": case["name"], "result": "PASS",
                            "exit_code": result.returncode, "fetch_attempts": fetches,
                            "helper_called": arguments is not None})
            print("PASS: " + case["name"])
    report = {"workflow": str(args.workflow.resolve()), "network_used": False,
              "server_used": False, "cases": results, "passed": len(results)}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"{len(results)} deployment shell fixtures passed.")


if __name__ == "__main__":
    main()
