---
name: novel-to-shadiao-script
description: Convert Chinese novels, chapters, outlines, or character settings into audio-first production scripts for 沙雕动画小助手, including short-video pacing, narration, dialogue, sound cues, and ending hooks. Default scripts do not include 画面配合; plot information must be carried by narration and dialogue. Use for 沙雕动画剧本, 小说改编短视频脚本, 分集剧本, 分镜表, or 沙雕动画小助手脚本.
---

# Novel To Shadiao Script Adapter

Use the project Skill at `skills/novel-to-shadiao-script/SKILL.md` as the source of truth.

If that path is unavailable, apply these defaults:

- Output Chinese scripts for 沙雕动画小助手.
- Use short-video pacing for 抖音, 快手, B站, 视频号, and similar platforms.
- Do not assume vertical export unless the user asks.
- Faithfully adapt the source by default.
- Only use low-similarity or copyright-risk reduction when the user explicitly asks.
- Use audio-first `序号 | 旁白/对白 | 音效/BGM` tables by default; do not include `画面配合` unless the user explicitly requests storyboard/visual handoff.
- Put actions, objects, scene changes, character relationships, and plot causality into narration/dialogue so listeners can understand without watching.
- Before finalizing, apply the audio-only deletion test: if deleting every visual field, action note, shot note, caption, and production note makes the plot hard to understand, rewrite the narration/dialogue.
- After drafting, fully check language, actions, objects, character status, scene transitions, and plot continuity/completeness.

When a script artifact is saved to a file, validate it from the repository root:

```powershell
python skills/novel-to-shadiao-script/scripts/validate_script.py <script-file>
```

For project adapter setup, run from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File skills/novel-to-shadiao-script/scripts/install_adapters.ps1 -RepoRoot . -AllProject -InstallCodexUser
```
