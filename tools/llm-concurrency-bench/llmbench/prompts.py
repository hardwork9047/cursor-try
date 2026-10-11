"""Fixed prompt text. A unique id is prefixed so prefix caches cannot erase prefill."""

from __future__ import annotations

import hashlib

# The instruction is constant. Generation length is capped by the server, not by
# this text. The model is asked to keep writing so a short answer does not end
# the request at the first sentence (it still may stop at EOS).
QUESTION = (
    "あなたは生産技術の担当です。"
    "同じ設備に仕事が同時に流れてきたとき、待ち時間がどう増えるかを、"
    "現場で使う言葉で説明してください。"
    "結論を急がず、具体例を変えて、長さの上限まで書き続けてください。"
)

# One repeat is a few hundred characters. --prompt-tokens scales how many
# repeats are inserted. The paragraph itself is fixed.
FILLER_PARAGRAPH = (
    "ラインAの記録。8時00分にロットL-17が加工機M3へ入った。"
    "段取りは完了しており、切削そのものは予定どおり進んだ。"
    "8時14分、同じ機械へロットL-18の着手指示が追加された。"
    "材料は揃っていたが、M3はL-17の加工中で、L-18は機械の前で待った。"
    "8時21分、検査待ちのL-16が測定器C2の列に並んだ。"
    "測定器は1台で、先に来たロットの寸法確認が終わるまで次は始まらない。"
    "8時27分、搬送係がM3の完了品を受け取りに来たが、L-18の段取り指示と重なり、"
    "作業者は片方を終えてからもう片方に移った。"
    "この間、L-18は削られておらず、滞留として現場板に残った。"
    "原因は機械の速度が落ちたことではなく、同時に置かれた仕事の順番待ちだった。"
)


def build_prompt(request_id: str, filler_repeats: int, question: str | None = None) -> str:
    body = question if question is not None else QUESTION
    parts = [
        f"依頼ID: {request_id}",
        "このIDは測定用です。質問の意味は変えません。IDが違う依頼は別の仕事として扱ってください。",
    ]
    if filler_repeats > 0:
        parts.append("\n".join([FILLER_PARAGRAPH] * filler_repeats))
    parts.append(body)
    return "\n\n".join(parts)


def filler_repeats_for(target: int, overhead_tokens: int, tokens_per_repeat: int) -> int:
    """How many filler copies bring the server-counted prompt near `target`."""
    if tokens_per_repeat <= 0:
        return 0
    return max(0, round((target - overhead_tokens) / tokens_per_repeat))


def prompt_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
