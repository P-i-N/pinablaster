"""Safe static file lookup: only game assets, never anything outside the project root."""
from pathlib import Path
from urllib.parse import unquote, urlsplit

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".txt": "text/plain; charset=utf-8",
}

BLOCKED_DIRS = {"docs", "tests", "server_tests", "lan", ".claude", ".git", "__pycache__", "node_modules"}


def mime_type(path: Path) -> str:
    return MIME.get(path.suffix.lower(), "application/octet-stream")


def resolve(root: Path, url: str):
    """Maps a request target to a file below `root`, or None if it is not servable."""
    raw = urlsplit(url).path

    if "\x00" in raw:
        return None

    path = unquote(raw)

    if "\x00" in path or "\\" in path:
        return None

    parts = [p for p in path.split("/") if p not in ("", ".")]

    if not parts:
        parts = ["index.html"]

    if any(p == ".." or p.startswith(".") for p in parts):
        return None

    if parts[0] in BLOCKED_DIRS:
        return None

    if Path(parts[-1]).suffix.lower() not in MIME:
        return None

    root = root.resolve()
    candidate = root.joinpath(*parts)

    try:
        resolved = candidate.resolve()
        resolved.relative_to(root)
    except (OSError, ValueError):
        return None

    return candidate if resolved.is_file() else None
