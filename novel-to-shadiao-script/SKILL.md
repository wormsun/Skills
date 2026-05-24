---
name: novel-to-shadiao-script
description: "Convert Chinese novels, chapters, outlines, or character settings into production-ready scripts for 沙雕动画小助手, including short-video pacing, episode structure, narration, dialogue, sound cues, and cliffhangers. Default scripts are audio-first: plot information must be carried by narration and dialogue, without a 画面配合 column. Use when adapting fiction into humorous Chinese animation scripts for platforms such as Douyin, Kuaishou, Bilibili, and WeChat Channels; also use when the user asks for 沙雕动画剧本, 小说改编短视频脚本, 分集剧本, 分镜表, or 沙雕动画小助手脚本."
---

# Novel To Shadiao Script

Use this skill to adapt novels into scripts that can be produced in 沙雕动画小助手 and published to short-video platforms. Default to Chinese output unless the user asks otherwise.

## Defaults

- Target production tool: 沙雕动画小助手.
- Target publishing platforms: 抖音, 快手, B站, 视频号, or similar short-video platforms.
- Video format: do not assume vertical export; write tool-friendly universal animation scripts unless the user requests a specific aspect ratio.
- Episode length: 1-3 minutes by default.
- Adaptation mode: faithful adaptation by default. Do not activate copyright-risk reduction unless the user explicitly asks for 原创化, 低相似, 避免版权风险, 改名换设定, or similar.
- Output style: audio-first narration/dialogue, fast, humorous, dramatic, exaggerated, and production-ready; avoid literary prose.
- Default script tables do not include `画面配合`. Use `序号 | 旁白/对白 | 音效/BGM` unless the user explicitly requests storyboard/visual handoff columns.

## Workflow

1. Identify the input type: novel text, chapter summary, multi-chapter arc, character settings, or rough outline.
2. Extract the story spine: protagonist goal, conflict, antagonist pressure, key reveal, power/status change, emotional turn, and next hook.
3. Choose the adaptation plan:
   - Single chapter or short excerpt: produce one complete episode.
   - Long chapter or multi-chapter input: split into episodes first, then script the requested episode range.
   - Outline only: fill missing beats while preserving the user's premise.
4. Rewrite into short-video rhythm:
   - Open with conflict, reversal, humiliation, danger, or absurd contrast within 3-5 seconds.
   - Keep each beat short and easy to understand by listening alone.
   - Make narration and dialogue form a continuous cause-effect chain; do not jump from one topic to another without a bridging line.
   - Put actions, scene changes, identity relationships, object usage, and emotional turns into narration/dialogue. Do not rely on visual notes.
   - Add a laugh point, information point, status shift, or suspense beat every 10-20 seconds.
   - End with a cliffhanger, reversal, or next-episode question.
5. Produce a script format the user can use directly: production-line episode script, storyboard table, batch episode plan, or JSON.
6. Check whether the output is understandable as audio alone and still producible in 沙雕动画小助手: clear characters, simple spoken action bridges, dialogue, narration, sound cues, and simple transitions.

## Audio-First Production Rule

沙雕动画小助手主要依赖旁白和对白推进动画，且许多观众靠听来理解剧情. Do not place key story information in visual/action notes, shot notes, captions, or `画面配合`.

For every important action, expression, environment detail, memory flashback, or scene transition:

- Express it in narration or dialogue first.
- If deleting every visual field, action note, shot note, caption, and production note makes the plot hard to understand, rewrite the narration/dialogue before finalizing.
- Use narration/dialogue to say who enters, who leaves, who receives or uses a prop, where the scene moves, why a character changes attitude, and how one beat causes the next.
- Default production rows should contain only `序号`, `旁白/对白`, and `音效/BGM`. Do not add `画面配合` unless the user explicitly asks for a storyboard or visual handoff version.

## Line-Level Audio Rule

For production scripts, split each beat into line-level rows. Each row should contain one spoken unit and optional sound cue.

- Use one short narration sentence or one dialogue line per row.
- Every row should be understandable without seeing the screen.
- Do not put actions only in production notes. Say them aloud when they matter: `刘嬷嬷端来药碗`, `顾砚舟接过馒头`, `石头跑进院子`, `顾砚林撞了他肩膀一下`.
- Use bridge lines before jumps in time, place, topic, relationship, prop usage, or character motivation.
- Use sound cues only to support the spoken line, not to carry plot information.
- Avoid cinematic camera language unless the user asks for advanced storyboard.

## Load References

- Read `references/workflow.md` for full adaptation steps, long-text splitting, and episode structure.
- Read `references/genre-patterns.md` when the source genre matters or the user asks for a specific genre style.
- Read `references/shadiao-comedy-style.md` when improving humor, narration, dialogue, memes, or character voice.
- Read `references/platform-rhythm.md` when tuning hooks, pacing, and ending retention for short-video platforms.
- Read `references/output-formats.md` when the user requests a table, JSON, batch episodes, or a production handoff format.
- Read `references/optional-copyright-mode.md` only when the user explicitly asks to reduce similarity or avoid copyright risk.

## Templates

Use these files as output anchors when the user does not provide a format:

- `templates/episode-script.md` for a single complete episode.
- `templates/storyboard-table.md` for shot-by-shot production tables.
- `templates/batch-episodes.md` for multi-episode planning.
- `templates/structured-script.json` for structured downstream automation.

## Failure Modes

Avoid these common failures:

- Do not output novel-style prose or chapter summaries when the user needs a production script.
- Do not let narration and dialogue become disconnected bullet fragments; each line should answer, trigger, explain, or escalate the previous line.
- Do not rely on `画面/动作`, `画面配合`, shot notes, captions, or visual notes to explain the plot.
- Do not output a `画面配合` column by default.
- Do not output `字幕` or `可选强调字幕` fields by default; turn that information into narration/dialogue.
- Do not make listeners infer important actions from silence; if a prop, person, or location matters, introduce it in narration/dialogue before it is used.
- Do not put all jokes in the opening and leave the middle flat.
- Do not make every character use the same sarcastic voice.
- Do not create excessive scene changes that slow down 沙雕动画小助手 production.
- Do not assume vertical video export unless the user requests it.

## Quality Gate

Before finalizing, verify that the script includes:

- Title, episode goal, opening hook, character list, scene list.
- A production line table with `序号 | 旁白/对白 | 音效/BGM` by default.
- Clear continuity between narration and dialogue: each beat must include how it connects from the previous beat and how it leads to the next beat.
- Complete audio-only comprehension: if all visuals are removed, listeners still understand who is present, where they are, what happens, why it matters, and what changes.
- Language, action, object, and plot continuity: no abrupt jumps, unexplained props, missing entrances/exits, inconsistent names/ages/status, or unsupported emotional turns.
- Sound effects or BGM suggestions.
- Ending hook or next-episode continuation.
- Short-video pacing without assuming vertical export.
- Scene and object continuity stated in narration/dialogue: characters, props, locations, and transitions appear in logical order with no unexplained jumps.

When a script artifact is saved to a file, run the validator from the repository root and fix missing required sections unless the user requested a lightweight draft:

```powershell
python skills/novel-to-shadiao-script/scripts/validate_script.py <script-file>
```

Add `--strict` when the user wants warnings to fail the check too.

For cross-tool setup, run this from the repository root to install project adapters, and keep `-InstallCodexUser` when syncing the Skill into the current Windows user's Codex skills folder:

```powershell
powershell -ExecutionPolicy Bypass -File skills/novel-to-shadiao-script/scripts/install_adapters.ps1 -RepoRoot . -AllProject -InstallCodexUser
```
