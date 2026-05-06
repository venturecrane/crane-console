#!/usr/bin/env python3
"""crane_tools.py — bridges Hermes to crane-mcp via stdio MCP.

Spawns `crane-mcp` as a long-lived subprocess at first use and proxies
tool calls via JSON-RPC 2.0 over stdin/stdout. Tools are discovered
dynamically from `tools/list`, so whatever crane-mcp exposes becomes
available to Hermes automatically — no hardcoded tool list.

Deploy: `scripts/hermes-deploy-tools.sh` (ships this file to
`~/.hermes/hermes-agent/tools/crane_tools.py`) + `setupHermesMcp()`
in `packages/crane-mcp/src/cli/launch-lib.ts` (patches
`model_tools.py` to import it).

Requires: `crane-mcp` binary on PATH, `CRANE_CONTEXT_KEY` in env.
"""

from __future__ import annotations

import atexit
import json
import logging
import os
import shutil
import subprocess
import threading
from typing import Any, Dict, List, Optional

from tools.registry import registry

logger = logging.getLogger(__name__)

_proc: Optional[subprocess.Popen] = None
_proc_lock = threading.RLock()
_next_id = 0
_id_lock = threading.Lock()
_tools_cache: Optional[List[dict]] = None


def _next_request_id() -> int:
    global _next_id
    with _id_lock:
        _next_id += 1
        return _next_id


def _rpc(method: str, params: Optional[Dict[str, Any]] = None, timeout_s: float = 60.0) -> dict:
    """Send a JSON-RPC request and read its response. Thread-safe."""
    with _proc_lock:
        proc = _ensure_proc()
        request = {
            "jsonrpc": "2.0",
            "id": _next_request_id(),
            "method": method,
            "params": params or {},
        }
        assert proc.stdin is not None and proc.stdout is not None
        proc.stdin.write(json.dumps(request) + "\n")
        proc.stdin.flush()
        line = proc.stdout.readline()
        if not line:
            raise RuntimeError("crane-mcp closed stdout unexpectedly")
        return json.loads(line)


def _notify(method: str, params: Optional[Dict[str, Any]] = None) -> None:
    """Fire a JSON-RPC notification (no response expected)."""
    with _proc_lock:
        proc = _ensure_proc()
        payload = {"jsonrpc": "2.0", "method": method, "params": params or {}}
        assert proc.stdin is not None
        proc.stdin.write(json.dumps(payload) + "\n")
        proc.stdin.flush()


def _ensure_proc() -> subprocess.Popen:
    """Spawn crane-mcp on first use; relaunch if it died."""
    global _proc
    if _proc is None or _proc.poll() is not None:
        binary = shutil.which("crane-mcp")
        if not binary:
            raise RuntimeError("crane-mcp binary not on PATH")
        logger.info("spawning crane-mcp subprocess: %s", binary)
        _proc = subprocess.Popen(
            [binary],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
            env={**os.environ},
        )
        atexit.register(_shutdown)
        # MCP handshake
        init_req = {
            "jsonrpc": "2.0",
            "id": _next_request_id(),
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "hermes-crane-bridge", "version": "1.0"},
            },
        }
        assert _proc.stdin is not None and _proc.stdout is not None
        _proc.stdin.write(json.dumps(init_req) + "\n")
        _proc.stdin.flush()
        # Drain initialize response
        line = _proc.stdout.readline()
        if not line:
            raise RuntimeError("crane-mcp closed during initialize")
        # Send initialized notification
        _proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}}) + "\n")
        _proc.stdin.flush()
    return _proc


def _shutdown() -> None:
    global _proc
    with _proc_lock:
        if _proc and _proc.poll() is None:
            try:
                _proc.terminate()
                _proc.wait(timeout=5)
            except Exception:
                try:
                    _proc.kill()
                except Exception:
                    pass
        _proc = None


def _discover_tools() -> List[dict]:
    """Call tools/list on crane-mcp, cache the result."""
    global _tools_cache
    if _tools_cache is not None:
        return _tools_cache
    resp = _rpc("tools/list")
    if "error" in resp:
        logger.warning("crane-mcp tools/list returned error: %s", resp["error"])
        _tools_cache = []
        return _tools_cache
    tools = resp.get("result", {}).get("tools", [])
    logger.info("discovered %d crane MCP tools", len(tools))
    _tools_cache = tools
    return _tools_cache


def _call_tool(name: str, arguments: Dict[str, Any]) -> str:
    """Invoke a crane MCP tool and return its result as a string."""
    try:
        resp = _rpc("tools/call", {"name": name, "arguments": arguments or {}}, timeout_s=120.0)
        if "error" in resp:
            return json.dumps({"error": resp["error"]})
        result = resp.get("result", {})
        content = result.get("content", [])
        if isinstance(content, list) and content:
            texts = [c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"]
            if texts:
                return "\n".join(texts)
        return json.dumps(result)
    except Exception as e:
        logger.exception("crane tool call failed: %s", name)
        return json.dumps({"error": str(e)})


# ── Registration ──

def _check_crane_available() -> bool:
    """Enable crane toolset only when crane-mcp is installed + auth is configured."""
    if not shutil.which("crane-mcp"):
        return False
    if not os.getenv("CRANE_CONTEXT_KEY"):
        return False
    return True


def _openai_schema_from_mcp(tool: dict) -> dict:
    """Convert an MCP tool descriptor into an OpenAI function-calling schema."""
    return {
        "name": tool["name"],
        "description": tool.get("description", ""),
        "parameters": tool.get("inputSchema") or {"type": "object", "properties": {}},
    }


def _make_handler(tool_name: str):
    def handler(args: Optional[Dict[str, Any]] = None, **kwargs):
        # Registry.dispatch calls `entry.handler(args, **kwargs)` — `args` is the
        # tool call's arguments dict. kwargs may include things like a session id
        # that we ignore.
        return _call_tool(tool_name, args or {})
    handler.__name__ = f"_handle_{tool_name}"
    return handler


# Top-level sentinel registration so Hermes v2026.4+ `discover_builtin_tools`
# (AST-based) recognizes this as a self-registering tool module. The sentinel
# has check_fn=lambda: False, so it never appears in any tool list — it exists
# solely to trip the AST detector into importing this module. `_register_tools`
# below does the real work (dynamic subprocess-driven discovery).
registry.register(
    name="_crane_tools_sentinel",
    toolset="crane",
    schema={
        "name": "_crane_tools_sentinel",
        "description": "internal",
        "parameters": {"type": "object", "properties": {}},
    },
    handler=lambda *a, **kw: "",
    check_fn=lambda: False,
)


def _register_tools() -> None:
    """Discover and register all crane-mcp tools as hermes tools (toolset: crane)."""
    if not _check_crane_available():
        logger.info("crane-mcp not available; skipping registration")
        return
    try:
        tools = _discover_tools()
    except Exception as e:
        logger.warning("crane tool discovery failed: %s", e)
        return
    names: List[str] = []
    for tool in tools:
        name = tool.get("name")
        if not name:
            continue
        names.append(name)
        registry.register(
            name=name,
            toolset="crane",
            schema=_openai_schema_from_mcp(tool),
            handler=_make_handler(name),
            check_fn=_check_crane_available,
            requires_env=["CRANE_CONTEXT_KEY"],
            is_async=False,
            description=tool.get("description", ""),
        )
    # Expose "crane" as a named toolset so platform_toolsets.{cli,telegram}
    # entries like `- crane` resolve to the discovered tool list. Without
    # this, toolset="crane" registrations are orphaned from the perspective
    # of `toolsets.resolve_toolset`.
    try:
        from toolsets import TOOLSETS  # type: ignore
        TOOLSETS["crane"] = {
            "description": "Crane MCP tools (bridged to local crane-mcp subprocess)",
            "tools": names,
            "includes": [],
        }
    except Exception as e:
        logger.warning("could not register 'crane' in TOOLSETS dict: %s", e)
    logger.info("registered %d crane tools under toolset 'crane'", len(names))


_register_tools()
