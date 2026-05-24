---
name: funny-animation-assistant
description: Operate the Funny Animation Assistant Adobe Animate plugin through its local AI automation Bridge and CLI. Use when Codex needs to inspect FLA files, scan stage contents, read timelines or symbol/group structure, switch frames, export PNG/config assets, batch-process FLA files, monitor/cancel plugin jobs, or diagnose plugin/Bridge connectivity. This skill only supports read, navigation, and export workflows; it must not save, rename, delete, or directly modify FLA contents.
---

# Funny Animation Assistant

Use the bundled Node CLI for every plugin operation:

```bash
node <skill-dir>/scripts/faa-cli.js <command>
```

Resolve `<skill-dir>` to this skill's installed folder, for example `skills/funny-animation-assistant` in this repository or the absolute installed skill path in a user environment. The CLI starts the bundled local Bridge automatically. The user must still open Adobe Animate, open the plugin panel, switch to `AI自动化`, and enable `允许外部工具控制`.

## Safety Rules

- Do not edit FLA files directly.
- Do not run arbitrary JSFL.
- Do not save, rename, delete, or modify FLA documents or library assets.
- Use `close` only for `close_document_without_save`.
- Do not run multiple external tools against the same Animate document at the same time.
- The CLI uses a process lock, so only one `faa-cli` command may run at a time.
- If `PLUGIN_BUSY` appears, wait, query `job`, or ask the user before cancelling.

## Preflight

Run:

```bash
node <skill-dir>/scripts/faa-cli.js doctor
```

If `plugin.online` is false, ask the user to open Animate and enable AI automation in the plugin. If `protocolVersion` is mismatched, stop and report the mismatch.

If the CLI returns `FAA_CLI_BUSY`, another `faa-cli` command is still running. Wait for it to finish, or rerun with `--wait-lock 60` when the user expects a long export to complete soon.

## Commands

```bash
node <skill-dir>/scripts/faa-cli.js status
node <skill-dir>/scripts/faa-cli.js scan
node <skill-dir>/scripts/faa-cli.js scan-frame --frame 18
node <skill-dir>/scripts/faa-cli.js timeline
node <skill-dir>/scripts/faa-cli.js set-frame --frame 18
node <skill-dir>/scripts/faa-cli.js structure --symbol Hero
node <skill-dir>/scripts/faa-cli.js group --layerIndex 0 --elementIndex 0 --frameIndex 0
node <skill-dir>/scripts/faa-cli.js open D:/work/scene.fla
node <skill-dir>/scripts/faa-cli.js close --path D:/work/scene.fla
node <skill-dir>/scripts/faa-cli.js job
node <skill-dir>/scripts/faa-cli.js cancel
```

Any command can wait for the single CLI lock:

```bash
node <skill-dir>/scripts/faa-cli.js scan --wait-lock 60
```

## Export Workflows

Before exporting, determine the asset kind. If the user did not say what kind of asset is being exported, ask before running any export command. A read-only `scan`, `scan-frame`, `timeline`, `structure`, or `group` call may be used first to understand the document, but export must not begin until the asset kind and export strategy are clear. Use these high-level kinds:

- `scene-template`: scene template assets.
- `character`: character assets.
- `prop`: prop assets.
- `expression`: expression assets.
- `background`: background assets.

Keep asset-kind analysis and export strategy in this skill. The Animate plugin is a generic scanner/export executor; do not require plugin or UI changes for character-specific decisions.

Ask the user at these decision points:

- The request only says to export an FLA or export to a folder, without saying the asset kind. Ask: `这是要导出人物、场景模板、道具、表情还是背景？`
- A read-only scan shows multiple first-level stage elements and the user did not say whether to export all of them or only some of them. Ask: `我看到舞台上有多个一级元素，是要全部导出，还是只导出指定素材？`
- The user says the asset is a character, but the scan does not show a whole character as a first-level stage root. Ask the user to place the whole character on the stage as a first-level element, or clarify the intended root.
- Character mode is ambiguous. Ask: `这些人物的走路/跑步动画是否已经在腿部素材里做好？如果是，我会按组装人物导出为 双腿；否则按离散人物保留 左腿/右腿。`
- Level 3 is being considered and may expose tiny pieces. Ask: `Level 3 可能拆出更细部件，是否优先保留大部件？`

Decision flow:

1. Parse the user request for asset kind, target FLA/frame/root, output directory, scale, and whether all roots should be exported.
2. Run only read-only inspection commands when needed.
3. If asset kind, root selection, character mode, or risky level choice is still unclear, ask the user before exporting.
4. Choose the export strategy in the skill.
5. Run the export command.
6. For character exports, normalize names and verify the result.
7. Report exported paths, chosen levels, normalization changes, warnings, and any manual review needed.

Export one known symbol:

```bash
node <skill-dir>/scripts/faa-cli.js export --character Hero --out D:/exports/Hero --level 2
```

Export all roots from a frame:

```bash
node <skill-dir>/scripts/faa-cli.js export-stage --frame 18 --level 2 --out D:/exports/frame_019 --timeout 600
```

Export one stage root by scan index. Use this when each first-level stage element needs separate export parameters:

```bash
node <skill-dir>/scripts/faa-cli.js export-stage-one --layerIndex 0 --elementIndex 0 --frame 18 --out D:/exports/one --level 2 --timeout 600
```

For single-root scene-template exports, treat `--out` as the parent export root, not the final template folder. Pass the desired final scene-template folder name with `--name`. The plugin creates one folder from the stage display name under `--out`; if `--out` already includes the final scene name and `--name` is omitted, generic stage roots such as `图层_1` can produce duplicated paths like `场景模板/兵器仓库/图层_1/config.json`. Prefer:

```bash
node <skill-dir>/scripts/faa-cli.js export-stage-one --layerIndex 0 --elementIndex 0 --frame 0 --level 2 --out D:/exports/场景模板 --name 兵器仓库 --timeout 600
```

This should produce `D:/exports/场景模板/兵器仓库/config.json`. Use the same rule in batches: export root first, final asset name second.

For scene-template exports only, normalize visual resolution before exporting by the whole exported scene, not by any single root element. The following height-normalization and whole-scene union-bounds rules apply only when the asset kind is `scene-template`; do not apply them to `character`, `prop`, `expression`, `background`, sound, BGM, or other non-scene-template assets. For scene templates, this rule applies to Level 1, Level 2, Level 3, and future scene-template export levels. Use `scan` or `scan-frame` to compute the union bounds of all stage roots that will belong to the exported scene for that frame; call this `sceneBounds`. If `sceneBounds.height < 2000`, export every selected root with the same `--scaleMode ratio` and `--scaleRatio ceil(2001 / sceneBounds.height * 100)` so the resulting whole scene height is just above 2000 px. If `sceneBounds.height >= 2000`, keep the user's requested scale or use no scaling. Never compute automatic height normalization from an individual root's `bounds.height`, especially for Level 1 multi-root scene exports, because per-root scaling changes relative sizes and positions. Prefer ratio scaling for this rule; do not use `--scaleMode custom` for automatic height normalization because group-member export paths consistently support ratio scaling. After export, parse the generated `config.json` when practical and verify the converted whole-template height is at least 2000; if it is still below 2000 due to bounds/filter differences, rerun all selected roots with one adjusted ratio.

Use scale options exactly when requested:

```bash
node <skill-dir>/scripts/faa-cli.js export-stage --frame 18 --out D:/exports/ratio --scaleMode ratio --scaleRatio 175 --subfolder false
node <skill-dir>/scripts/faa-cli.js export-stage --frame 18 --out D:/exports/custom --scaleMode custom --targetWidth 640 --targetHeight 360 --subfolder false
node <skill-dir>/scripts/faa-cli.js export-stage-one --layerIndex 0 --elementIndex 0 --frame 18 --out D:/exports/one-custom --scaleMode custom --targetWidth 640 --targetHeight 360 --subfolder false
```

For multiple FLA files: open one FLA, read `timeline`, scan target frames, export, close without saving, then continue to the next FLA. Continue after per-file failures and summarize failures in the final report.

When exporting from a FLA file into a user-provided output root, include the normalized FLA base filename as one path level by default. Normalize the FLA folder name with the same rule the plugin uses for generated folders: replace `/ \ : ? * | " < > .` plus half-width and full-width spaces with `_`, after removing the `.fla` extension. For example, exporting `D:/work/5魔.fla` to `D:/exports` should use `D:/exports/5魔` as the effective output root, and the plugin will then create stage-root folders such as `D:/exports/5魔/元件_136/config.json`. This avoids collisions between different FLA files that contain common stage names such as `元件 1`. Do not add the FLA folder again if the user already supplied an output path ending with that normalized FLA name. Only skip this rule when the user explicitly asks to export directly into the output root.

## Multi-Frame Scene Template Export

Use the skill-side Node batch wrapper when one FLA contains many scene templates on different timeline frames and each non-empty frame should become one independent scene-template folder. This workflow is intentionally outside the Animate plugin: the plugin remains a generic single export executor, while the skill script handles folder naming, resume/skip behavior, scale options, plugin job polling, logs, and final summaries. Frame discovery must use the plugin's read-only `timeline` and `scan-frame` commands, not direct FLA ZIP/XML parsing.

Run a list-only preflight first when the frame set or names are uncertain:

```bash
node <skill-dir>/scripts/faa-export-multiframe-scenes.js \
  --fla D:/work/scenes.fla \
  --out D:/exports/scenes \
  --listOnly
```

Export every non-empty frame as a scene template:

```bash
node <skill-dir>/scripts/faa-export-multiframe-scenes.js \
  --fla D:/work/scenes.fla \
  --out D:/exports/scenes \
  --level 2 \
  --scaleMode ratio \
  --scaleRatio 200 \
  --closeWhenDone
```

Useful options:

- `--layerIndex` / `--elementIndex`: the Animate stage element to export on each frame. By default the script uses the first stage item returned by `scan-frame`; pass explicit indexes only when the frame contains multiple roots and one should be selected.
- `--fallbackCategory`: fallback folder-name category when the frame root is generic such as `DOMGroup` or `元件 1`.
- `--categoryRanges`: optional semicolon rules for generic names, using zero-based frame indexes, for example `0-37=古代室内;38-45=古代客栈走廊;46-54=书房学堂`.
- `--scanMode keyframes|all`: `keyframes` uses plugin timeline keyframes as candidates; `all` scans every timeline frame through the plugin. Default `keyframes`.
- `--scaleMode`, `--scaleRatio`, `--targetWidth`, `--targetHeight`: passed through to `faa-cli.js export-stage-one`.
- By default, the effective output root is `<--out>/<normalized FLA base name>/`, for example `D:/exports/2_18更新_古代场景/`. This prevents scene folders from different FLA files from mixing. If `--out` already ends with that normalized FLA name, the script does not add it again.
- `--directOut`: opt out of the FLA-name folder and export directly into `--out`; use only when the user explicitly asks for direct output.
- `--logRoot`: where `export.log`, `timeline.json`, `frames.json`, per-frame scan/export output, job snapshots, and `summary.json` are written.

The script is resumable. If `<OutRoot>/<exportName>/config.json` already exists, that frame is skipped. After a transient plugin failure, rerun the same command to fill only missing frames. Do not delete partial folders automatically; inspect or ask the user before cleanup.

For ancient-town style scene packs where generic frame names need category labels, use explicit ranges:

```bash
node <skill-dir>/scripts/faa-export-multiframe-scenes.js \
  --fla D:/BaiduNetdiskDownload/古代场景190张/古代城镇.fla \
  --out D:/Study/AIGC/项目/BaiduSyncdisk/自制短剧/场景模板/皮卡尔 \
  --scaleMode ratio \
  --scaleRatio 200 \
  --categoryRanges "0-37=古代室内;38-45=古代客栈走廊;46-54=书房学堂;55-79=古代室外庭院;80-999=古代城镇街景" \
  --closeWhenDone
```


## Character Export Strategy

Characters must be first-level stage elements. Always run `scan` or `scan-frame` and verify that the whole character appears in the returned stage roots. If the character only exists inside a library symbol or nested object, report that this workflow does not support it and ask the user to place the whole character on the stage as a first-level element.

Before exporting a multi-root character stage, classify stage roots from the `scan` bounds and structure:

- `complete-character`: a first-level root whose bounds plausibly cover a full body from head to feet. Use the tall cluster in the current FLA as the reference, not a fixed pixel height. Full-body roots usually form a regular grid or row/column layout and have heights close to the largest character roots in the same pack.
- `scatter-part`: a first-level root that looks like a loose body part, such as head, arm, leg, hair, torso, or a small shape group. Common signals are much smaller height than the full-body cluster, tight proximity to other small roots, and a combined neighboring bounding box that looks like one full character.
- `uncertain`: small children, sitting/kid/half-body poses, or roots whose bounds are near the cutoff. Report these separately and ask before exporting.

Do not treat every first-level group as a character. Some asset packs place unpacked character parts directly on the stage. If several small roots cluster together and their combined bounding box resembles one character, report them as a scattered character candidate and skip export unless the user explicitly asks for parts or has grouped the full character into one first-level root. The plugin export workflow cannot merge scattered roots into one character during export.

For batch exports, present or internally record a short pre-export selection report before running `export-stage-one`: complete-character indexes to export, scatter-part indexes to skip, uncertain indexes needing confirmation, and the heuristic used. If the user interrupted or deleted a mistaken export, re-run `scan` and rebuild this report before resuming.

When a stage has multiple characters, do not use `export-stage` for character export because it applies one level to all roots. Analyze each first-level character separately and export each with `export-stage-one`, allowing different levels per character:

```bash
node <skill-dir>/scripts/faa-cli.js export-stage-one --layerIndex 0 --elementIndex 0 --frame 18 --level 2 --out D:/exports/characters
node <skill-dir>/scripts/faa-cli.js export-stage-one --layerIndex 1 --elementIndex 0 --frame 18 --level 3 --out D:/exports/characters
```

For multi-character exports, pass the same output root to each `export-stage-one`. The plugin creates the character folder from the stage display name, for example `D:/exports/characters/元件_136/config.json`. Do not pre-append another per-character folder in the skill, or paths become duplicated, such as `D:/exports/characters/元件 136/元件_136/config.json`.

Combine the two output path rules as:

```text
<user output root>/<normalized FLA base name>/<plugin stage-root folder>/config.json
```

Example:

```text
D:/新建文件夹/5魔/元件_136/config.json
```

Character asset modes:

- `assembled`: assembled character assets. Major parts may already contain designed static or animated states, such as walking/running/sitting/standing legs. Prefer preserving those larger parts.
- `discrete`: discrete character assets. Each body part has one or only a few images, and walking/running should use predefined actions in the downstream app.

Choose export level by whether it can produce usable standard body parts, not by exporting as deeply as possible:

- Level 1: use only for whole-object assets or roots with no useful internal structure.
- Level 2: default for characters. Use when direct children already represent usable body parts.
- Level 3: use only when Level 2 exposes containers that must be opened to reach standard body parts. If Level 3 produces fingers, facial fragments, clothing patterns, decoration shards, or other over-fine pieces, fall back to Level 2 or ask the user to confirm.

Use the helper planner for character decisions:

```bash
node <skill-dir>/scripts/faa-character-plan.js --frame 18 --out D:/exports --flaPath D:/work/5魔.fla
node <skill-dir>/scripts/faa-character-plan.js --frame 18 --out D:/exports --flaPath D:/work/5魔.fla --requireAssetKind
node <skill-dir>/scripts/faa-character-plan.js --frame 18 --out D:/exports --flaPath D:/work/5魔.fla --all
node <skill-dir>/scripts/faa-character-plan.js --frame 18 --mode assembled --layerIndex 0 --elementIndex 0 --out D:/exports/HeroA
```

The planner only inspects the open document and prints a JSON plan. It does not modify the FLA.

Each plan includes `output.configPathHint`, which predicts the normal config location after export. Pass `--flaPath` or `--flaName` to let the planner compute the effective FLA subfolder. This is a hint only: if the target folder already exists, the plugin may append a unique suffix to avoid overwriting.

Use `--requireAssetKind` when a wrapper wants the planner to report `unknown-asset-kind` unless the caller explicitly supplied `--assetKind character`. Use `--all` when the user has explicitly asked to export all matching stage roots; otherwise multiple roots are reported as needing confirmation.

Planner output includes `confirmation.needsUserConfirmation`. If it is true, ask the user before exporting unless the user already provided the missing decision explicitly. Common reasons are:

- `unknown-asset-kind`: the caller required an explicit asset kind but none was provided.
- `multiple-stage-roots`: multiple roots match and the user did not explicitly ask to export all.
- `ambiguous-character-mode`: the planner cannot decide whether the character is assembled or discrete.
- `level-3-overfine-risk`: Level 3 is recommended and may produce over-fine parts.
- `low-confidence-standard-name`: one or more standard-name suggestions rely on weak signals.
- `duplicate-standard-name`: multiple parts would resolve to the same standard name.

## Character Standard Names

For character standardization, use these names so AIWeb predefined actions and the character editor can resolve targets by alias/name:

```text
身体
头部
表情
面部
头发
左上臂
左下臂
右上臂
右下臂
左臂
右臂
左大腿
左小腿
右大腿
右小腿
左腿
右腿
双腿
```

Do not use `腿部`. For assembled characters, if both legs are already one designed static or animated part, name it `双腿` and do not force it into `左腿` / `右腿`. For discrete characters, prefer `左腿` / `右腿`, and use thigh/calf names only when the assets are genuinely separated.

Hair naming is a special case. AIWeb predefined action recommended names include `头发`, but render-chain/layering workflows may legitimately use `前发` and `后发`.

- If the exported character has only one hair layer or one hair container, name it `头发`.
- If both front-hair and back-hair parts are present, keep them as `前发` and `后发`; do not rename both to `头发`, because AIWeb resolves action targets by exact `alias` / `name` and duplicate names become ambiguous.
- If the source structure has a parent container that groups front and back hair, the parent may be `头发` while the children remain `前发` and `后发`.
- Treat `前发` and `后发` as render-layer detail names, not predefined-action target names. They should not replace `头发` unless both layers need to be preserved separately.

Do not rely on image appearance alone for left/right naming. Use all available signals:

- source layer, instance, and library names;
- exported `config.json` node positions and sizes;
- image contents when available;
- body or full-character centerline;
- user-provided confirmation.

For exported configs, compute a part visual center from `instanceTransform.registrationPoint`, `width`, and `height`, then compare it to the body centerline. Low-confidence left/right or upper/lower assignments must be reported as needing user confirmation.

AIWeb import uses `config.json` node names directly. During config import, each symbol and composite node's `name` becomes both the SceneObject `name` and `alias`; frame image paths are resolved separately from `frames[].path`. Therefore, standardizing exported part names normally only requires editing `config.json` node `name` fields. Do not rename PNG folders or files unless every matching `frames[].path` is updated too.

After export, use the normalizer to inspect and optionally apply standard names:

```bash
node <skill-dir>/scripts/faa-normalize-character-export.js --config D:/exports/Hero/config.json
node <skill-dir>/scripts/faa-normalize-character-export.js --config D:/exports/Hero/config.json --apply
node <skill-dir>/scripts/faa-normalize-character-export.js --dir D:/exports/characters --apply
```

For multi-character export roots, pass the shared output root with `--dir`; the normalizer will process all child `config.json` files recursively if no direct `config.json` exists at that root.

Do not create `.bak` files during routine or batch exports. The normalizer does not create backups by default; pass `--backup` only for manual experiments where a backup is explicitly useful.

After character export, verify and summarize:

- number of `config.json` files and PNG files;
- per-root export level and whether it matched the plan;
- standard-name coverage and applied normalizer changes;
- duplicate `name` / `alias` risk within each character root;
- forbidden names such as `腿部`;
- hair policy: single `头发` versus split `前发` / `后发`;
- unusually long frame sequences that may make AIWeb import heavy.

Future character batch automation should live in a skill-side script such as `faa-export-character-batch.js`: open FLA, scan, plan roots, export each root with `export-stage-one`, resume incomplete batches, run the normalizer, verify outputs, and write an export report. Keep this workflow outside the plugin so the plugin remains a generic scan/export executor. Multi-frame scene-template batches are handled by `scripts/faa-export-multiframe-scenes.js`.

## Error Handling

- `PLUGIN_OFFLINE`: Ask the user to open Animate and the plugin panel.
- `AGENT_CONTROL_DISABLED`: Ask the user to enable `允许外部工具控制`.
- `PLUGIN_BUSY`: Wait and query `job`; cancel only with user approval.
- `FAA_CLI_BUSY`: Another CLI command is running; retry later or use `--wait-lock <seconds>`.
- `EXPORT_PATH_NOT_ALLOWED`: Choose an output path inside the export root.
- `METHOD_NOT_ALLOWED`: Do not retry with unsupported plugin methods.
- `HOST_ERROR`: Report the plugin/Animate error and stop that file.
