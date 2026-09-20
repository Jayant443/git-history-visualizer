import os
import re
import subprocess
from pathlib import Path

_SAFE_GIT_ENV = {"GIT_TERMINAL_PROMPT": "0",}

_CREDENTIAL_RE = re.compile(r"(://)[^/@\s]+@[^\s]*")

def _redact(text: str) -> str:
    return _CREDENTIAL_RE.sub(r"\1***@", text)

def _safe_env() -> dict[str, str]:
    return {**os.environ, **_SAFE_GIT_ENV}

def _describe(cmd: list[str]) -> str:
    return _redact(" ".join(cmd))

def run_git(args: list[str] | tuple[str, ...], cwd: Path | str | None = None, timeout: int = 120) -> str:
    cmd = ["git", *args]
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            timeout=timeout,
            env=_safe_env(),
        )
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError(f"Git command timed out after {timeout}s: {_describe(cmd)}") from exc
    except FileNotFoundError as exc:
        raise RuntimeError("Git executable not found on PATH") from exc
    if result.returncode != 0:
        detail = _redact(result.stderr.strip())
        raise RuntimeError(f"Git command failed: {_describe(cmd)}\n{detail}")
    return result.stdout if result.stdout is not None else ""

def run_git_bytes(args: list[str] | tuple[str, ...], cwd: Path | str | None = None, timeout: int = 120,) -> bytes:
    cmd = ["git", *args]
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=timeout,
            env=_safe_env(),
        )
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError(f"Git command timed out after {timeout}s: {_describe(cmd)}") from exc
    except FileNotFoundError as exc:
        raise RuntimeError("Git executable not found on PATH") from exc
    if result.returncode != 0:
        detail = _redact(result.stderr.decode(errors="replace").strip())
        raise RuntimeError(f"Git command failed: {_describe(cmd)}\n{detail}")
    return result.stdout if result.stdout is not None else b""
