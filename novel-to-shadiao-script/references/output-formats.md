# Output Formats

Choose the smallest format that satisfies the user's request. If the user does not specify, use the production-line episode script.

## Production-Line Episode Script

Use for direct writing and review:

- 标题
- 本集定位
- 预计时长
- 角色表
- 场景表
- 开场钩子
- 正文剧本 with time blocks and production rows
- 结尾钩子
- 制作备注

Each time block should include an audio-first production line table. Every row must be understandable by listening alone.

Each time block should also include a connective function:

- 承接上一幕: the line, action, or question that leads into this block.
- 制作行表: line-level rows for 沙雕动画小助手 production.
- 旁白/对白: the exact spoken text. Important actions, scene changes, objects, memory, character relationships, causality, and exposition must be stated here.
- 音效/BGM: optional audio support. It must not carry required plot information.
- 转入下一幕: the line, action, or hook that causes the next block.

Default table columns:

```markdown
| 序号 | 旁白/对白 | 音效/BGM |
| --- | --- | --- |
```

Do not include `画面配合` unless the user explicitly asks for 分镜, 镜头, storyboard, or visual handoff.

## Storyboard Table

Use when the user asks for 分镜, 镜头, 制作表, or animation handoff.

Columns:

- 时间
- 承接/转入
- 场景
- 序号
- 旁白/对白
- 画面配合
- 音效/BGM
- 制作备注

Storyboard tables are optional visual handoff artifacts. Even in storyboard mode, plot information must remain in `旁白/对白`; `画面配合` is only production support.

## Batch Episodes

Use when source text is long or the user asks for 多集拆分.

For each episode:

- 集数
- 标题
- 原文覆盖范围 or 剧情范围
- 核心冲突
- 开场钩子
- 爽点/笑点
- 结尾悬念
- 预计时长

## JSON

Use JSON only when requested or when the next tool needs structured data.

Keep keys stable:

- schema_version
- title
- duration
- adaptation_range
- ending_hook
- platform_rhythm
- characters
- scenes
- beats
- production_notes

`platform_rhythm` should be a nested object with target platforms, aspect-ratio assumption, opening hook, and ending hook. Keep a top-level `ending_hook` as the primary value for downstream tools.

Each beat should include:

- time_range
- previous_link
- scene
- story_text
- narration
- dialogue
- action
- production_lines
- sound
- note
- next_link

Each `production_lines` item should include:

- speaker_type
- speaker
- text
- sound
- note

Include `visual_action` only for explicit storyboard/visual handoff requests. Default JSON should keep plot-bearing information in `text`.
