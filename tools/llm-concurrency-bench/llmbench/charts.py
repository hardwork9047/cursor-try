"""Draw measured series only. This module has no sample results."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

os.environ.setdefault("MPLBACKEND", "Agg")

FONT_CANDIDATES = (
    Path(__file__).resolve().parent.parent / "fonts" / "NotoSansJP-Medium.ttf",
)


def _system_font_files() -> list[Path]:
    system = __import__("platform").system()
    names: list[str] = []
    if system == "Windows":
        windir = os.environ.get("WINDIR", r"C:\Windows")
        fonts = Path(windir) / "Fonts"
        names = [
            "YuGothM.ttc",
            "YuGothR.ttc",
            "meiryo.ttc",
            "msgothic.ttc",
            "msmincho.ttc",
        ]
        return [fonts / name for name in names]
    if system == "Darwin":
        roots = [
            Path("/System/Library/Fonts"),
            Path("/Library/Fonts"),
            Path.home() / "Library/Fonts",
        ]
        patterns = ("Hiragino Sans", "Hiragino", "ヒラギノ")
        found: list[Path] = []
        for root in roots:
            if not root.exists():
                continue
            for path in root.rglob("*"):
                if path.suffix.lower() in {".ttf", ".ttc", ".otf"} and any(
                    token in path.name for token in patterns
                ):
                    found.append(path)
        return found
    roots = [
        Path("/usr/share/fonts"),
        Path("/usr/local/share/fonts"),
        Path.home() / ".fonts",
    ]
    preferred = (
        "NotoSansCJK",
        "NotoSansJP",
        "NotoSansCJKjp",
        "IPAGothic",
        "TakaoGothic",
        "wqy-microhei",
        "DroidSansFallback",
    )
    found = []
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.suffix.lower() not in {".ttf", ".ttc", ".otf"}:
                continue
            if any(token.lower() in path.name.lower() for token in preferred):
                found.append(path)
    return found


def _supports_japanese(path: Path) -> bool:
    from matplotlib.ft2font import FT2Font

    try:
        font = FT2Font(str(path))
    except Exception:
        return False
    needed = [ord(ch) for ch in "待ち行列仕掛品同時"]
    return all(font.get_char_index(code) != 0 for code in needed)


def resolve_japanese_font() -> Path:
    for path in list(FONT_CANDIDATES) + _system_font_files():
        if path.is_file() and _supports_japanese(path):
            return path
    raise RuntimeError(
        "日本語を描けるフォントが見つかりません。"
        "同梱の fonts/NotoSansJP-Medium.ttf があるか確認してください。"
    )


def _font(path: Path, size: float):
    from matplotlib.font_manager import FontProperties

    return FontProperties(fname=str(path), size=size)


def _apply_ticks(ax, font) -> None:
    for label in list(ax.get_xticklabels()) + list(ax.get_yticklabels()):
        label.set_fontproperties(font)


def _style_ax(ax) -> None:
    ax.set_facecolor("white")
    ax.yaxis.grid(True, linestyle="--", linewidth=0.6, color="#d5d5d5")
    ax.set_axisbelow(True)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#444444")
    ax.spines["bottom"].set_color("#444444")


def _short(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def _footer(meta: dict[str, str]) -> str:
    model = meta.get("model") or "model不明"
    quant = meta.get("quantization")
    model_bit = f"{model}（{quant}）" if quant else model
    return " / ".join(
        [
            _short(model_bit, 42),
            _short(meta.get("gpu") or "GPU不明", 36),
            _short(meta.get("backend") or "backend不明", 28),
            meta.get("date") or "",
        ]
    )


def _new_figure(title: str, subtitle: str, footer: str, font_path: Path):
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(12, 6.75), dpi=100)
    fig.patch.set_facecolor("white")
    fig.suptitle(title, fontproperties=_font(font_path, 22), color="#1a1a1a", y=0.97)
    if subtitle:
        fig.text(
            0.5,
            0.895,
            subtitle,
            ha="center",
            va="top",
            fontproperties=_font(font_path, 11),
            color="#333333",
            wrap=True,
        )
    fig.text(
        0.5,
        0.035,
        footer,
        ha="center",
        va="bottom",
        fontproperties=_font(font_path, 9),
        color="#444444",
    )
    fig.subplots_adjust(left=0.10, right=0.97, top=0.78, bottom=0.18)
    return fig, ax


def _save(fig, path: Path) -> None:
    fig.savefig(path, dpi=100, facecolor="white")
    import matplotlib.pyplot as plt

    plt.close(fig)


def render_charts(
    levels: list[dict[str, Any]],
    subtitle: str,
    footer_meta: dict[str, str],
    ttft_path: Path,
    throughput_path: Path,
) -> Path:
    from matplotlib.ticker import MaxNLocator

    from llmbench.stats import fmt_rate, fmt_seconds_compact

    font_path = resolve_japanese_font()
    footer = _footer(footer_meta)
    usable = [level for level in levels if not level.get("failed") and level.get("ttft_s")]
    usable.sort(key=lambda level: level["concurrency"])
    if not usable:
        raise RuntimeError("図に載せる成功した同時数がありません")

    xs = [str(level["concurrency"]) for level in usable]
    med = [level["ttft_s"]["median"] for level in usable]
    p95 = [level["ttft_s"]["p95"] for level in usable]
    mx = [level["ttft_s"]["max"] for level in usable]

    fig, ax = _new_figure("同時リクエスト数と待ち時間", subtitle, footer, font_path)
    _style_ax(ax)
    ax.plot(xs, med, color="#1f4e79", marker="o", linewidth=2.4, markersize=7, label="中央値")
    ax.plot(xs, p95, color="#e07a3d", marker="s", linewidth=1.8, linestyle="--", markersize=6, label="95%点")
    ax.plot(xs, mx, color="#b00020", marker="^", linewidth=1.8, linestyle=":", markersize=7, label="最大")
    label_font = _font(font_path, 10)
    for x, y in zip(xs, med):
        ax.annotate(
            fmt_seconds_compact(y),
            (x, y),
            textcoords="offset points",
            xytext=(0, 8),
            ha="center",
            fontproperties=label_font,
            color="#1f4e79",
        )
    peak = max(mx) if mx else 1
    ax.set_ylim(0, peak * 1.22 if peak > 0 else 1)
    ax.set_xlabel("同時リクエスト数", fontproperties=_font(font_path, 13))
    ax.set_ylabel("先頭トークンまでの時間（秒）", fontproperties=_font(font_path, 13))
    _apply_ticks(ax, _font(font_path, 11))
    legend = ax.legend(prop=_font(font_path, 11), frameon=True, edgecolor="#dddddd")
    legend.get_frame().set_linewidth(0.6)
    ax.yaxis.set_major_locator(MaxNLocator(nbins=6))
    _save(fig, ttft_path)

    thr_levels = [
        level
        for level in usable
        if (level.get("aggregate_throughput_tps") or {}).get("median") is not None
    ]
    fig, ax = _new_figure(
        "同時リクエスト数と合計スループット",
        "生成トークン合計 ÷ 最初の送信から最後の応答までの時間",
        footer,
        font_path,
    )
    _style_ax(ax)
    if thr_levels:
        xs = [str(level["concurrency"]) for level in thr_levels]
        med_thr = [level["aggregate_throughput_tps"]["median"] for level in thr_levels]
        ax.plot(xs, med_thr, color="#1f4e79", marker="o", linewidth=2.4, markersize=7, label="中央値")
        for level, x in zip(thr_levels, xs):
            for value in level.get("aggregate_throughput_per_wave") or []:
                ax.scatter([x], [value], color="#7aa0c4", s=28, zorder=2)
        ax.plot([], [], color="#7aa0c4", marker="o", linestyle="None", label="各回")
        for x, y in zip(xs, med_thr):
            ax.annotate(
                f"{fmt_rate(y)}",
                (x, y),
                textcoords="offset points",
                xytext=(0, 8),
                ha="center",
                fontproperties=label_font,
                color="#1f4e79",
            )
        peak = max(med_thr) if med_thr else 1
        per_wave_max = [
            value
            for level in thr_levels
            for value in (level.get("aggregate_throughput_per_wave") or [])
        ]
        if per_wave_max:
            peak = max(peak, max(per_wave_max))
        ax.set_ylim(0, peak * 1.22 if peak > 0 else 1)
    else:
        ax.text(
            0.5,
            0.5,
            "サーバが生成トークン数を返さなかったため、スループットは計算していません",
            ha="center",
            va="center",
            transform=ax.transAxes,
            fontproperties=_font(font_path, 12),
            color="#333333",
        )
    ax.set_xlabel("同時リクエスト数", fontproperties=_font(font_path, 13))
    ax.set_ylabel("合計スループット（トークン/秒）", fontproperties=_font(font_path, 13))
    _apply_ticks(ax, _font(font_path, 11))
    if thr_levels:
        legend = ax.legend(prop=_font(font_path, 11), frameon=True, edgecolor="#dddddd")
        legend.get_frame().set_linewidth(0.6)
    _save(fig, throughput_path)
    return font_path
