#!/usr/bin/env python3
"""One command: send 1, 2, 4, 8 simultaneous requests at a local LLM and chart the wait."""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

from llmbench.backends import autodetect, describe_server, list_model_ids, openai_base, ollama_base, probe
from llmbench.environment import client_ollama_env, collect_environment, server_process_ollama_env
from llmbench.prompts import QUESTION
from llmbench.runner import BenchRun

PROFILES = {
    "default": {
        "concurrency": (1, 2, 4, 8),
        "repeats": 3,
        "max_tokens": 512,
        "prompt_tokens": None,
    },
    "teksedge": {
        "concurrency": (1, 2, 4, 8),
        "repeats": 2,
        "max_tokens": 128,
        "prompt_tokens": 7500,
    },
}


def _configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def _parse_concurrency(text: str) -> list[int]:
    parts = [part.strip() for part in text.split(",") if part.strip()]
    if not parts:
        raise argparse.ArgumentTypeError("同時数を 1,2,4,8 のように指定してください")
    values: list[int] = []
    for part in parts:
        if not part.isdigit() or int(part) < 1:
            raise argparse.ArgumentTypeError(f"同時数は 1 以上の整数です: {part}")
        values.append(int(part))
    if len(values) != len(set(values)):
        raise argparse.ArgumentTypeError("同時数に同じ数が二度入っています")
    return values


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="bench.py",
        description=(
            "ローカルLLMへ同じ瞬間に複数のストリーミングリクエストを送り、"
            "先頭トークンまでの待ちと合計スループットを測る。"
            "図は実測だけから描く。"
        ),
    )
    parser.add_argument("--backend", choices=("ollama", "openai"), help="省略時は待受ポートから探す")
    parser.add_argument(
        "--base-url",
        help="Ollama は http://127.0.0.1:11434 、OpenAI互換は末尾 /v1 でも可",
    )
    parser.add_argument("--model", help="省略すると一覧を出して終了する")
    parser.add_argument(
        "--profile",
        choices=tuple(PROFILES),
        default="default",
        help="default: 短文・最大512トークン・3回。teksedge: 約7500トークン・最大128・2回",
    )
    parser.add_argument("--concurrency", type=_parse_concurrency, help="例: 1,2,4,8")
    parser.add_argument("--repeats", type=int, help="各同時数の繰り返し")
    parser.add_argument("--max-tokens", type=int, help="1リクエストの生成上限")
    parser.add_argument("--temperature", type=float, default=0.0, help="比較するなら 0 のまま")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--timeout", type=float, default=1800, help="チャンクが途切れてよい最大秒")
    parser.add_argument(
        "--prompt-tokens",
        type=int,
        help="目標の入力トークン数。0 で短文。teksedge の既定は 7500",
    )
    parser.add_argument("--prompt", help="質問文を差し替える。依頼IDは先頭に付く")
    parser.add_argument("--prompt-file", type=Path, help="質問文をファイルから読む")
    parser.add_argument("--api-key", help="OpenAI互換で必要なときだけ。未指定なら Authorization を付けない")
    parser.add_argument("--output-dir", type=Path, help="省略時は results/<UTC時刻>/")
    parser.add_argument("--list-models", action="store_true", help="モデル一覧だけ出して終了する")
    return parser


def _redact_argv(argv: list[str]) -> list[str]:
    redacted: list[str] = []
    skip = False
    for arg in argv:
        if skip:
            redacted.append("***")
            skip = False
            continue
        if arg == "--api-key":
            redacted.append(arg)
            skip = True
            continue
        if arg.startswith("--api-key="):
            redacted.append("--api-key=***")
            continue
        redacted.append(arg)
    return redacted


def _print_models(names: list[str]) -> None:
    if not names:
        print("モデル一覧は空でした。")
        return
    print("使えるモデル:")
    for name in names:
        print(f"  {name}")


async def _resolve_endpoint(args: argparse.Namespace) -> tuple[str, str] | None:
    if args.backend and args.base_url:
        base = ollama_base(args.base_url) if args.backend == "ollama" else openai_base(args.base_url)
        return args.backend, base
    if args.backend == "ollama":
        return "ollama", ollama_base(args.base_url or "http://127.0.0.1:11434")
    if args.backend == "openai" and args.base_url:
        return "openai", openai_base(args.base_url)
    found = await autodetect()
    if args.backend == "openai":
        found = [item for item in found if item["kind"] == "openai"]
    if not found:
        print("ローカルのLLMサーバが見つかりませんでした。")
        print("Ollama なら ollama serve のあと、次のように実行します。")
        print("  python bench.py --backend ollama --model <モデル名>")
        print("LM Studio / llama-server / vLLM なら --base-url を指定します。")
        print("  python bench.py --backend openai --base-url http://127.0.0.1:8080/v1 --model <モデル名>")
        return None
    chosen = found[0]
    print(f"検出しました: {chosen['kind']} {chosen['base_url']}", flush=True)
    if len(found) > 1:
        others = ", ".join(f"{item['kind']} {item['base_url']}" for item in found[1:])
        print(f"他にも応答がありました: {others}")
        print("使うものは --backend と --base-url で指定できます。")
    base = ollama_base(chosen["base_url"]) if chosen["kind"] == "ollama" else openai_base(chosen["base_url"])
    return chosen["kind"], base


async def _reachable(kind: str, base: str, api_key: str | None) -> str | None:
    url = base + ("/api/version" if kind == "ollama" else "/models")
    ok, status, body = await probe(url, timeout_s=3, api_key=api_key)
    if ok and status is not None and status < 400:
        return None
    if status == 401:
        return f"サーバが 401 を返しました（{url}）。--api-key が必要なことがあります。"
    if status is None:
        return (
            f"サーバに接続できませんでした: {url}\n"
            "Ollama ならアプリか `ollama serve` が動いているか確認してください。\n"
            "LM Studio / llama-server / vLLM なら --backend openai --base-url を確認してください。"
        )
    snippet = body.replace("\n", " ")[:200]
    return f"サーバが HTTP {status} を返しました: {url} {snippet}"


def _question(args: argparse.Namespace) -> str:
    if args.prompt and args.prompt_file:
        raise SystemExit("--prompt と --prompt-file は同時に指定できません。")
    if args.prompt_file:
        text = args.prompt_file.read_text(encoding="utf-8").strip()
        if not text:
            raise SystemExit("プロンプトファイルが空です。")
        return text
    if args.prompt:
        if not args.prompt.strip():
            raise SystemExit("--prompt が空です。")
        return args.prompt.strip()
    return QUESTION


async def _async_main(args: argparse.Namespace, argv: list[str]) -> int:
    resolved = await _resolve_endpoint(args)
    if resolved is None:
        return 1
    kind, base = resolved
    api_key = args.api_key or None
    problem = await _reachable(kind, base, api_key)
    if problem:
        print(problem)
        return 1
    try:
        names = await list_model_ids(kind, base, api_key)
    except httpx.HTTPError as exc:
        print(f"モデル一覧を取得できませんでした: {exc}")
        return 1
    if args.list_models or not args.model:
        _print_models(names)
        if args.list_models:
            return 0
        print("モデルが指定されていません。--model で上の名前を指定してください。")
        if names:
            print(f"例: python bench.py --backend {kind} --base-url {base} --model {names[0]}")
        return 2
    if names and args.model not in names:
        print(f"モデル {args.model} は一覧にありません。")
        _print_models(names)
        return 2

    profile = PROFILES[args.profile]
    concurrency = args.concurrency or list(profile["concurrency"])
    repeats = profile["repeats"] if args.repeats is None else args.repeats
    max_tokens = profile["max_tokens"] if args.max_tokens is None else args.max_tokens
    if args.prompt_tokens is None:
        prompt_tokens = profile["prompt_tokens"]
    elif args.prompt_tokens == 0:
        prompt_tokens = None
    else:
        prompt_tokens = args.prompt_tokens
    if repeats < 1 or max_tokens < 1 or args.timeout < 1:
        print("--repeats, --max-tokens, --timeout は 1 以上にしてください。")
        return 2
    if prompt_tokens is not None and prompt_tokens < 1:
        print("--prompt-tokens は 0（短文）か 1 以上です。")
        return 2
    if args.temperature != 0:
        print("注意: temperature が 0 ではありません。公開条件との比較には 0 を使ってください。")
    if args.profile == "teksedge":
        print(
            "teksedge プロファイルは入力を約7500トークンにします。"
            "27B を直列でさばくと、全体が数十分を超えることがあります。",
            flush=True,
        )

    output_dir = args.output_dir
    if output_dir is None:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        output_dir = Path("results") / stamp

    print(f"バックエンド: {kind} {base}", flush=True)
    print(f"モデル: {args.model}", flush=True)
    print(
        f"同時数: {','.join(str(value) for value in concurrency)} / 繰り返し: {repeats} / "
        f"最大トークン: {max_tokens} / temperature: {args.temperature}",
        flush=True,
    )
    print(f"出力先: {output_dir.resolve()}", flush=True)

    environment = collect_environment()
    server = await describe_server(kind, base, args.model, api_key)
    parallel = None
    if kind == "ollama":
        parallel = {
            "client_process": client_ollama_env(),
            "server_process": None,
            "server_process_note": None,
            "documentation": server.get("parallel_documentation"),
        }
        discovered = server_process_ollama_env()
        parallel["server_process"] = discovered.get("values")
        parallel["server_process_note"] = discovered.get("note")
        parallel["server_pid"] = discovered.get("pid")

    config = {
        "backend": kind,
        "base_url": base,
        "model": args.model,
        "concurrency": concurrency,
        "repeats": repeats,
        "max_tokens": max_tokens,
        "temperature": args.temperature,
        "seed": args.seed,
        "timeout": args.timeout,
        "profile": args.profile,
        "prompt_tokens": prompt_tokens,
        "question": _question(args),
        "api_key": api_key or None,
        "output_dir": output_dir,
        "argv": _redact_argv(argv),
        "ollama_parallel": parallel,
    }
    bench = BenchRun(config, environment, server)
    try:
        return await bench.execute()
    except KeyboardInterrupt:
        print("\n中断しました。", flush=True)
        return 130


def main(argv: list[str] | None = None) -> int:
    _configure_stdio()
    if sys.version_info < (3, 10):
        print("Python 3.10 以上が必要です。")
        return 1
    args = _parser().parse_args(argv)
    try:
        return asyncio.run(_async_main(args, list(sys.argv if argv is None else argv)))
    except KeyboardInterrupt:
        print("\n中断しました。", flush=True)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
