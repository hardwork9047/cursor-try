"""OS, CPU, and GPU. Missing tools become null. Nothing here is guessed."""

from __future__ import annotations

import os
import platform
import re
import subprocess
from pathlib import Path


def _run(cmd: list[str], timeout: float = 8) -> tuple[int | None, str, str]:
    try:
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return completed.returncode, completed.stdout or "", completed.stderr or ""
    except (OSError, subprocess.TimeoutExpired) as exc:
        return None, "", str(exc)


def _cpu_name() -> str | None:
    system = platform.system()
    if system == "Linux":
        try:
            text = Path("/proc/cpuinfo").read_text(encoding="utf-8", errors="replace")
        except OSError:
            text = ""
        for line in text.splitlines():
            if line.lower().startswith("model name"):
                return line.split(":", 1)[1].strip() or None
        return None
    if system == "Darwin":
        code, out, _err = _run(["sysctl", "-n", "machdep.cpu.brand_string"])
        if code == 0 and out.strip():
            return out.strip()
        return None
    if system == "Windows":
        code, out, _err = _run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name)",
            ]
        )
        if code == 0 and out.strip():
            return out.strip()
    processor = platform.processor()
    return processor or None


def _ram_bytes() -> int | None:
    system = platform.system()
    if system == "Linux":
        try:
            text = Path("/proc/meminfo").read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None
        for line in text.splitlines():
            if line.startswith("MemTotal:"):
                parts = line.split()
                if len(parts) >= 2 and parts[1].isdigit():
                    return int(parts[1]) * 1024
        return None
    if system == "Darwin":
        code, out, _err = _run(["sysctl", "-n", "hw.memsize"])
        if code == 0 and out.strip().isdigit():
            return int(out.strip())
        return None
    if system == "Windows":
        code, out, _err = _run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory",
            ]
        )
        if code == 0 and out.strip().isdigit():
            return int(out.strip())
    return None


def _nvidia_gpus() -> list[dict[str, object]]:
    code, out, _err = _run(
        [
            "nvidia-smi",
            "--query-gpu=name,memory.total,driver_version",
            "--format=csv,noheader,nounits",
        ]
    )
    if code != 0 or not out.strip():
        return []
    gpus: list[dict[str, object]] = []
    for line in out.splitlines():
        parts = [part.strip() for part in line.split(",")]
        if len(parts) < 2 or not parts[0]:
            continue
        vram_mib: float | None
        try:
            vram_mib = float(parts[1])
        except ValueError:
            vram_mib = None
        gpus.append(
            {
                "name": parts[0],
                "vram_mib": vram_mib,
                "driver": parts[2] if len(parts) >= 3 and parts[2] else None,
                "source": "nvidia-smi",
            }
        )
    return gpus


def _macos_gpus() -> list[dict[str, object]]:
    code, out, _err = _run(["system_profiler", "SPDisplaysDataType", "-json"], timeout=25)
    if code != 0 or not out.strip():
        return []
    try:
        import json

        payload = json.loads(out)
    except json.JSONDecodeError:
        return []
    rows = payload.get("SPDisplaysDataType") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        return []
    gpus: list[dict[str, object]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = row.get("sppci_model") or row.get("_name") or row.get("sppci_device_type")
        if not isinstance(name, str) or not name.strip():
            continue
        vram_mib = _macos_vram_mib(row.get("spdisplays_vram"))
        gpus.append(
            {
                "name": name.strip(),
                "vram_mib": vram_mib,
                "vram_note": "system_profiler の表示。Apple Silicon の統合メモリとは限らない。",
                "driver": None,
                "source": "system_profiler SPDisplaysDataType",
            }
        )
    return gpus


def _macos_vram_mib(value: object) -> float | None:
    if not isinstance(value, str):
        return None
    match = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(GB|MB|GiB|MiB)", value, flags=re.IGNORECASE)
    if not match:
        return None
    amount = float(match.group(1))
    unit = match.group(2).lower()
    if unit in {"gb", "gib"}:
        return amount * 1024
    return amount


def _windows_gpus() -> list[dict[str, object]]:
    code, out, _err = _run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json",
        ],
        timeout=20,
    )
    if code != 0 or not out.strip():
        return []
    try:
        import json

        payload = json.loads(out)
    except json.JSONDecodeError:
        return []
    rows = payload if isinstance(payload, list) else [payload]
    gpus: list[dict[str, object]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = row.get("Name")
        if not isinstance(name, str) or not name.strip():
            continue
        ram = row.get("AdapterRAM")
        vram_mib = None
        note = "Win32_VideoController の AdapterRAM。4GB で頭打ちになることがある。"
        if isinstance(ram, (int, float)) and ram > 0:
            vram_mib = float(ram) / (1024 * 1024)
        gpus.append(
            {
                "name": name.strip(),
                "vram_mib": vram_mib,
                "vram_note": note,
                "driver": None,
                "source": "Win32_VideoController",
            }
        )
    return gpus


def _linux_pci_gpus() -> list[dict[str, object]]:
    code, out, _err = _run(["lspci", "-nn"])
    if code != 0 or not out.strip():
        return []
    gpus: list[dict[str, object]] = []
    for line in out.splitlines():
        lowered = line.lower()
        if "vga" not in lowered and "3d controller" not in lowered and "display" not in lowered:
            continue
        name = line.split(":", 2)[-1].strip() if ":" in line else line.strip()
        gpus.append(
            {
                "name": name,
                "vram_mib": None,
                "driver": None,
                "source": "lspci",
            }
        )
    return gpus


def detect_gpus() -> list[dict[str, object]]:
    nvidia = _nvidia_gpus()
    if nvidia:
        return nvidia
    system = platform.system()
    if system == "Darwin":
        found = _macos_gpus()
        if found:
            return found
    elif system == "Windows":
        found = _windows_gpus()
        if found:
            return found
    elif system == "Linux":
        found = _linux_pci_gpus()
        if found:
            return found
    return []


def format_vram_mib(vram_mib: object) -> str | None:
    if not isinstance(vram_mib, (int, float)) or vram_mib <= 0:
        return None
    gb = float(vram_mib) / 1024.0
    if abs(gb - round(gb)) < 0.05:
        return f"{round(gb)} GB"
    return f"{gb:.1f} GB"


def format_gpu_short(gpus: list[dict[str, object]]) -> str:
    if not gpus:
        return "GPU不明"
    parts: list[str] = []
    for gpu in gpus:
        name = str(gpu.get("name") or "GPU")
        vram = format_vram_mib(gpu.get("vram_mib"))
        parts.append(f"{name} {vram}" if vram else name)
    return " + ".join(parts)


def collect_environment() -> dict[str, object]:
    gpus = detect_gpus()
    return {
        "os_system": platform.system(),
        "os_release": platform.release(),
        "os_platform": platform.platform(),
        "machine": platform.machine(),
        "python": platform.python_version(),
        "cpu": _cpu_name(),
        "cpu_count_logical": os.cpu_count(),
        "ram_bytes": _ram_bytes(),
        "gpu": gpus,
        "gpu_short": format_gpu_short(gpus),
    }


_SECRET_MARKERS = ("KEY", "TOKEN", "SECRET", "PASSWORD", "AUTH")


def _redact_env(env: dict[str, str]) -> dict[str, str]:
    redacted: dict[str, str] = {}
    for key, value in env.items():
        if any(marker in key.upper() for marker in _SECRET_MARKERS):
            redacted[key] = "(非表示)"
        else:
            redacted[key] = value
    return redacted


def client_ollama_env() -> dict[str, str]:
    return _redact_env({key: value for key, value in os.environ.items() if key.startswith("OLLAMA_")})


def server_process_ollama_env() -> dict[str, object]:
    """Best-effort read of the running ollama process. Often invisible on Windows and macOS."""
    if platform.system() != "Linux" or not Path("/proc").exists():
        return {
            "values": None,
            "note": "Linux の /proc 以外では、サーバプロセスの環境変数は読んでいません。",
        }
    candidates: list[tuple[int, str]] = []
    for entry in os.listdir("/proc"):
        if not entry.isdigit():
            continue
        cmd_path = Path("/proc") / entry / "cmdline"
        try:
            raw = cmd_path.read_bytes()
        except OSError:
            continue
        command = raw.replace(b"\0", b" ").decode("utf-8", "replace").strip()
        if re.search(r"(^|[\s/])ollama(\s|$)", command):
            candidates.append((int(entry), command))
    if not candidates:
        return {
            "values": None,
            "note": "ollama プロセスが見つかりませんでした。別ユーザーやアプリ版だと見えないことがあります。",
        }
    candidates.sort(key=lambda item: (0 if "serve" in item[1] else 1, item[0]))
    pid, command = candidates[0]
    env_path = Path("/proc") / str(pid) / "environ"
    try:
        raw_env = env_path.read_bytes()
    except OSError as exc:
        return {
            "values": None,
            "pid": pid,
            "command": command,
            "note": f"pid {pid} の環境変数は読めませんでした（{exc}）。",
        }
    values: dict[str, str] = {}
    for item in raw_env.split(b"\0"):
        if b"=" not in item:
            continue
        key_b, value_b = item.split(b"=", 1)
        key = key_b.decode("utf-8", "replace")
        if key.startswith("OLLAMA_"):
            values[key] = value_b.decode("utf-8", "replace")
    return {
        "values": _redact_env(values),
        "pid": pid,
        "command": command,
        "note": None,
    }
