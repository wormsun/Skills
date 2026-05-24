# AGENTS.md

This repository contains a reusable Skill at `skills/novel-to-shadiao-script/`.

When the user asks to adapt novels, chapters, outlines, or character settings into 沙雕动画小助手 scripts, use the `novel-to-shadiao-script` workflow.

Default behavior:

- Write in Chinese unless the user asks otherwise.
- Target 沙雕动画小助手 production.
- Use short-video pacing for 抖音, 快手, B站, 视频号, and similar platforms.
- Do not assume vertical export; the production script should remain compatible with the assistant's current general video workflow.
- Faithfully adapt the source by default. Only use low-similarity or copyright-risk reduction when the user explicitly requests it.
- Prefer audio-first production scripts with narration, dialogue, sound cues, and ending hooks.
- Do not include `画面配合` by default; actions, objects, scene changes, character relationships, and plot causality must be spoken in narration/dialogue.
- After drafting, fully check language, actions, objects, character status, scene transitions, and plot continuity/completeness.

For details, read `skills/novel-to-shadiao-script/SKILL.md`.