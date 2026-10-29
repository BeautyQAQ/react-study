#!/usr/bin/env python3
"""Run React community and tic-tac-toe regression against disposable local services."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import secrets
import signal
import shutil
import socket
import subprocess
import sys

E2E = Path(__file__).resolve().parent
ROOT = E2E.parents[1]
DEPLOY = ROOT / "liushao_community_backend/deploy"


def isolated_environment():
    # Shell variables take precedence over Compose --env-file. Never inherit app/deploy
    # configuration, even when this command is run from a developer's configured shell.
    return {key: value for key, value in os.environ.items()
            if not re.match(r"^(DB_|REDIS_|SMTP_|JWT_|COMMUNITY_|ADMIN_|MYSQL_|BOOTSTRAP_|COMPOSE_|DEPLOY_|E2E_)", key)
            and key not in ("BIND_ADDRESS", "SPRING_PROFILES_ACTIVE", "DOCKER_CONTEXT")}


def free_ports(count):
    sockets = []
    try:
        for _ in range(count):
            connection = socket.socket()
            connection.bind(("127.0.0.1", 0))
            sockets.append(connection)
        return [connection.getsockname()[1] for connection in sockets]
    finally:
        for connection in sockets:
            connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", choices=("all", "desktop", "mobile"), default="all",
                        help="Playwright viewport project (default: both)")
    parser.add_argument("--grep", help="Run matching Playwright test titles in a fresh isolated stack")
    parser.add_argument("--skip-install", action="store_true", help="Reuse e2e/node_modules and installed Chromium")
    parser.add_argument("--keep-environment", action="store_true",
                        help="Keep only this generated stack and its private credentials for local debugging")
    parser.add_argument("--npm-registry", help="Optional trusted npm mirror for frontend image builds")
    parser.add_argument("--maven-settings", type=Path, help="Optional private Maven settings mounted only while building")
    args = parser.parse_args()
    os.umask(0o077)
    def terminate(_signal, _frame):
        raise KeyboardInterrupt("Termination requested; cleaning up the isolated stack")
    signal.signal(signal.SIGTERM, terminate)
    for binary in ("docker", "node", "npm"):
        if not shutil.which(binary):
            parser.error(f"{binary} is required")
    if args.maven_settings and not args.maven_settings.is_file():
        parser.error("Maven settings file does not exist")

    environment = isolated_environment()
    # This runner is intentionally local. Do not accidentally provision on a remote NAS daemon.
    endpoint = environment.get("DOCKER_HOST")
    if not endpoint:
        try:
            context = json.loads(subprocess.check_output(
                ["docker", "context", "inspect"], env=environment, text=True, stderr=subprocess.PIPE))
            endpoint = context[0]["Endpoints"]["docker"]["Host"]
        except (subprocess.CalledProcessError, KeyError, ValueError) as error:
            parser.error(f"Cannot inspect the local Docker context: {type(error).__name__}")
    if not endpoint.startswith("unix://"):
        parser.error("Use a local Docker Unix socket; remote Docker endpoints are not allowed")
    environment["DOCKER_HOST"] = endpoint

    suffix = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ").lower() + "-" + secrets.token_hex(4)
    project = "liushao-e2e-" + suffix
    artifacts = E2E / ".artifacts" / suffix
    private = artifacts / "private"
    private.mkdir(parents=True, mode=0o700)
    env_file = private / "environment"
    community_port, admin_port, inbox_port = free_ports(3)
    logfile = artifacts / "runner.log"
    compose = ["docker", "compose", "--project-directory", str(DEPLOY), "--env-file", str(env_file),
               "-p", project, "-f", str(DEPLOY / "compose.yaml"), "-f", str(E2E / "compose.yaml")]
    if args.maven_settings:
        compose += ["-f", str(DEPLOY / "compose.maven.yaml")]
        environment["MAVEN_SETTINGS_FILE"] = str(args.maven_settings.resolve())
    started = False
    passed = False

    def run(command, label, timeout=1200, cwd=ROOT, command_env=None):
        print(label, flush=True)
        with logfile.open("a") as log:
            process = subprocess.Popen(command, cwd=cwd, env=command_env or environment,
                                       stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                returncode = process.wait(timeout=timeout)
            except BaseException:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
                except ProcessLookupError:
                    pass
                raise
        if returncode:
            raise RuntimeError(f"{label} failed (exit {returncode}); see {logfile}")

    try:
        run([sys.executable, str(DEPLOY / "scripts/init-deploy.py"), "--output", str(env_file),
             "--project", project, "--community-port", str(community_port), "--admin-port", str(admin_port)],
            "Create independent test credentials", timeout=15)
        with env_file.open("a") as stream:
            stream.write(f"E2E_SMTP_HTTP_PORT={inbox_port}\n")
        revisions = {}
        for name in ("authority_management_backend", "authority_management_frontend",
                     "liushao_community_backend", "react-study"):
            try:
                revisions[name] = {
                    "commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT / name, env=environment, text=True, stderr=subprocess.DEVNULL).strip(),
                    "dirty": bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT / name, env=environment, text=True, stderr=subprocess.DEVNULL).strip()),
                }
            except (OSError, subprocess.CalledProcessError):
                revisions[name] = {"commit": None, "dirty": None}  # Source archive without .git.
        (artifacts / "sources.json").write_text(json.dumps(revisions, indent=2) + "\n")
        run(compose + ["config", "--quiet"], "Validate isolated Compose configuration", timeout=30)
        if not args.skip_install:
            run(["npm", "ci", "--include=dev", "--no-audit", "--no-fund"], "Install locked browser-test dependencies", cwd=E2E)
            if not environment.get("CHROMIUM_EXECUTABLE"):
                run(["npm", "exec", "--no", "--", "playwright", "install", "chromium"],
                    "Prepare pinned Chromium", cwd=E2E)
        elif not (E2E / "node_modules/@playwright/test/package.json").is_file():
            raise RuntimeError("--skip-install requires an existing e2e/node_modules installation")
        run(["node", str(E2E / "check-browser.cjs")], "Check browser launch and record actual runtime versions",
            cwd=E2E, timeout=60, command_env={**environment, "E2E_ARTIFACTS": str(artifacts)})

        build = compose + ["--progress", "plain", "build"]
        if args.npm_registry:
            build += ["--build-arg", f"NPM_REGISTRY={args.npm_registry}"]
        run(build, "Build the four current production applications")
        started = True  # Partial Compose startup must also be cleaned up on failure.
        run(compose + ["up", "-d", "--no-build", "--wait", "--wait-timeout", "600"],
            "Start fresh MySQL, Redis, SMTP and four applications", timeout=660)
        run([sys.executable, str(DEPLOY / "scripts/smoke-deploy.py"),
             "--community", f"http://127.0.0.1:{community_port}",
             "--admin", f"http://127.0.0.1:{admin_port}"], "Check production assets, proxies and authentication boundaries", timeout=120)
        test_env = {**environment,
                    "E2E_ISOLATED": "1", "E2E_PROJECT": project, "E2E_ENV_FILE": str(env_file),
                    "E2E_ROOT": str(ROOT), "E2E_ARTIFACTS": str(artifacts),
                    "E2E_COMMUNITY_URL": f"http://127.0.0.1:{community_port}",
                    "E2E_ADMIN_URL": f"http://127.0.0.1:{admin_port}",
                    "E2E_SMTP_URL": f"http://127.0.0.1:{inbox_port}"}
        command = ["npm", "test", "--"]
        if args.project != "all":
            command += ["--project", args.project]
        if args.grep:
            command += ["--grep", args.grep]
        run(command, "Run real API browser workflows", timeout=2400, cwd=E2E, command_env=test_env)
        passed = True
    except (RuntimeError, subprocess.TimeoutExpired, OSError, KeyboardInterrupt) as error:
        print(f"FAIL: {error}", file=sys.stderr, flush=True)
        if started:
            with (artifacts / "services.log").open("w") as log:
                for command in (compose + ["ps", "-a"], compose + ["logs", "--no-color", "--tail", "100"]):
                    try:
                        subprocess.run(command, env=environment, stdout=log, stderr=subprocess.STDOUT, timeout=30)
                    except (subprocess.TimeoutExpired, OSError):
                        log.write("Could not collect some service diagnostics.\n")
    finally:
        # A second CI cancellation must not interrupt removal of disposable data.
        for interrupted in (signal.SIGTERM, signal.SIGINT):
            signal.signal(interrupted, signal.SIG_IGN)
        if args.keep_environment and started:
            print(f"Kept disposable project {project}; private environment: {env_file}", flush=True)
            print("Cleanup: " + " ".join(compose + ["down", "--volumes", "--rmi", "local", "--remove-orphans"]), flush=True)
        else:
            if env_file.is_file():
                try:
                    run(compose + ["down", "--volumes", "--rmi", "local", "--remove-orphans"],
                        "Remove only this run's containers, volumes and generated application images", timeout=180)
                except (RuntimeError, subprocess.TimeoutExpired, OSError) as error:
                    passed = False
                    print(f"Cleanup failed for {project}: {error}; private environment retained at {env_file}", file=sys.stderr)
                else:
                    env_file.unlink()
                    private.rmdir()
        print(f"Private test artifacts: {artifacts}", flush=True)

    if passed:
        print("PASS: current production applications passed real API browser regression", flush=True)
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
