#!/usr/bin/env python3
"""Probe a live AgriGuard deployment and fail loudly when it has degraded.

The judge-facing demo has twice ended up serving throwaway data from the
container's /tmp SQLite fallback after the persistent database went away, and a
stale frontend deployment has pointed at a dead API host. The dashboard shows a
banner for the first case, but nothing paged the operator for either. This
script turns the judge-facing surface into pass/fail checks so it can run from
CI, cron, or a developer shell:

    python scripts/verify_deployment.py
    python scripts/verify_deployment.py --url http://127.0.0.1:8000 --no-require-persistent
    python scripts/verify_deployment.py --no-frontend   # API checks only

Checks cover ``GET /api/health/`` (database, migrations, demo data) plus, when
the target is a remote host, the browser entry point: the HTML shell renders, the
hashing-named bundle is reachable, that bundle talks to its own origin instead of
a hardcoded API host, ``/api/farms/`` answers with GeoJSON, and ``/ws/alerts/``
completes a WebSocket upgrade.

Exit status is 0 only when every required check passes; otherwise it is 1 and
each failing check is printed with the offending value.

Standard library only, so it runs anywhere Python 3.8+ is available without
installing the project's Django/GeoDjango stack.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import socket
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_URL = "https://agri-guard-api-live.vercel.app"
DEFAULT_MIN_FARMS = 1

# The Vite shell must leave this mount point for React to attach to.
ROOT_MARKER = b'<div id="root">'
# Fingerprinted entry bundle emitted by Vite, e.g. /assets/index-DHn5oiAG.js
ENTRY_ASSET_PATTERN = re.compile(rb'src="(/assets/[^"]+\.js)"')
# An absolute API base baked into the bundle means the SPA calls a host that is
# not the one the judge opened. The dead onrender.com deployment shipped this.
ABSOLUTE_API_BASE_PATTERN = re.compile(
    r"""https?://[^\s"'`()\\]*?/api(?![A-Za-z0-9_])"""
)
# Vite emits lazy route chunks as "./Dashboard-<hash>.js" next to the entry.
LAZY_CHUNK_PATTERN = re.compile(rb"\./([A-Za-z0-9_\-]+\.js)")
LOCALHOST_HINTS = ("127.0.0.1", "localhost:8000", "0.0.0.0:8000")
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1", "0.0.0.0"}


class FetchError(Exception):
    """Raised when an HTTP probe cannot produce a response at all."""


def http_get(url, timeout, headers=None, method="GET"):
    """Return (status, headers, body bytes) for one request.

    HTTP error statuses are returned instead of raised so callers can report
    them as failed checks rather than crashing the probe.
    """
    request = urllib.request.Request(
        url,
        headers={"Accept": "*/*", **(headers or {})},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers or {}), exc.read()
    except urllib.error.URLError as exc:
        raise FetchError(f"could not reach {url}: {exc.reason}")


def fetch_health(base_url, timeout):
    url = base_url.rstrip("/") + "/api/health/"
    try:
        status, _, raw = http_get(
            url, timeout, headers={"Accept": "application/json"}
        )
    except FetchError as exc:
        raise FetchError(str(exc))
    body = raw.decode("utf-8", "replace")
    try:
        payload = json.loads(body)
    except ValueError:
        raise FetchError(
            f"{url} did not return JSON (HTTP {status}): {body[:200]}"
        )
    return status, payload


def find_absolute_api_bases(bundle_text):
    """Return absolute API base URLs embedded in a frontend bundle."""
    return sorted(set(ABSOLUTE_API_BASE_PATTERN.findall(bundle_text)))


def evaluate_frontend(base_url, timeout):
    """Check the browser entry point a judge opens, not just the API."""
    checks = []
    origin = base_url.rstrip("/")
    host = urllib.parse.urlsplit(origin).hostname or ""

    try:
        status, headers, html = http_get(origin + "/", timeout)
    except FetchError as exc:
        return [("frontend_reachable", False, str(exc))]

    content_type = (headers.get("Content-Type") or "").lower()
    checks.append(("frontend_http_200", status == 200, f"HTTP {status}"))
    checks.append(
        (
            "frontend_serves_spa",
            status == 200 and "text/html" in content_type and ROOT_MARKER in html,
            f"content-type={content_type or 'unknown'} root_marker={ROOT_MARKER in html}",
        )
    )

    assets = ENTRY_ASSET_PATTERN.findall(html)
    checks.append(
        (
            "frontend_entry_asset_declared",
            bool(assets),
            ", ".join(a.decode("ascii", "replace") for a in assets[:3]) or "none",
        )
    )
    if not assets:
        return checks

    asset_path = assets[0].decode("ascii", "replace")
    try:
        asset_status, _, bundle = http_get(origin + asset_path, timeout)
    except FetchError as exc:
        checks.append(("frontend_entry_asset_reachable", False, str(exc)))
        return checks

    checks.append(
        (
            "frontend_entry_asset_reachable",
            asset_status == 200 and len(bundle) > 1024,
            f"HTTP {asset_status} bytes={len(bundle)}",
        )
    )

    text = bundle.decode("utf-8", "replace")
    absolute_bases = find_absolute_api_bases(text)
    stale_bases = [
        base
        for base in absolute_bases
        if (urllib.parse.urlsplit(base).hostname or "") not in {"", host}
    ]
    checks.append(
        (
            "frontend_api_same_origin",
            not stale_bases,
            ", ".join(stale_bases) or f"relative base (host={host})",
        )
    )
    localhost_hits = sorted({hint for hint in LOCALHOST_HINTS if hint in text})
    checks.append(
        (
            "frontend_has_no_localhost_api",
            not localhost_hits,
            ", ".join(localhost_hits) or "clean",
        )
    )
    checks.append(check_websocket_bundle(origin, bundle, timeout))
    return checks


def check_websocket_bundle(origin, entry_bundle, timeout):
    """The SPA must build an absolute ws:// URL, never a relative one.

    ``new WebSocket("/ws/alerts/")`` throws, and the app wrapped that call in a
    bare catch, so a relative URL silently disabled live alerts in production.
    Any chunk that mentions the socket endpoint has to also know how to build an
    absolute URL (``wss:`` appears in that code path).
    """
    chunks = sorted(
        {name.decode("ascii") for name in LAZY_CHUNK_PATTERN.findall(entry_bundle)}
    )
    # The socket hook can live in the entry bundle or in a lazy route chunk.
    candidates = [("entry bundle", entry_bundle)]
    for name in chunks:
        try:
            status, _, body = http_get(f"{origin}/assets/{name}", timeout)
        except FetchError:
            continue
        if status == 200:
            candidates.append((name, body))

    socket_chunks = []
    for name, body in candidates:
        text = body.decode("utf-8", "replace")
        if "/ws/alerts/" in text:
            socket_chunks.append((name, "wss:" in text))

    if not socket_chunks:
        return (
            "frontend_websocket_url_absolute",
            False,
            f"no /ws/alerts/ reference in the entry bundle or {len(chunks)} lazy chunk(s)",
        )
    offenders = [name for name, absolute in socket_chunks if not absolute]
    return (
        "frontend_websocket_url_absolute",
        not offenders,
        ", ".join(offenders) if offenders else f"{socket_chunks[0][0]} builds wss://",
    )


def check_public_api(base_url, timeout):
    """Confirm anonymous judges get GeoJSON instead of the HTML shell."""
    url = base_url.rstrip("/") + "/api/farms/"
    try:
        status, headers, body = http_get(
            url, timeout, headers={"Accept": "application/json"}
        )
    except FetchError as exc:
        return ("public_api_geojson", False, str(exc))
    content_type = (headers.get("Content-Type") or "").lower()
    try:
        payload = json.loads(body.decode("utf-8", "replace"))
    except ValueError:
        payload = None
    ok = (
        status == 200
        and "json" in content_type
        and isinstance(payload, dict)
        and payload.get("type") == "FeatureCollection"
    )
    detail = f"HTTP {status} content-type={content_type or 'unknown'}"
    if payload is None:
        detail += " body=not-json"
    elif isinstance(payload, dict):
        features = payload.get("features")
        if isinstance(features, list):
            detail += f" features={len(features)}"
    return ("public_api_geojson", ok, detail)


def check_websocket_upgrade(base_url, timeout):
    """Attempt a real WebSocket handshake against /ws/alerts/."""
    parsed = urllib.parse.urlsplit(base_url)
    secure = parsed.scheme != "http"
    host = parsed.hostname or ""
    port = parsed.port or (443 if secure else 80)
    path = "/ws/alerts/"
    key = base64.b64encode(os.urandom(16)).decode("ascii")
    origin = f"{parsed.scheme}://{parsed.netloc}"
    request = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {parsed.netloc}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        f"Origin: {origin}\r\n"
        "\r\n"
    ).encode("ascii")

    try:
        connection = socket.create_connection((host, port), timeout=timeout)
    except OSError as exc:
        return ("websocket_upgrade", False, f"connect failed: {exc}")

    try:
        if secure:
            context = ssl.create_default_context()
            connection = context.wrap_socket(connection, server_hostname=host)
        connection.settimeout(timeout)
        connection.sendall(request)
        response = connection.recv(4096).decode("latin-1", "replace")
    except OSError as exc:
        return ("websocket_upgrade", False, f"handshake failed: {exc}")
    finally:
        connection.close()

    status_line = response.split("\r\n", 1)[0].strip() or "no response"
    return (
        "websocket_upgrade",
        " 101 " in f" {status_line} ",
        status_line,
    )


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
    parser.add_argument(
        "--frontend",
        dest="frontend",
        action="store_true",
        default=None,
        help="also check the judge-facing HTML shell and bundle (default for remote hosts)",
    )
    parser.add_argument(
        "--no-frontend",
        dest="frontend",
        action="store_false",
        help="skip the browser surface checks; only probe the API",
    )
    args = parser.parse_args(argv)

    try:
        status, payload = fetch_health(args.url, args.timeout)
    except FetchError as exc:
        # Keep going: the browser-surface checks below often explain *why* the
        # health endpoint failed (for example a stale shell serving HTML).
        status, payload = 0, {}
        checks = [("health_endpoint", False, str(exc))]
    else:
        checks = evaluate(
            status,
            payload,
            require_persistent=args.require_persistent,
            min_farms=args.min_farms,
        )

    host = urllib.parse.urlsplit(args.url).hostname or ""
    check_frontend = args.frontend
    if check_frontend is None:
        # Local API-only runs (the documented Docker workflow) have no SPA in
        # front of Django, so the browser checks only make sense for remote hosts.
        check_frontend = host not in LOCAL_HOSTS
    if check_frontend:
        checks.extend(evaluate_frontend(args.url, args.timeout))
        checks.append(check_public_api(args.url, args.timeout))
        checks.append(check_websocket_upgrade(args.url, args.timeout))

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
