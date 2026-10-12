"""Pure checks. These do not write charts and are not benchmark results."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from llmbench.backends import StreamAccum, consume_ollama_obj, consume_openai_obj
from llmbench.prompts import filler_repeats_for
from llmbench.stats import interpret, percentile, summarize_level


class FillerTests(unittest.TestCase):
    def test_rounds_to_the_nearest_repeat(self) -> None:
        self.assertEqual(filler_repeats_for(800, 322, 543), 1)
        self.assertEqual(filler_repeats_for(7500, 200, 500), 15)
        self.assertEqual(filler_repeats_for(100, 80, 500), 0)
        self.assertEqual(filler_repeats_for(800, 100, 0), 0)


class PercentileTests(unittest.TestCase):
    def test_single_sample_is_every_percentile(self) -> None:
        self.assertEqual(percentile([4.0], 50), 4.0)
        self.assertEqual(percentile([4.0], 95), 4.0)

    def test_type7_examples(self) -> None:
        self.assertEqual(percentile([1, 2, 3], 50), 2)
        self.assertAlmostEqual(percentile([1, 2, 3], 95), 2.9)
        self.assertEqual(percentile([1, 2, 3, 4], 50), 2.5)
        self.assertEqual(percentile([1, 2, 3, 4], 100), 4)


class InterpretTests(unittest.TestCase):
    def test_queue_and_wip_need_the_ratios(self) -> None:
        levels = [
            {
                "concurrency": 1,
                "failed": False,
                "ttft_s": {"median": 1.0, "max": 1.1},
                "aggregate_throughput_tps": {"median": 40.0},
                "decode_tps": {"median": 40.0},
            },
            {
                "concurrency": 8,
                "failed": False,
                "ttft_s": {"median": 10.0, "max": 20.0},
                "aggregate_throughput_tps": {"median": 42.0},
                "decode_tps": {"median": 39.0},
            },
        ]
        result = interpret(levels)
        self.assertTrue(result["queue"])
        self.assertTrue(result["wip"])
        self.assertIn("待ち行列", result["text"])
        self.assertIn("仕掛品", result["text"])

    def test_flat_wait_is_not_called_a_queue(self) -> None:
        levels = [
            {
                "concurrency": 1,
                "failed": False,
                "ttft_s": {"median": 0.2, "max": 0.21},
                "aggregate_throughput_tps": {"median": 40.0},
                "decode_tps": {"median": 40.0},
            },
            {
                "concurrency": 4,
                "failed": False,
                "ttft_s": {"median": 0.25, "max": 0.3},
                "aggregate_throughput_tps": {"median": 140.0},
                "decode_tps": {"median": 36.0},
            },
        ]
        result = interpret(levels)
        self.assertFalse(result["queue"])
        self.assertFalse(result["wip"])
        self.assertNotIn("待ち行列", result["text"])


class SummarizeTests(unittest.TestCase):
    def test_failed_wave_is_dropped(self) -> None:
        waves = [
            {
                "requests": [{"ok": True, "ttft_s": 1.0, "total_s": 2.0, "decode_tps": 10.0, "prompt_tokens": 5}],
                "aggregate_throughput_tps": 12.0,
            },
            {
                "requests": [{"ok": False, "ttft_s": None, "error": "boom"}],
                "aggregate_throughput_tps": None,
            },
        ]
        level = summarize_level(1, waves)
        self.assertFalse(level["failed"])
        self.assertEqual(level["waves_ok"], 1)
        self.assertEqual(level["waves_failed"], 1)
        self.assertEqual(level["ttft_s"]["median"], 1.0)


class ParserTests(unittest.TestCase):
    def test_ollama_first_content_and_counts(self) -> None:
        acc = StreamAccum()
        consume_ollama_obj(acc, {"message": {"role": "assistant", "content": ""}, "done": False})
        self.assertFalse(acc.saw_token)
        consume_ollama_obj(acc, {"message": {"content": "あ"}, "done": False})
        self.assertTrue(acc.saw_token)
        self.assertEqual(acc.first_field, "content")
        consume_ollama_obj(
            acc,
            {
                "done": True,
                "eval_count": 4,
                "eval_duration": 2_000_000_000,
                "prompt_eval_count": 9,
                "load_duration": 5_000_000_000,
            },
        )
        self.assertEqual(acc.completion_tokens, 4)
        self.assertEqual(acc.prompt_tokens, 9)
        self.assertAlmostEqual(acc.eval_s or 0, 2.0)
        self.assertAlmostEqual(acc.load_s or 0, 5.0)

    def test_openai_usage_and_empty_role_chunk(self) -> None:
        acc = StreamAccum()
        consume_openai_obj(
            acc,
            {"choices": [{"delta": {"role": "assistant", "content": ""}}]},
        )
        self.assertFalse(acc.saw_token)
        consume_openai_obj(acc, {"choices": [{"delta": {"content": "x"}}]})
        consume_openai_obj(
            acc,
            {"choices": [], "usage": {"prompt_tokens": 3, "completion_tokens": 2}},
        )
        self.assertEqual(acc.completion_tokens, 2)
        self.assertEqual(acc.prompt_tokens, 3)
        self.assertEqual(acc.token_source, "openai_usage")


if __name__ == "__main__":
    unittest.main()
