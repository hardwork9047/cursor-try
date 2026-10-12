"""Fire N streaming requests at one instant, then repeat. Preface calls are not plotted."""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from llmbench import __version__
from llmbench.backends import InferenceClient, StreamMetrics, ollama_ps
from llmbench.charts import render_charts
from llmbench.output import dump_json, render_summary, write_requests_csv, write_summary_csv
from llmbench.prompts import build_prompt, filler_repeats_for, prompt_sha256
from llmbench.stats import interpret, percentile, summarize_level

METHODOLOGY = {
    "temperature": "指定値。比較用の既定は 0。",
    "simultaneous": "同じ回のリクエストは、共通の開始時刻まで待ってから同時に送る。",
    "ttft": "そのリクエストの送信開始から、ストリームの最初の非空トークンまで。キューで待った時間も含まれる。",
    "total": "送信開始からストリームが終わるまで。",
    "decode_tps": "Ollama が eval_duration を返したときは eval_count / eval_duration。無いときは (生成トークン-1)/(総時間-TTFT)。",
    "aggregate_throughput": "その回の生成トークン合計を、最初の送信から最後の応答までの秒で割る。待ちと入力処理を含む。",
    "unique_prefix": "各プロンプトの先頭に一意の依頼IDを付け、プレフィックスキャッシュで入力処理が消えるのを防ぐ。",
    "warmup": "計測の前に送る。レベル集計と図には入れない。",
    "percentile": "線形補間（type 7）。標本が1件なら中央値・95%点・最大は同じ値。",
    "not_this_test": "8本の処理中に、後から1本のチャットを割り込ませる試験ではない。",
    "chart": "図は成功した実測だけを描く。サンプル数値は持っていない。",
}


def _prompt_tokens(record: dict[str, Any]) -> int | None:
    """Server-reported prompt length. A 200 with counts counts even if no text was streamed."""
    if record.get("http_status") != 200:
        return None
    value = record.get("prompt_tokens")
    if isinstance(value, int) and value >= 0:
        return value
    return None


def _metrics_dict(
    metrics: StreamMetrics,
    *,
    concurrency: int | None,
    repeat_index: int | None,
    request_index: int | None,
    request_id: str,
    release_skew_s: float | None,
) -> dict[str, Any]:
    ttft_from_release = None
    if metrics.ttft_s is not None and release_skew_s is not None:
        ttft_from_release = release_skew_s + metrics.ttft_s
    data = metrics.as_dict()
    data.update(
        {
            "concurrency": concurrency,
            "repeat_index": repeat_index,
            "request_index": request_index,
            "request_id": request_id,
            "release_skew_s": release_skew_s,
            "ttft_from_release_s": ttft_from_release,
        }
    )
    return data


def _wave_throughput(requests: list[dict[str, Any]]) -> float | None:
    if not requests or not all(item.get("ok") for item in requests):
        return None
    if any(item.get("completion_tokens") is None for item in requests):
        return None
    ends = []
    starts = []
    for item in requests:
        skew = item.get("release_skew_s")
        total = item.get("total_s")
        if skew is None or total is None:
            return None
        starts.append(float(skew))
        ends.append(float(skew) + float(total))
    wall = max(ends) - min(starts)
    if wall <= 0:
        return None
    tokens = sum(int(item["completion_tokens"]) for item in requests)
    return tokens / wall


class BenchRun:
    def __init__(self, config: dict[str, Any], environment: dict[str, Any], server: dict[str, Any]) -> None:
        self.config = config
        self.environment = environment
        self.server = server
        self.started = datetime.now().astimezone()
        self.run_id = self.started.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self.output_dir = Path(config["output_dir"])
        self.preface: list[dict[str, Any]] = []
        self.waves: list[dict[str, Any]] = []
        self.levels: list[dict[str, Any]] = []
        self.finished = False
        self.interrupted = False
        self.prompt_token_note: str | None = None
        self.filler_repeats = 0
        self.question = config["question"]
        self.font_path: str | None = None
        self.saw_thinking_first = False

    def _client(self) -> InferenceClient:
        return InferenceClient(
            kind=self.config["backend"],
            base_url=self.config["base_url"],
            model=self.config["model"],
            timeout_s=self.config["timeout"],
            api_key=self.config.get("api_key"),
            temperature=self.config["temperature"],
            max_tokens=self.config["max_tokens"],
            seed=self.config["seed"],
            max_connections=max(self.config["concurrency"]) + 4,
        )

    async def execute(self) -> int:
        client = self._client()
        try:
            target = self.config.get("prompt_tokens")
            if target:
                await self._calibrate(client, int(target))
            warmup = await self._preface_request(client, "warmup", self.config["max_tokens"])
            if not warmup["ok"]:
                self._print_failure(warmup)
                self.publish(chart=False)
                return 1
            self._note_thinking(warmup)
            wall = warmup.get("total_s")
            wall_bit = f"{wall:.2f} 秒" if isinstance(wall, (int, float)) else "時間不明"
            load_bit = ""
            if isinstance(warmup.get("server_load_s"), (int, float)):
                load_bit = f"（サーバ報告の読込 {warmup['server_load_s']:.2f} 秒）"
            print(f"ウォームアップ完了: {wall_bit}{load_bit}。この時間は図に入れません。", flush=True)
            if self.config["backend"] == "ollama":
                self.server["ollama_ps_after_warmup"] = await ollama_ps(self.config["base_url"])
            for concurrency in self.config["concurrency"]:
                for repeat_index in range(1, self.config["repeats"] + 1):
                    print(
                        f"同時数 {concurrency}  繰り返し {repeat_index}/{self.config['repeats']}  "
                        f"{concurrency} 本を同時に送信",
                        flush=True,
                    )
                    wave = await self._wave(client, concurrency, repeat_index)
                    self.waves.append(wave)
                    self._print_wave(wave)
                    self._rebuild_levels()
                    self.publish(chart=True)
            self.finished = True
            self.publish(chart=True)
            print(render_summary(self.snapshot()), flush=True)
            if not any(not level.get("failed") for level in self.levels):
                return 1
            if any(level.get("failed") for level in self.levels):
                return 1
            return 0
        except KeyboardInterrupt:
            self.interrupted = True
            print("\n中断しました。成功した同時数だけ保存します。", flush=True)
            self._rebuild_levels()
            self.publish(chart=True)
            if self.levels:
                print(render_summary(self.snapshot()), flush=True)
            return 130
        finally:
            await client.aclose()

    async def _calibrate(self, client: InferenceClient, target: int) -> None:
        saved = client.max_tokens
        client.max_tokens = 8
        try:
            overhead = await self._preface_request(client, "calibration_overhead", 8)
            unit = await self._preface_request(client, "calibration_one_repeat", 8, filler_repeats=1)
        finally:
            client.max_tokens = saved
        overhead_tokens = _prompt_tokens(overhead)
        unit_tokens = _prompt_tokens(unit)
        if overhead_tokens is None or unit_tokens is None:
            self.filler_repeats = 0
            self.prompt_token_note = (
                f"入力トークン数をサーバが返さなかったため、目標 {target} にはせず短文のまま送ります。"
            )
            print(self.prompt_token_note, flush=True)
            return
        per = unit_tokens - overhead_tokens
        if per <= 0:
            self.filler_repeats = 0
            self.prompt_token_note = (
                f"フィラーを足しても入力トークンが増えなかったため、目標 {target} にはせず短文のまま送ります。"
                f"（短い依頼 {overhead_tokens}、フィラー1回 {unit_tokens}）"
            )
            print(self.prompt_token_note, flush=True)
            return
        self.filler_repeats = filler_repeats_for(target, overhead_tokens, per)
        print(
            f"入力の目標 {target} トークン。短い依頼は {overhead_tokens}、"
            f"フィラー1回で {unit_tokens}。フィラー {self.filler_repeats} 回にします。",
            flush=True,
        )

    async def _preface_request(
        self,
        client: InferenceClient,
        role: str,
        max_tokens: int,
        filler_repeats: int | None = None,
    ) -> dict[str, Any]:
        repeats = self.filler_repeats if filler_repeats is None else filler_repeats
        request_id = f"{self.run_id}-{role}"
        prompt = build_prompt(request_id, repeats, self.question)
        previous = client.max_tokens
        client.max_tokens = max_tokens
        try:
            if client.locked:
                metrics = await client.request(prompt)
            else:
                metrics = await client.negotiate(prompt)
        finally:
            client.max_tokens = previous
        record = _metrics_dict(
            metrics,
            concurrency=None,
            repeat_index=None,
            request_index=None,
            request_id=request_id,
            release_skew_s=0.0,
        )
        record["role"] = role
        record["filler_repeats"] = repeats
        record["prompt_sha256"] = prompt_sha256(prompt)
        record["prompt_chars"] = len(prompt)
        self.config["payload_variant"] = metrics.variant
        if role == "warmup":
            record["prompt_example"] = prompt
        self.preface.append(record)
        self._note_thinking(record)
        return record

    async def _wave(self, client: InferenceClient, concurrency: int, repeat_index: int) -> dict[str, Any]:
        start_at = time.perf_counter() + 0.3

        async def one(index: int) -> dict[str, Any]:
            while time.perf_counter() < start_at:
                await asyncio.sleep(0)
            called = time.perf_counter()
            request_id = f"{self.run_id}-c{concurrency}-r{repeat_index}-i{index}"
            prompt = build_prompt(request_id, self.filler_repeats, self.question)
            metrics = await client.request(prompt)
            record = _metrics_dict(
                metrics,
                concurrency=concurrency,
                repeat_index=repeat_index,
                request_index=index,
                request_id=request_id,
                release_skew_s=called - start_at,
            )
            self._note_thinking(record)
            if record["ok"]:
                ttft = record["ttft_s"]
                total = record["total_s"]
                tokens = record["completion_tokens"]
                token_bit = f"{tokens} トークン" if tokens is not None else "トークン数なし"
                print(
                    f"    リクエスト {index + 1}/{concurrency}  待ち {ttft:.2f} 秒  "
                    f"総時間 {total:.2f} 秒  生成 {token_bit}",
                    flush=True,
                )
            else:
                print(
                    f"    リクエスト {index + 1}/{concurrency}  失敗: {record['error']}",
                    flush=True,
                )
            return record

        requests = list(await asyncio.gather(*(one(index) for index in range(concurrency))))
        skews = [float(item["release_skew_s"]) for item in requests if item.get("release_skew_s") is not None]
        release_skew_s = (max(skews) - min(skews)) if skews else None
        throughput = _wave_throughput(requests)
        if release_skew_s is not None and release_skew_s > 0.05:
            print(
                f"    注意: 送信開始のずれが {release_skew_s:.3f} 秒ありました。",
                flush=True,
            )
        return {
            "concurrency": concurrency,
            "repeat_index": repeat_index,
            "release_skew_span_s": release_skew_s,
            "aggregate_throughput_tps": throughput,
            "requests": requests,
        }

    def _note_thinking(self, record: dict[str, Any]) -> None:
        if record.get("first_field") == "thinking":
            self.saw_thinking_first = True

    def _print_wave(self, wave: dict[str, Any]) -> None:
        ok = [item for item in wave["requests"] if item.get("ok") and item.get("ttft_s") is not None]
        if len(ok) != len(wave["requests"]):
            return
        ttfts = [float(item["ttft_s"]) for item in ok]
        mid = percentile(ttfts, 50)
        thr = wave.get("aggregate_throughput_tps")
        thr_bit = f" / 合計 {thr:.2f} トークン/秒" if thr is not None else ""
        print(
            f"  この回の待ち 中央値 {mid:.2f} 秒 / 最大 {max(ttfts):.2f} 秒{thr_bit}",
            flush=True,
        )

    def _print_failure(self, record: dict[str, Any]) -> None:
        print(f"ウォームアップに失敗しました: {record.get('error')}", flush=True)
        print("サーバが起動しているか、モデル名が載っているかを確認してください。", flush=True)

    def _rebuild_levels(self) -> None:
        grouped: dict[int, list[dict[str, Any]]] = {}
        for wave in self.waves:
            grouped.setdefault(int(wave["concurrency"]), []).append(wave)
        self.levels = [summarize_level(concurrency, grouped[concurrency]) for concurrency in grouped]

    def _load_seconds(self) -> float | None:
        loads = [
            float(item["server_load_s"])
            for item in self.preface
            if item.get("server_load_s") is not None
        ]
        if not loads:
            return None
        return max(loads)

    def _check_prompt_target(self) -> None:
        target = self.config.get("prompt_tokens")
        warmup = next((item for item in self.preface if item.get("role") == "warmup"), None)
        if not target or not warmup or warmup.get("prompt_tokens") is None:
            return
        actual = int(warmup["prompt_tokens"])
        if actual <= 0:
            return
        error = abs(actual - int(target)) / int(target)
        self.prompt_token_note = (
            f"入力トークンの目標は {target}、ウォームアップの実測は {actual} です。"
        )
        if error > 0.2:
            self.prompt_token_note += " 目標から 20% 以上ずれています。図の条件を読むときは実測を使ってください。"

    def snapshot(self) -> dict[str, Any]:
        self._check_prompt_target()
        warmup = next((item for item in self.preface if item.get("role") == "warmup"), None)
        interpretation = interpret([level for level in self.levels if not level.get("failed")])
        artifacts = {
            "json": str(self.output_dir / "results.json"),
            "requests_csv": str(self.output_dir / "requests.csv"),
            "summary_csv": str(self.output_dir / "summary.csv"),
            "summary_txt": str(self.output_dir / "summary.txt"),
            "ttft_png": str(self.output_dir / "ttft.png"),
            "throughput_png": str(self.output_dir / "throughput.png"),
        }
        parallel = self.config.get("ollama_parallel")
        return {
            "schema_version": 1,
            "bench_version": __version__,
            "finished": self.finished,
            "interrupted": self.interrupted,
            "started_at": self.started.isoformat(timespec="seconds"),
            "timezone": str(self.started.tzinfo),
            "argv": self.config.get("argv"),
            "methodology": METHODOLOGY,
            "config": {
                "backend": self.config["backend"],
                "base_url": self.config["base_url"],
                "model": self.config["model"],
                "concurrency": self.config["concurrency"],
                "repeats": self.config["repeats"],
                "max_tokens": self.config["max_tokens"],
                "temperature": self.config["temperature"],
                "seed": self.config["seed"],
                "timeout_s": self.config["timeout"],
                "profile": self.config["profile"],
                "prompt_tokens_target": self.config.get("prompt_tokens"),
                "filler_repeats": self.filler_repeats,
                "question_sha256": prompt_sha256(self.question),
                "payload_variant": self.config.get("payload_variant"),
            },
            "environment": self.environment,
            "server": self.server,
            "ollama_parallel": parallel,
            "preface": self.preface,
            "model_load_s": self._load_seconds(),
            "warmup": warmup,
            "waves": self.waves,
            "levels": self.levels,
            "interpretation": interpretation,
            "prompt_token_note": self.prompt_token_note,
            "saw_thinking_first": self.saw_thinking_first,
            "font": self.font_path,
            "artifacts": artifacts,
        }

    def publish(self, chart: bool) -> None:
        self.output_dir.mkdir(parents=True, exist_ok=True)
        state = self.snapshot()
        if self.config.get("payload_variant") is None and self.preface:
            state["config"]["payload_variant"] = self.preface[-1].get("variant")
        dump_json(self.output_dir / "results.json", state)
        write_requests_csv(self.output_dir / "requests.csv", self.waves)
        write_summary_csv(self.output_dir / "summary.csv", self.levels)
        successful = [level for level in self.levels if not level.get("failed") and level.get("ttft_s")]
        if chart and successful:
            labels = (state.get("interpretation") or {}).get("labels") or []
            subtitle = "　".join(labels) if labels else "先頭トークンまでの時間（中央値・95%点・最大）"
            failed = [level for level in self.levels if level.get("failed")]
            if failed:
                skipped = ",".join(str(level["concurrency"]) for level in failed)
                subtitle = f"{subtitle}　失敗した同時数 {skipped} は載せていない"
            quant = self.server.get("quantization")
            version = self.server.get("version")
            identified = self.server.get("identified_as") or self.config["backend"]
            backend = f"{identified} {version}".strip() if version else str(identified)
            font = render_charts(
                self.levels,
                subtitle=subtitle,
                footer_meta={
                    "model": self.config["model"],
                    "quantization": quant or "",
                    "gpu": self.environment.get("gpu_short") or "GPU不明",
                    "backend": backend,
                    "date": self.started.date().isoformat(),
                },
                ttft_path=self.output_dir / "ttft.png",
                throughput_path=self.output_dir / "throughput.png",
            )
            self.font_path = str(font)
            state = self.snapshot()
            state["config"]["payload_variant"] = self.preface[-1].get("variant") if self.preface else None
            dump_json(self.output_dir / "results.json", state)
        elif chart:
            for name in ("ttft.png", "throughput.png"):
                path = self.output_dir / name
                if path.exists():
                    path.unlink()
        summary = render_summary(self.snapshot())
        (self.output_dir / "summary.txt").write_text(summary, encoding="utf-8")
