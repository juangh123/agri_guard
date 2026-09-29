#!/usr/bin/env python3
"""Probe a live AgriGuard deployment and fail loudly when it has degraded.

The judge-facing demo has twice ended up serving throwaway data from the
container's /tmp SQLite fallback after the persistent database went away. The
dashboard shows a banner, but nothing paged the operator. This script turns
``GET /api/health/`` into a pass/fail check so it can run from CI, cron, or a
developer shell:

    python scripts/verify_deployment.py
    python scripts/verify_deployment.py --url http://127.0.0.1:8000 --no-require-persistent

Exit status is 0 only when every required check passes; otherwise it is 1 and
each failing check is printed with the offending value.

Standard library only, so it runs anywhere Python 3.8+ is available without
installing the project's Django/GeoDjango stack.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_URL = "https://agri-guard-api-live.vercel.app"
DEFAULT_MIN_FARMS = 1


def fetch_health(base_url, timeout):
    url = base_url.rstrip("/") + "/api/health/"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", "replace")
            status = response.status
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        status = exc.code
    except urllib.error.URLError as exc:
        raise SystemExit(f"FAIL: could not reach {url}: {exc.reason}")
    try:
        payload = json.loads(body)
    except ValueError:
        raise SystemExit(
            f"FAIL: {url} did not return JSON (HTTP {status}): {body[:200]}"
        )
    return status, payload


def evaluate(status, payload, *, require_persistent, min_farms):
    checks = []

    def check(name, ok, detail):
        checks.append((name, bool(ok), detail))

    check("http_200", status == 200, f"HTTP {status}")
    check("status_ok", payload.get("status") == "ok", payload.get("status"))

    database = payload.get("database") or {}
    check(
        "database_reachable",
        database.get("reachable") is True,
        database.get("error") or database.get("reachable"),
    )

    mode = payload.get("persistence_mode")
    if require_persistent:
        check(
            "persistence_persistent",
            mode == "persistent",
            f"{mode} ({payload.get('degraded_reason') or 'no reason reported'})",
        )
    else:
        check("persistence_reported", mode in {"persistent", "ephemeral"}, mode)

    applied = (payload.get("migrations") or {}).get("applied")
    check("migrations_applied", isinstance(applied, int) and applied > 0, applied)

    farms = (payload.get("data") or {}).get("farms")
    check(
        "demo_data_present",
        isinstance(farms, int) and farms >= min_farms,
        f"farms={farms}",
    )

    return checks


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Verify a live AgriGuard deployment via /api/health/."
    )
    parser.add_argument(
        "--url", default=os.getenv("AGRIGUARD_DEPLOYMENT_URL", DEFAULT_URL)
    )
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument(
        "--require-persistent",
        dest="require_persistent",
        action="store_true",
        default=True,
        help="fail when the demo is on the throwaway SQLite fallback (default)",
    )
    parser.add_argument(
        "--no-require-persistent",
        dest="require_persistent",
        action="store_false",
        help="accept the ephemeral fallback; only check reachability and data",
    )
    parser.add_argument("--min-farms", type=int, default=DEFAULT_MIN_FARMS)
    args = parser.parse_args(argv)

    status, payload = fetch_health(args.url, args.timeout)
    checks = evaluate(
        status,
        payload,
        require_persistent=args.require_persistent,
        min_farms=args.min_farms,
    )

    print(f"AgriGuard deployment check: {args.url}")
    print(
        f"  release={payload.get('release')} "
        f"environment={payload.get('environment')} "
        f"persistence_mode={payload.get('persistence_mode')}"
    )
    if payload.get("degraded_reason"):
        print(f"  degraded_reason={payload['degraded_reason']}")

    failed = 0
    for name, ok, detail in checks:
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}: {detail}")
        failed += 0 if ok else 1

    print(f"\n{len(checks) - failed}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())