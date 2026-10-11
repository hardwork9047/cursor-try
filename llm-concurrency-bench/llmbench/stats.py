"""Percentiles and the queue / WIP reading. No sample measurements live here."""

from __future__ import annotations

import math
from typing import Any, Sequence


def percentile(values: Sequence[float], p: float) -> float:
    """Linear interpolation (NumPy's default, Hyndman-Fan type 7).

    p is in [0, 100]. One sample returns that sample, so with a single
    request the median, the 95th percentile, and the max are the same number.
    """
    if not values:
        raise ValueError("percentile of empty data")
    if p < 0 or p > 100:
        raise ValueError("p must be between 0 and 100")
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    rank = (len(ordered) - 1) * (p / 100.0)
    low = math.floor(rank)
    high = math.ceil(rank)
    if low == high:
        return float(ordered[low])
    weight = rank - low
    return float(ordered[low] * (1.0 - weight) + ordered[high] * weight)


def _finite(values: list[float | None]) -> list[float]:
    out: list[float] = []
    for value in values:
        if value is None:
            continue
        number = float(value)
        if math.isnan(number) or math.isinf(number):
            continue
        out.append(number)
    return out


def dist(values: list[float | None]) -> dict[str, float] | None:
    clean = _finite(values)
    if not clean:
        return None
    return {
        "min": percentile(clean, 0),
        "median": percentile(clean, 50),
        "p95": percentile(clean, 95),
        "max": percentile(clean, 100),
        "n": float(len(clean)),
    }


def fmt_seconds(value: float) -> str:
    if value >= 100:
        return f"{value:.0f} 秒"
    if value >= 10:
        return f"{value:.1f} 秒"
    return f"{value:.2f} 秒"


def fmt_seconds_compact(value: float) -> str:
    if value >= 100:
        return f"{value:.0f}秒"
    if value >= 10:
        return f"{value:.1f}秒"
    return f"{value:.2f}秒"


def fmt_rate(value: float) -> str:
    if value >= 100:
        return f"{value:.0f}"
    if value >= 10:
        return f"{value:.1f}"
    return f"{value:.2f}"


def summarize_level(concurrency: int, waves: list[dict[str, Any]]) -> dict[str, Any]:
    """waves are the attempts at this concurrency. A wave counts only if every request succeeded."""
    ok_waves = []
    failed_waves = 0
    for wave in waves:
        requests = wave.get("requests") or []
        if requests and all(item.get("ok") for item in requests):
            ok_waves.append(wave)
        else:
            failed_waves += 1
    if not ok_waves:
        errors = []
        for wave in waves:
            for item in wave.get("requests") or []:
                if item.get("error"):
                    errors.append(str(item["error"]))
        return {
            "concurrency": concurrency,
            "failed": True,
            "waves_ok": 0,
            "waves_failed": failed_waves,
            "error": errors[0] if errors else "成功した回がありません",
        }

    ttft: list[float | None] = []
    total: list[float | None] = []
    decode: list[float | None] = []
    prompt_tokens: list[float | None] = []
    throughputs: list[float] = []
    for wave in ok_waves:
        requests = wave["requests"]
        ttft.extend(item.get("ttft_s") for item in requests)
        total.extend(item.get("total_s") for item in requests)
        decode.extend(item.get("decode_tps") for item in requests)
        prompt_tokens.extend(item.get("prompt_tokens") for item in requests)
        if wave.get("aggregate_throughput_tps") is not None:
            throughputs.append(float(wave["aggregate_throughput_tps"]))
    throughput_dist = dist(throughputs) if throughputs else None
    return {
        "concurrency": concurrency,
        "failed": False,
        "waves_ok": len(ok_waves),
        "waves_failed": failed_waves,
        "requests": sum(len(wave["requests"]) for wave in ok_waves),
        "ttft_s": dist(ttft),
        "total_s": dist(total),
        "decode_tps": dist(decode),
        "prompt_tokens": dist(prompt_tokens),
        "aggregate_throughput_tps": throughput_dist,
        "aggregate_throughput_per_wave": throughputs,
    }


def _ratio(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator is None or denominator <= 0:
        return None
    return numerator / denominator


def interpret(levels: list[dict[str, Any]]) -> dict[str, Any]:
    """Describe the measured shape. Words 待ち行列 and 仕掛品 are used only when the ratios say so.

    待ち行列: max TTFT at the highest concurrency is at least twice the median
    TTFT at the lowest concurrency.
    仕掛品: concurrency grew, and aggregate throughput grew by less than 75% of
    that concurrency ratio (extra in-flight requests mostly waited).
    """
    usable = [level for level in levels if not level.get("failed")]
    if not usable:
        return {
            "labels": [],
            "text": "成功した同時数がないため、待ちの増え方は言えません。",
            "queue": False,
            "wip": False,
            "ratios": {},
        }
    if len(usable) == 1:
        only = usable[0]
        med = (only.get("ttft_s") or {}).get("median")
        text = "同時数が1段だけなので、待ちがどう伸びるかは比べられません。"
        if med is not None:
            text += f" 先頭トークン待ちの中央値は {fmt_seconds(med)} です。"
        return {
            "labels": [],
            "text": text,
            "queue": False,
            "wip": False,
            "ratios": {},
        }

    low = min(usable, key=lambda level: level["concurrency"])
    high = max(usable, key=lambda level: level["concurrency"])
    c1 = int(low["concurrency"])
    c_n = int(high["concurrency"])
    ttft_low = (low.get("ttft_s") or {}).get("median")
    ttft_high_med = (high.get("ttft_s") or {}).get("median")
    ttft_high_max = (high.get("ttft_s") or {}).get("max")
    thr_low = (low.get("aggregate_throughput_tps") or {}).get("median")
    thr_high = (high.get("aggregate_throughput_tps") or {}).get("median")
    dec_low = (low.get("decode_tps") or {}).get("median")
    dec_high = (high.get("decode_tps") or {}).get("median")

    wait_ratio = _ratio(ttft_high_max, ttft_low)
    med_wait_ratio = _ratio(ttft_high_med, ttft_low)
    thr_ratio = _ratio(thr_high, thr_low)
    conc_ratio = _ratio(float(c_n), float(c1))
    dec_ratio = _ratio(dec_high, dec_low)

    queue = wait_ratio is not None and wait_ratio >= 2.0
    wip = (
        conc_ratio is not None
        and conc_ratio >= 2.0
        and thr_ratio is not None
        and thr_ratio < conc_ratio * 0.75
    )

    labels: list[str] = []
    if queue and wait_ratio is not None:
        labels.append(
            f"待ち行列: 同時数{c_n}の最大待ちは同時数{c1}の中央値の {wait_ratio:.1f} 倍"
        )
    if wip and thr_ratio is not None and conc_ratio is not None:
        labels.append(
            f"仕掛品: 合計スループットは {thr_ratio:.1f} 倍（同時数は {conc_ratio:.0f} 倍）"
        )

    sentences: list[str] = []
    if ttft_low is not None and ttft_high_med is not None and ttft_high_max is not None:
        sentences.append(
            f"同時数 {c1} の先頭トークン待ちは中央値 {fmt_seconds(ttft_low)}、"
            f"同時数 {c_n} は中央値 {fmt_seconds(ttft_high_med)}、最大 {fmt_seconds(ttft_high_max)} です。"
        )
    if thr_low is not None and thr_high is not None and thr_ratio is not None and conc_ratio is not None:
        sentences.append(
            f"合計スループットは {fmt_rate(thr_low)} から {fmt_rate(thr_high)} トークン/秒"
            f"（{thr_ratio:.1f} 倍、同時数は {conc_ratio:.0f} 倍）です。"
        )
    if queue and wip:
        sentences.append(
            "待ち行列に近い形です。同時に積んだ分が処理能力にならず、空くまで待つ仕掛品になっています。"
        )
    elif queue:
        sentences.append("最大の待ちが伸びており、待ち行列に近い形です。")
    elif wip:
        sentences.append(
            "合計スループットは同時数ほど増えていません。積み増しの多くは仕掛品として残っています。"
        )
    elif (
        thr_ratio is not None
        and conc_ratio is not None
        and thr_ratio >= conc_ratio * 0.75
        and (med_wait_ratio is None or med_wait_ratio < 1.5)
    ):
        sentences.append("待ちはほとんど伸びず、同時に処理できています。")
    elif thr_ratio is not None and conc_ratio is not None and thr_ratio >= 1.5:
        sentences.append("合計スループットは増えています。待ちの伸びは上の秒数を見てください。")

    if dec_low is not None and dec_high is not None and dec_ratio is not None:
        if dec_ratio >= 0.75:
            sentences.append(
                f"1本あたりのデコード速度の中央値は {fmt_rate(dec_low)} から {fmt_rate(dec_high)} トークン/秒で、"
                "大きくは落ちていません。待ちの増え方は、生成が遅くなることとは別です。"
            )
        else:
            sentences.append(
                f"1本あたりのデコード速度の中央値は {fmt_rate(dec_low)} から {fmt_rate(dec_high)} トークン/秒に落ちています。"
                "スロットを分け合っている状態です。"
            )

    ratios = {
        "low_concurrency": c1,
        "high_concurrency": c_n,
        "wait_max_over_low_median": wait_ratio,
        "wait_median_ratio": med_wait_ratio,
        "throughput_ratio": thr_ratio,
        "concurrency_ratio": conc_ratio,
        "decode_ratio": dec_ratio,
    }
    return {
        "labels": labels,
        "text": "".join(sentences) if sentences else "比べられる数値がありません。",
        "queue": queue,
        "wip": wip,
        "ratios": ratios,
    }
