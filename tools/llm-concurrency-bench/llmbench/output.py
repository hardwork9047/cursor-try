"""JSON, CSV, and the Japanese end-of-run summary. Values come from the run."""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path
from typing import Any

from llmbench.stats import fmt_rate, fmt_seconds


def _round(value: Any) -> Any:
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return round(value, 6)
    if isinstance(value, dict):
        return {str(key): _round(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_round(item) for item in value]
    return value


def dump_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(_round(payload), ensure_ascii=False, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return ""
        text = f"{value:.6f}".rstrip("0").rstrip(".")
        return text
    return str(value)


def write_requests_csv(path: Path, waves: list[dict[str, Any]]) -> None:
    fields = [
        "同時数",
        "繰り返し",
        "番号",
        "依頼ID",
        "送信開始のずれ秒",
        "応答ヘッダ秒",
        "TTFT秒",
        "共通起点からのTTFT秒",
        "総時間秒",
        "入力トークン",
        "生成トークン",
        "トークン出典",
        "デコード速度",
        "デコード速度出典",
        "クライアントデコード速度",
        "サーバ読込秒",
        "先頭フィールド",
        "プレビュー",
        "エラー",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for wave in waves:
            for item in wave.get("requests") or []:
                writer.writerow(
                    {
                        "同時数": item.get("concurrency"),
                        "繰り返し": item.get("repeat_index"),
                        "番号": item.get("request_index"),
                        "依頼ID": item.get("request_id"),
                        "送信開始のずれ秒": _cell(item.get("release_skew_s")),
                        "応答ヘッダ秒": _cell(item.get("headers_s")),
                        "TTFT秒": _cell(item.get("ttft_s")),
                        "共通起点からのTTFT秒": _cell(item.get("ttft_from_release_s")),
                        "総時間秒": _cell(item.get("total_s")),
                        "入力トークン": _cell(item.get("prompt_tokens")),
                        "生成トークン": _cell(item.get("completion_tokens")),
                        "トークン出典": item.get("token_source") or "",
                        "デコード速度": _cell(item.get("decode_tps")),
                        "デコード速度出典": item.get("decode_tps_source") or "",
                        "クライアントデコード速度": _cell(item.get("decode_tps_client")),
                        "サーバ読込秒": _cell(item.get("server_load_s")),
                        "先頭フィールド": item.get("first_field") or "",
                        "プレビュー": item.get("output_preview") or "",
                        "エラー": item.get("error") or "",
                    }
                )


def write_summary_csv(path: Path, levels: list[dict[str, Any]]) -> None:
    fields = [
        "同時数",
        "成功リクエスト数",
        "成功回数",
        "失敗回数",
        "TTFT最小秒",
        "TTFT中央値秒",
        "TTFT95点秒",
        "TTFT最大秒",
        "総時間中央値秒",
        "デコード速度中央値",
        "合計スループット各回",
        "合計スループット中央値",
        "失敗",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for level in levels:
            ttft = level.get("ttft_s") or {}
            total = level.get("total_s") or {}
            decode = level.get("decode_tps") or {}
            thr = level.get("aggregate_throughput_tps") or {}
            per_wave = level.get("aggregate_throughput_per_wave") or []
            writer.writerow(
                {
                    "同時数": level.get("concurrency"),
                    "成功リクエスト数": level.get("requests") or 0,
                    "成功回数": level.get("waves_ok") or 0,
                    "失敗回数": level.get("waves_failed") or 0,
                    "TTFT最小秒": _cell(ttft.get("min")),
                    "TTFT中央値秒": _cell(ttft.get("median")),
                    "TTFT95点秒": _cell(ttft.get("p95")),
                    "TTFT最大秒": _cell(ttft.get("max")),
                    "総時間中央値秒": _cell(total.get("median")),
                    "デコード速度中央値": _cell(decode.get("median")),
                    "合計スループット各回": ";".join(_cell(value) for value in per_wave),
                    "合計スループット中央値": _cell(thr.get("median")),
                    "失敗": "yes" if level.get("failed") else "",
                }
            )


def render_summary(state: dict[str, Any]) -> str:
    config = state["config"]
    env = state["environment"]
    server = state["server"]
    lines: list[str] = ["----- 結果 -----"]
    quant = server.get("quantization")
    model_line = config["model"]
    if quant:
        model_line += f"（{quant}）"
    lines.append(f"モデル: {model_line}")
    version = server.get("version")
    backend = server.get("identified_as") or config["backend"]
    if version:
        lines.append(f"サーバ: {backend} {version}")
    else:
        lines.append(f"サーバ: {backend}")
    lines.append(f"GPU: {env.get('gpu_short') or 'GPU不明'}")
    cpu = env.get("cpu")
    if cpu:
        lines.append(f"CPU: {cpu}")
    lines.append(f"OS: {env.get('os_platform')}")
    lines.append("")
    load_s = state.get("model_load_s")
    warmup = state.get("warmup") or {}
    if load_s is not None:
        lines.append(f"サーバが報告したモデル読込: {fmt_seconds(load_s)}（本計測に含めない）")
    elif warmup.get("total_s") is not None:
        lines.append(
            f"ウォームアップ: {fmt_seconds(warmup['total_s'])}"
            "（読込と1回分の推論が混ざることがあります。本計測に含めない）"
        )
    if warmup.get("total_s") is not None and load_s is not None:
        lines.append(f"ウォームアップ全体: {fmt_seconds(warmup['total_s'])}（本計測に含めない）")
    lines.append("")
    lines.append("同時リクエスト数ごとの先頭トークン待ち:")
    small_n = False
    for level in state.get("levels") or []:
        if level.get("failed"):
            lines.append(
                f"  同時数 {level['concurrency']}: 失敗（{level.get('error') or '不明'}）"
            )
            continue
        ttft = level.get("ttft_s") or {}
        thr = (level.get("aggregate_throughput_tps") or {}).get("median")
        decode = (level.get("decode_tps") or {}).get("median")
        total = (level.get("total_s") or {}).get("median")
        n = int((ttft.get("n") or 0))
        if n < 8:
            small_n = True
        bits = [
            f"中央値 {fmt_seconds(ttft['median'])}",
            f"95%点 {fmt_seconds(ttft['p95'])}",
            f"最大 {fmt_seconds(ttft['max'])}",
        ]
        if total is not None:
            bits.append(f"総時間の中央値 {fmt_seconds(total)}")
        if thr is not None:
            bits.append(f"合計 {fmt_rate(thr)} トークン/秒")
        if decode is not None:
            bits.append(f"デコード中央値 {fmt_rate(decode)} トークン/秒")
        lines.append(f"  同時数 {level['concurrency']}（成功 {n} 本）: " + " / ".join(bits))
    lines.append("")
    interpretation = state.get("interpretation") or {}
    if interpretation.get("text"):
        lines.append(interpretation["text"])
    if small_n:
        lines.append(
            "標本が少ない同時数では、95%点は最大に近くなります。安定させるには --repeats を増やします。"
        )
    if config.get("backend") == "ollama":
        parallel = state.get("ollama_parallel") or {}
        shown = _shown_parallel(parallel)
        if shown:
            lines.append(f"OLLAMA_NUM_PARALLEL: {shown}")
        else:
            lines.append(
                "OLLAMA_NUM_PARALLEL: この実行からは読めませんでした。"
                "未設定時の既定は 1 で、待ち時間がほぼ本数に比例します。"
                "結果を比べるときはこの値を揃えてください。"
            )
    thinking = state.get("saw_thinking_first")
    if thinking:
        lines.append(
            "一部の応答は思考フィールドが先に来ました。thinking を切れていない可能性があります。"
        )
    prompt_note = state.get("prompt_token_note")
    if prompt_note:
        lines.append(prompt_note)
    lines.append("")
    artifacts = state.get("artifacts") or {}
    lines.append("出力:")
    for key in ("json", "requests_csv", "summary_csv", "summary_txt", "ttft_png", "throughput_png"):
        path = artifacts.get(key)
        if path:
            lines.append(f"  {path}")
    return "\n".join(lines) + "\n"


def _shown_parallel(parallel: dict[str, Any]) -> str | None:
    for source in ("server_process", "client_process"):
        values = parallel.get(source) or {}
        if isinstance(values, dict) and values.get("OLLAMA_NUM_PARALLEL"):
            return f"{values['OLLAMA_NUM_PARALLEL']}（{source}）"
    return None
