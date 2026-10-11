"""Ollama native API and OpenAI-compatible streaming. Timing starts at send."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable
from urllib.parse import urlparse, urlunparse

import httpx

OLLAMA_PARALLEL_DOC = (
    "Ollama の OLLAMA_NUM_PARALLEL は、1つのモデルが同時に処理するリクエスト数です。"
    "公式ドキュメントの既定は 1 です。1 のときは余ったリクエストが順番待ちになり、"
    "同時数を増やすと先頭トークンまでの時間が伸びます。"
    "古い版は空きメモリを見て 1 か 4 を選ぶことがありました。"
    "プロセスの環境変数が空でも、実効値が 1 とは限りません。"
    "結果を人と比べるときは、この値とコンテキスト長を揃えてください。"
    "変えたあとはサーバを再起動し、モデルをロードし直してください。"
)


def strip_trailing_slash(url: str) -> str:
    return url.strip().rstrip("/")


def openai_base(url: str) -> str:
    base = strip_trailing_slash(url)
    if base.endswith("/v1"):
        return base
    return base + "/v1"


def ollama_base(url: str) -> str:
    base = strip_trailing_slash(url)
    if base.endswith("/v1"):
        return base[: -len("/v1")]
    return base


def origin_of(url: str) -> str:
    parsed = urlparse(url)
    return urlunparse((parsed.scheme, parsed.netloc, "", "", "", ""))


def _ns_to_s(value: object) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value) / 1_000_000_000.0
    return None


def _as_int(value: object) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


@dataclass
class StreamAccum:
    parts: list[str] = field(default_factory=list)
    first_field: str | None = None
    saw_token: bool = False
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    token_source: str | None = None
    load_s: float | None = None
    prompt_eval_s: float | None = None
    eval_s: float | None = None
    server_total_s: float | None = None
    error: str | None = None

    def add_text(self, field_name: str, text: str) -> None:
        if not text:
            return
        if not self.saw_token:
            self.saw_token = True
            self.first_field = field_name
        if sum(len(part) for part in self.parts) < 120:
            self.parts.append(text)

    @property
    def preview(self) -> str:
        text = "".join(self.parts).replace("\n", " ").strip()
        if len(text) > 80:
            return text[:80]
        return text


def consume_ollama_obj(acc: StreamAccum, obj: dict[str, Any]) -> None:
    if isinstance(obj.get("error"), str) and obj.get("error"):
        acc.error = obj["error"]
    message = obj.get("message") if isinstance(obj.get("message"), dict) else {}
    content = message.get("content") if isinstance(message, dict) else None
    thinking = message.get("thinking") if isinstance(message, dict) else None
    if isinstance(content, str) and content:
        acc.add_text("content", content)
    elif isinstance(thinking, str) and thinking:
        acc.add_text("thinking", thinking)
    if obj.get("done") is True:
        prompt_tokens = _as_int(obj.get("prompt_eval_count"))
        eval_count = _as_int(obj.get("eval_count"))
        if prompt_tokens is not None:
            acc.prompt_tokens = prompt_tokens
        if eval_count is not None:
            acc.completion_tokens = eval_count
            acc.token_source = "ollama_eval_count"
        acc.load_s = _ns_to_s(obj.get("load_duration"))
        acc.prompt_eval_s = _ns_to_s(obj.get("prompt_eval_duration"))
        acc.eval_s = _ns_to_s(obj.get("eval_duration"))
        acc.server_total_s = _ns_to_s(obj.get("total_duration"))


def consume_openai_obj(acc: StreamAccum, obj: dict[str, Any]) -> None:
    error = obj.get("error")
    if isinstance(error, dict) and error.get("message"):
        acc.error = str(error.get("message"))
    elif isinstance(error, str) and error:
        acc.error = error
    choices = obj.get("choices")
    if isinstance(choices, list) and choices:
        delta = choices[0].get("delta") if isinstance(choices[0], dict) else None
        if isinstance(delta, dict):
            for key in ("content", "reasoning_content", "reasoning", "thinking"):
                value = delta.get(key)
                if isinstance(value, str) and value:
                    acc.add_text("content" if key == "content" else "thinking", value)
                    break
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        if isinstance(message, dict) and not acc.saw_token:
            content = message.get("content")
            if isinstance(content, str) and content:
                acc.add_text("content", content)
    usage = obj.get("usage") if isinstance(obj.get("usage"), dict) else None
    if usage:
        prompt_tokens = _as_int(usage.get("prompt_tokens"))
        completion_tokens = _as_int(usage.get("completion_tokens"))
        if prompt_tokens is not None:
            acc.prompt_tokens = prompt_tokens
        if completion_tokens is not None:
            acc.completion_tokens = completion_tokens
            acc.token_source = "openai_usage"


def client_decode_tps(
    completion_tokens: int | None, ttft_s: float | None, total_s: float | None
) -> float | None:
    if completion_tokens is None or ttft_s is None or total_s is None:
        return None
    window = total_s - ttft_s
    if completion_tokens >= 2 and window > 1e-6:
        return (completion_tokens - 1) / window
    return None


def preferred_decode_tps(
    acc: StreamAccum, client_tps: float | None
) -> tuple[float | None, str | None]:
    if (
        acc.completion_tokens is not None
        and acc.eval_s is not None
        and acc.eval_s > 0
        and acc.token_source == "ollama_eval_count"
    ):
        return acc.completion_tokens / acc.eval_s, "ollama_eval_duration"
    if client_tps is not None:
        return client_tps, "client_after_first_token"
    return None, None


@dataclass
class StreamMetrics:
    ok: bool
    error: str | None = None
    http_status: int | None = None
    ttft_s: float | None = None
    total_s: float | None = None
    headers_s: float | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    token_source: str | None = None
    decode_tps: float | None = None
    decode_tps_source: str | None = None
    decode_tps_client: float | None = None
    server_load_s: float | None = None
    server_prompt_eval_s: float | None = None
    server_eval_s: float | None = None
    server_total_s: float | None = None
    first_field: str | None = None
    output_preview: str = ""
    variant: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "error": self.error,
            "http_status": self.http_status,
            "ttft_s": self.ttft_s,
            "total_s": self.total_s,
            "headers_s": self.headers_s,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "token_source": self.token_source,
            "decode_tps": self.decode_tps,
            "decode_tps_source": self.decode_tps_source,
            "decode_tps_client": self.decode_tps_client,
            "server_load_s": self.server_load_s,
            "server_prompt_eval_s": self.server_prompt_eval_s,
            "server_eval_s": self.server_eval_s,
            "server_total_s": self.server_total_s,
            "first_field": self.first_field,
            "output_preview": self.output_preview,
            "variant": self.variant,
        }


def _truncate(text: str, limit: int = 500) -> str:
    text = text.replace("\n", " ").strip()
    if len(text) <= limit:
        return text
    return text[:limit] + "…"


PayloadBuilder = Callable[[str], dict[str, Any]]


class InferenceClient:
    def __init__(
        self,
        kind: str,
        base_url: str,
        model: str,
        timeout_s: float,
        api_key: str | None,
        temperature: float,
        max_tokens: int,
        seed: int,
        max_connections: int,
    ) -> None:
        self.kind = kind
        self.base_url = ollama_base(base_url) if kind == "ollama" else openai_base(base_url)
        self.model = model
        self.timeout_s = timeout_s
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.seed = seed
        self.variant = "ollama_think_off" if kind == "ollama" else "openai_full"
        self.locked = False
        headers = {"User-Agent": "llm-concurrency-bench/1.0"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        self.http = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=timeout_s, write=30.0, pool=10.0),
            limits=httpx.Limits(
                max_connections=max(8, max_connections),
                max_keepalive_connections=max(8, max_connections),
            ),
            headers=headers,
            trust_env=False,
        )

    async def aclose(self) -> None:
        await self.http.aclose()

    def build_payload(self, prompt: str) -> dict[str, Any]:
        messages = [{"role": "user", "content": prompt}]
        if self.kind == "ollama":
            body: dict[str, Any] = {
                "model": self.model,
                "messages": messages,
                "stream": True,
                "options": {
                    "temperature": self.temperature,
                    "num_predict": self.max_tokens,
                    "seed": self.seed,
                },
            }
            if self.variant == "ollama_think_off":
                body["think"] = False
            return body
        if self.variant == "openai_max_completion_tokens":
            return {
                "model": self.model,
                "messages": messages,
                "stream": True,
                "temperature": self.temperature,
                "max_completion_tokens": self.max_tokens,
            }
        body = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }
        if self.variant == "openai_full":
            body["seed"] = self.seed
            body["stream_options"] = {"include_usage": True}
            body["chat_template_kwargs"] = {"enable_thinking": False}
        elif self.variant == "openai_no_template":
            body["seed"] = self.seed
            body["stream_options"] = {"include_usage": True}
        return body

    def _variants(self) -> list[str]:
        if self.kind == "ollama":
            return ["ollama_think_off", "ollama_basic"]
        return [
            "openai_full",
            "openai_no_template",
            "openai_minimal",
            "openai_max_completion_tokens",
        ]

    async def negotiate(self, prompt: str) -> StreamMetrics:
        last: StreamMetrics | None = None
        for variant in self._variants():
            self.variant = variant
            result = await self.request(prompt)
            last = result
            if result.ok:
                self.locked = True
                return result
            if result.http_status != 400:
                self.locked = True
                return result
        self.locked = True
        assert last is not None
        return last

    async def request(self, prompt: str) -> StreamMetrics:
        payload = self.build_payload(prompt)
        if self.kind == "ollama":
            url = self.base_url + "/api/chat"
            return await self._stream(url, payload, consume_ollama_obj, ollama=True)
        url = self.base_url + "/chat/completions"
        return await self._stream(url, payload, consume_openai_obj, ollama=False)

    async def _stream(
        self,
        url: str,
        payload: dict[str, Any],
        consume: Callable[[StreamAccum, dict[str, Any]], None],
        ollama: bool,
    ) -> StreamMetrics:
        acc = StreamAccum()
        t0 = time.perf_counter()
        first_t: float | None = None
        headers_s: float | None = None
        status: int | None = None
        try:
            async with self.http.stream("POST", url, json=payload) as response:
                headers_s = time.perf_counter() - t0
                status = response.status_code
                if response.status_code >= 400:
                    body = (await response.aread()).decode("utf-8", "replace")
                    return StreamMetrics(
                        ok=False,
                        error=_truncate(body) or f"HTTP {response.status_code}",
                        http_status=response.status_code,
                        headers_s=headers_s,
                        variant=self.variant,
                    )
                async for line in response.aiter_lines():
                    now = time.perf_counter()
                    stripped = line.strip()
                    if not stripped or stripped.startswith(":"):
                        continue
                    data = stripped
                    if not ollama and stripped.startswith("data:"):
                        data = stripped[5:].strip()
                        if data == "[DONE]":
                            break
                    if not data:
                        continue
                    try:
                        import json

                        obj = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    if not isinstance(obj, dict):
                        continue
                    before = acc.saw_token
                    consume(acc, obj)
                    if acc.saw_token and not before:
                        first_t = now
                    if acc.error and not acc.saw_token:
                        break
            total_s = time.perf_counter() - t0
        except httpx.TimeoutException:
            return StreamMetrics(
                ok=False,
                error=f"タイムアウト（{self.timeout_s:.0f} 秒までに次のチャンクが来ませんでした）",
                http_status=status,
                headers_s=headers_s,
                variant=self.variant,
            )
        except httpx.HTTPError as exc:
            return StreamMetrics(
                ok=False,
                error=_truncate(str(exc)),
                http_status=status,
                headers_s=headers_s,
                variant=self.variant,
            )

        if acc.error and not acc.saw_token:
            return StreamMetrics(
                ok=False,
                error=_truncate(acc.error),
                http_status=status,
                headers_s=headers_s,
                total_s=total_s,
                variant=self.variant,
            )
        if not acc.saw_token:
            return StreamMetrics(
                ok=False,
                error="応答にトークンがありませんでした",
                http_status=status,
                headers_s=headers_s,
                total_s=total_s,
                prompt_tokens=acc.prompt_tokens,
                completion_tokens=acc.completion_tokens,
                token_source=acc.token_source,
                server_load_s=acc.load_s,
                server_prompt_eval_s=acc.prompt_eval_s,
                server_eval_s=acc.eval_s,
                variant=self.variant,
            )
        assert first_t is not None
        ttft_s = first_t - t0
        client_tps = client_decode_tps(acc.completion_tokens, ttft_s, total_s)
        decode_tps, decode_source = preferred_decode_tps(acc, client_tps)
        return StreamMetrics(
            ok=True,
            http_status=status,
            ttft_s=ttft_s,
            total_s=total_s,
            headers_s=headers_s,
            prompt_tokens=acc.prompt_tokens,
            completion_tokens=acc.completion_tokens,
            token_source=acc.token_source,
            decode_tps=decode_tps,
            decode_tps_source=decode_source,
            decode_tps_client=client_tps,
            server_load_s=acc.load_s,
            server_prompt_eval_s=acc.prompt_eval_s,
            server_eval_s=acc.eval_s,
            server_total_s=acc.server_total_s,
            first_field=acc.first_field,
            output_preview=acc.preview,
            variant=self.variant,
        )


def auth_headers(api_key: str | None) -> dict[str, str]:
    if not api_key:
        return {}
    return {"Authorization": f"Bearer {api_key}"}


async def probe(
    url: str, timeout_s: float = 2.5, api_key: str | None = None
) -> tuple[bool, int | None, str]:
    try:
        async with httpx.AsyncClient(
            timeout=timeout_s, trust_env=False, headers=auth_headers(api_key)
        ) as client:
            response = await client.get(url)
            text = response.text[:300]
            return response.status_code < 500, response.status_code, text
    except httpx.HTTPError:
        return False, None, ""


async def autodetect(timeout_s: float = 2.5) -> list[dict[str, str]]:
    candidates = [
        ("ollama", "http://127.0.0.1:11434", "http://127.0.0.1:11434/api/version"),
        ("openai", "http://127.0.0.1:1234/v1", "http://127.0.0.1:1234/v1/models"),
        ("openai", "http://127.0.0.1:8080/v1", "http://127.0.0.1:8080/v1/models"),
        ("openai", "http://127.0.0.1:8000/v1", "http://127.0.0.1:8000/v1/models"),
    ]
    found: list[dict[str, str]] = []
    for kind, base, url in candidates:
        ok, status, _body = await probe(url, timeout_s=timeout_s)
        if ok and status is not None and status < 400:
            found.append({"kind": kind, "base_url": base, "probe": url})
    return found


async def list_model_ids(kind: str, base_url: str, api_key: str | None = None) -> list[str]:
    async with httpx.AsyncClient(
        timeout=10.0, trust_env=False, headers=auth_headers(api_key)
    ) as client:
        if kind == "ollama":
            response = await client.get(ollama_base(base_url) + "/api/tags")
            response.raise_for_status()
            payload = response.json()
            models = payload.get("models") if isinstance(payload, dict) else None
            names: list[str] = []
            if isinstance(models, list):
                for row in models:
                    if isinstance(row, dict) and isinstance(row.get("name"), str):
                        names.append(row["name"])
            return names
        response = await client.get(openai_base(base_url) + "/models")
        response.raise_for_status()
        payload = response.json()
        data = payload.get("data") if isinstance(payload, dict) else None
        names = []
        if isinstance(data, list):
            for row in data:
                if isinstance(row, dict) and isinstance(row.get("id"), str):
                    names.append(row["id"])
        return names


def _compact(value: Any, limit: int = 400, depth: int = 0) -> Any:
    if depth > 6:
        return None
    if isinstance(value, dict):
        return {str(key): _compact(item, limit, depth + 1) for key, item in value.items()}
    if isinstance(value, list):
        if len(value) > 20:
            return {"_list_length": len(value)}
        return [_compact(item, limit, depth + 1) for item in value]
    if isinstance(value, str) and len(value) > limit:
        return value[:limit] + f"…({len(value)} chars)"
    if isinstance(value, (int, float, str, bool)) or value is None:
        return value
    return str(value)


async def _get_json(client: httpx.AsyncClient, url: str) -> tuple[int | None, Any, dict[str, str]]:
    try:
        response = await client.get(url)
    except httpx.HTTPError as exc:
        return None, {"error": str(exc)}, {}
    headers = {key.lower(): value for key, value in response.headers.items()}
    try:
        body = response.json()
    except json_error():
        body = {"text": _truncate(response.text)}
    return response.status_code, body, headers


def json_error() -> type[BaseException]:
    import json

    return json.JSONDecodeError


def _quant_from_name(name: str) -> str | None:
    import re

    match = re.search(
        r"(UD-Q\d+_K_[A-Z0-9]+|IQ\d+_[A-Z0-9]+|Q\d+_K_[A-Z0-9]+|Q\d+_[A-Z0-9]+|q\d+_[a-z0-9]+|fp16|bf16|FP16|BF16)",
        name,
    )
    if not match:
        return None
    return match.group(1)


async def describe_server(
    kind: str, base_url: str, model: str | None, api_key: str | None = None
) -> dict[str, Any]:
    info: dict[str, Any] = {
        "kind": kind,
        "base_url": ollama_base(base_url) if kind == "ollama" else openai_base(base_url),
        "identified_as": "ollama" if kind == "ollama" else "openai-compatible",
        "version": None,
        "quantization": None,
        "quantization_source": None,
        "parameter_size": None,
    }
    async with httpx.AsyncClient(
        timeout=15.0, trust_env=False, headers=auth_headers(api_key)
    ) as client:
        if kind == "ollama":
            base = ollama_base(base_url)
            status, body, _headers = await _get_json(client, base + "/api/version")
            if status == 200 and isinstance(body, dict) and isinstance(body.get("version"), str):
                info["version"] = body["version"]
            status, ps_body, _headers = await _get_json(client, base + "/api/ps")
            info["ollama_ps_before"] = _compact(ps_body) if status == 200 else None
            if model:
                try:
                    response = await client.post(base + "/api/show", json={"name": model})
                    shown = response.json() if response.status_code == 200 else None
                except httpx.HTTPError:
                    shown = None
                if isinstance(shown, dict):
                    details = shown.get("details") if isinstance(shown.get("details"), dict) else {}
                    quant = details.get("quantization_level")
                    if isinstance(quant, str) and quant:
                        info["quantization"] = quant
                        info["quantization_source"] = "ollama_/api/show"
                    size = details.get("parameter_size")
                    if isinstance(size, str):
                        info["parameter_size"] = size
                    info["ollama_details"] = _compact(details)
            info["parallel_documentation"] = OLLAMA_PARALLEL_DOC
            return info

        base = openai_base(base_url)
        status, models_body, headers = await _get_json(client, base + "/models")
        info["response_server_header"] = headers.get("server")
        server_header = (headers.get("server") or "").lower()
        if "vllm" in server_header:
            info["identified_as"] = "vllm"
        root = origin_of(base)
        props_status, props, _props_headers = await _get_json(client, root + "/props")
        if props_status == 200 and isinstance(props, dict) and (
            "total_slots" in props or "model_path" in props or "default_generation_settings" in props
        ):
            info["identified_as"] = "llama.cpp"
            info["llama_props"] = _compact(props)
            build = props.get("build_info")
            if isinstance(build, str) and build:
                info["version"] = build
            slots = props.get("total_slots")
            if isinstance(slots, int):
                info["parallel_slots"] = slots
            ftype = props.get("model_ftype")
            if isinstance(ftype, str) and ftype:
                info["quantization"] = ftype
                info["quantization_source"] = "llama_props_model_ftype"
            path = props.get("model_path") or props.get("model_alias")
            if isinstance(path, str):
                hinted = _quant_from_name(path)
                if hinted and not info["quantization"]:
                    info["quantization"] = hinted
                    info["quantization_source"] = "llama_props_model_path"
        elif "1234" in base and info["identified_as"] == "openai-compatible":
            info["identified_as"] = "lmstudio-or-openai-compatible"
        if model and not info["quantization"]:
            hinted = _quant_from_name(model)
            if hinted:
                info["quantization"] = hinted
                info["quantization_source"] = "model_name"
        if status == 200:
            info["models_endpoint"] = "ok"
        else:
            info["models_endpoint"] = status
        _ = models_body
        return info


async def ollama_ps(base_url: str) -> Any:
    async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
        status, body, _headers = await _get_json(client, ollama_base(base_url) + "/api/ps")
        if status == 200:
            return _compact(body)
        return None
