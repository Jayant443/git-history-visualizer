import subprocess
from pathlib import Path

def run_git(args: list[str] | tuple[str, ...], cwd: Path | str | None = None, timeout: int = 120) -> str:
    cmd = ["git", *args]
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError(f"Git command timed out after {timeout}s: {' '.join(cmd)}") from exc
    except FileNotFoundError as exc:
        raise RuntimeError("Git executable not found on PATH") from exc
    if result.returncode != 0:
        raise RuntimeError(f"Git command failed: {' '.join(cmd)}\n{result.stderr.strip()}")
    return result.stdout
