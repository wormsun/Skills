#!/usr/bin/env python3
"""Lightweight validator for 沙雕动画 script drafts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REQUIRED_MARKDOWN_TERMS = [
    "标题",
    "本集",
    "角色",
    "场景",
    "开场",
    "钩子",
    "旁白/对白",
    "制作备注",
    "结尾",
]

DISALLOWED_CAPTION_TERMS = [
    "字幕",
    "可选强调字幕",
    "caption_optional",
]

RISKY_VISUAL_TERMS = [
    "眼神",
    "内心",
    "弹幕",
    "关系图",
    "快速闪回",
    "闪过",
    "复杂",
    "镜头环绕",
    "光影",
    "特写",
    "微微",
    "嘴角",
    "细微",
]

REQUIRED_JSON_KEYS = [
    "schema_version",
    "title",
    "duration",
    "adaptation_range",
    "characters",
    "scenes",
    "beats",
    "ending_hook",
    "platform_rhythm",
]


def validate_markdown(text: str) -> tuple[list[str], list[str]]:
    missing = [term for term in REQUIRED_MARKDOWN_TERMS if term not in text]
    errors: list[str] = []
    warnings: list[str] = []
    if missing:
        errors.append("Missing expected script sections/terms: " + ", ".join(missing))
    if "音效" not in text and "BGM" not in text:
        errors.append("Missing sound cue section/term: 音效 or BGM")
    if "画面/动作" in text:
        errors.append("Uses action-first format; move plot-bearing information into 旁白/对白.")
    for term in DISALLOWED_CAPTION_TERMS:
        if term in text:
            errors.append(f"Remove caption field/term: {term}")
    if "| 序号 |" not in text and "| 时间 |" not in text:
        warnings.append("No production table detected; line-level scripts should split spoken lines into rows.")
    if "画面配合" in text:
        warnings.append("Contains 画面配合; default scripts should be audio-first unless the user requested storyboard/visual handoff.")
    for term in RISKY_VISUAL_TERMS:
        if term in text:
            warnings.append(f"Visual cue may be hard to produce in 沙雕动画小助手: {term}")
    if len(text) < 500:
        warnings.append("Draft is very short; confirm this was intended.")
    if "竖屏" in text and "不默认" not in text and "用户要求" not in text:
        warnings.append("Mentions vertical video; confirm the user requested it.")
    if "结尾" in text and not any(term in text for term in ["悬念", "钩子", "下集", "反转"]):
        warnings.append("Ending exists but may not include a clear retention hook.")
    return errors, warnings


def validate_json(text: str) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        return [f"Invalid JSON: {exc}"], []

    for key in REQUIRED_JSON_KEYS:
        if key not in data:
            errors.append(f"Missing JSON key: {key}")

    platform_rhythm = data.get("platform_rhythm")
    if "platform_rhythm" in data and not isinstance(platform_rhythm, dict):
        errors.append("JSON key platform_rhythm must be an object.")
    elif isinstance(platform_rhythm, dict):
        for key in ["target_platforms", "aspect_ratio_assumption", "opening_hook", "ending_hook"]:
            if key not in platform_rhythm:
                errors.append(f"platform_rhythm missing key: {key}")

    beats = data.get("beats")
    if isinstance(beats, list) and beats:
        beat_keys = {
            "time_range",
            "previous_link",
            "scene",
            "story_text",
            "narration",
            "dialogue",
            "action",
            "production_lines",
            "sound",
            "note",
            "next_link",
        }
        for index, beat in enumerate(beats, start=1):
            if isinstance(beat, dict):
                missing = sorted(beat_keys - set(beat))
                if missing:
                    errors.append(f"Beat {index} missing keys: {', '.join(missing)}")
                production_lines = beat.get("production_lines")
                if not isinstance(production_lines, list) or not production_lines:
                    errors.append(f"Beat {index} must include non-empty production_lines.")
                elif isinstance(production_lines, list):
                    line_keys = {"speaker_type", "speaker", "text", "sound", "note"}
                    for line_index, production_line in enumerate(production_lines, start=1):
                        if not isinstance(production_line, dict):
                            errors.append(f"Beat {index} production line {line_index} must be an object.")
                            continue
                        if "caption_optional" in production_line:
                            errors.append(f"Beat {index} production line {line_index} contains removed key: caption_optional")
                        line_missing = sorted(line_keys - set(production_line))
                        if line_missing:
                            errors.append(f"Beat {index} production line {line_index} missing keys: {', '.join(line_missing)}")
                        text_value = str(production_line.get("text", "")).strip()
                        if "visual_action" in production_line:
                            warnings.append(f"Beat {index} production line {line_index} contains visual_action; default JSON should be audio-first.")
                            visual_value = str(production_line.get("visual_action", "")).strip()
                            if visual_value and not text_value:
                                warnings.append(f"Beat {index} production line {line_index} has visual_action but no text.")
                            for term in RISKY_VISUAL_TERMS:
                                if term in visual_value:
                                    warnings.append(f"Beat {index} production line {line_index} visual_action may be hard to produce: {term}")
                if "caption_optional" in beat:
                    errors.append(f"Beat {index} contains removed key: caption_optional")
            else:
                errors.append(f"Beat {index} must be an object.")
    else:
        errors.append("No beats found.")

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a 沙雕动画小助手 script draft.")
    parser.add_argument("script_file", type=Path)
    parser.add_argument("--strict", action="store_true", help="Return a non-zero exit code when warnings are present.")
    args = parser.parse_args()

    text = args.script_file.read_text(encoding="utf-8")
    errors, warnings = validate_json(text) if args.script_file.suffix.lower() == ".json" else validate_markdown(text)

    if errors:
        print("Validation errors:")
        for error in errors:
            print(f"- {error}")
    if warnings:
        print("Validation warnings:")
        for warning in warnings:
            print(f"- {warning}")

    if errors or (warnings and args.strict):
        return 1

    print("Validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
