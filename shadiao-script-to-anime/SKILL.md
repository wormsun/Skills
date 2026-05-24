---
name: shadiao-script-to-anime
description: Convert production-ready 沙雕动画小助手 script tables into playable .anime project episodes with scenes, narration/dialogue blocks, actor bindings, scene object instances, and lightweight refined actions by default, plus validation reports. Use when Codex needs to take an existing script markdown or storyboard table and build or update a 沙雕动画小助手 animation project rather than rewrite the story script; default refined output should generate only camera_follow and set_anim actions, keep ambient light intensity at 1.0, and expand to props/audio/lights/effects/transform actions only when explicitly requested.
---

# Shadiao Script To Anime

Use this skill after the writing stage is finished and the task is to turn a production script into a usable `.anime` project.

## Scope

This skill handles:

- Parsing markdown episode tables with `旁白/对白`, `画面配合`, and `音效/BGM` columns.
- Creating or replacing `.anime` `episodes`, `scenes`, and script blocks.
- Binding dialogue blocks to actor scene instances.
- Reusing existing `actors`, `narrator`, `compositeCharacters`, and `sceneTemplates`.
- Auto-creating missing actors from suitable existing `compositeCharacters` when new dialogue speakers appear.
- Selecting only from existing project backgrounds or scene templates.
- Preserving existing voice settings unless the user explicitly asks to change voices.
- Configuring a missing project-level `narrator.voice` from the supported voice catalog.
- Checking actor `voice.voiceId` uniqueness and supported voice IDs during validation.
- Creating editable scene setups first, then generating a refined action pass by default.
- Creating lightweight block `actions` by default so the episode is playable, not merely a static script import.
- Reviewing and preserving sensible scene segmentation, with scene boundaries driven mainly by place changes instead of mechanical story beats.
- Keeping default refined actions limited to `camera_follow` and `set_anim` unless the user explicitly asks for props, audio, lights, masks, screen effects, transforms, or other advanced animation.
- Generating validation reports for empty scenes, missing actors, broken character IDs, duplicate actor character bindings, missing materials, duplicate generated episodes, action coverage, action target validity, object type coverage, and production-note coverage.

This skill does not rewrite novels into scripts. Use `novel-to-shadiao-script` for that earlier stage.

## Workflow

1. Back up the `.anime` file before writing.
2. Read the script markdown and parse only production tables.
3. Read the target `.anime` project.
4. If the user references a hand-edited `.anime` episode, inspect it first and extract its scene count, block count, object types, action types, actor layout, prop/audio usage, and scene-level pacing before generating new content.
5. Resolve roles:
   - Prefer existing `actors` by name.
   - Prefer the actor's current `characterId` and voice.
   - When a dialogue speaker is not listed in the scene's actor list, add that speaker to the scene automatically unless `autoAddDialogueSpeakers: false`; do not treat non-actor labels such as `旁白`, `叙述`, `解说`, or `字幕` as actors.
   - When an actor does not exist yet, create it from an existing `compositeCharacters` resource unless `autoCreateActors: false`.
   - Choose missing actors' character resources in this order: explicit `roleToCharacterMap` / `actorCharacterMap`, exact or fuzzy character name/alias/title match, role-keyword match such as 少爷/丫鬟/嬷嬷/小厮/侍卫, then the first unused character resource as a fallback.
   - Do not reuse a `characterId` for multiple actors by default. Reuse only when the user/config explicitly sets `allowCharacterReuse: true`.
   - For newly created actors, use an explicit `actorVoiceMap` / `roleToVoiceMap` first, then the selected character's `voice`, then `defaultActorVoice` / `defaultActorVoiceId`, then a role-appropriate unused voice from `references/voice-options.json`.
   - Do not reuse an actor `voice.voiceId` by default. Reuse only when the user/config explicitly sets `allowVoiceReuse: true`.
   - If project-level `narrator.voice` is missing, configure it from `defaultNarratorVoice` / `defaultNarratorVoiceId`, or fall back to the catalog narrator default.
6. Pick scene templates or backgrounds by scene title from existing project assets only.
   - Divide animation scenes mainly by actual place changes, such as courtyard, garden, clan school, bedroom, hall, or ancestral hall.
   - Do not split a continuous same-location exchange merely because the script moves from hook to conflict, conflict to escalation, or escalation to punchline.
   - Merge very short same-location beats into the neighboring scene when camera moves, visibility changes, actor entrances/exits, or lighting changes can express the transition inside one editable scene.
   - Consider a split inside the same place only when there is a clear time jump, a whole-scene layout reset, a substantially different cast/object set, or a tool/performance reason to isolate the setup.
7. Instantiate scene template objects, then instantiate actor character objects into the scene.
   - A generated scene visual can come from a scene template (`templateId`) or a background asset (`backgroundId` / `backgroundName`).
   - Instantiate actors from the actor's `compositeCharacters` library definition. Do not clone actor objects from a prior/source scene.
   - For scene objects created from plain resource assets, mirror AIWeb's `sceneObjectStore.create*Object()` defaults instead of cloning a similar object from another scene.
   - Use AIWeb z-index defaults: background `-10`, camera `-5`, ordinary objects/actors/props/expressions/symbols/composites `10`, text `100`, and lights/screen effects `1000`.
   - Center newly instantiated scene template root objects and background objects in the current camera view by default.
   - Use full-strength ambient light by default (`lightIntensity: 1`) unless the user explicitly asks for a different value.
   - Do not add `set_light` or other actions that temporarily change ambient light intensity during default refined generation.
   - Normalize every newly inserted actor root before block/action generation: set `rotation: 0`, `scaleX: 1`, `scaleY: 1`, `visible: true`, and `spawned: true`.
   - Place newly inserted actor roots in the current camera view by default. Use a simple horizontal distribution around the camera center, with enough spacing that actor roots do not stack on `x=0,y=0` or overlap each other.
   - Insert every actor character at the default 100% size: set the actor root object's `scaleX` and `scaleY` to `1`.
   - Do not shrink or enlarge actor characters for multi-person composition. Keep the scale at 100% even when many actors appear in the same scene.
   - Do not inherit source-scene actor rotation or off-canvas position unless the user explicitly asks to preserve a hand-edited layout.
   - Do not inherit source-scene actor expression/material/visibility/layer state by default. The character library definition is the default source of truth for actor parts and expression defaults.
   - Do not apply special multi-person depth scaling, crowd scaling, or size presets. The default layout is plain readable placement; the user can manually refine composition later.
8. Create line-level script blocks:
   - `旁白：` rows become `narration`.
   - Dialogue rows become `dialogue` with `instanceId`.
   - Initialize block `actions` arrays during block creation, then populate them in the default refined pass.
   - Leave `actions: []` only when the user explicitly asks for "静态导入", "只导入台词", "不要动作", or equivalent static-only wording.
   - Keep the original visual/audio notes in a non-rendering `productionNote` field.
   - If one source row is split into multiple animation blocks, preserve provenance with `productionNote.sourceIndex`, `sourceRange`, or `derivedFrom` instead of dropping the note.
9. Generate the lightweight refined animation pass by default after scene and block creation:
   - Add at least one useful visual/action beat to every playable block whenever matching targets/assets exist.
   - For dialogue blocks, add speaker-oriented `camera_follow` and a speaking/listening `set_anim` when the instantiated character exposes a suitable existing animation such as `说话`, `说话-点头`, `点头`, `头部多角度运动`, or an equivalent project-local speaking motion.
   - For narration blocks, add `camera_follow` on the current visual subject and `set_anim` on a relevant instantiated character when one exists.
   - Add camera focus on the current speaker or visual subject for most blocks.
   - In default refined mode, do not generate action types other than `camera_follow` and `set_anim`.
   - Do not automatically create `camera_shake`. Use it only when the user explicitly asks for a specific shake beat, because it is a rare special-effect action rather than a normal adaptation default.
   - Add `set_anim` only from animations already present on that instantiated character.
   - Add props, audio objects, lights, masks, screen effects, transforms, and visual/material switches only when the user explicitly asks for those richer action layers, and only from existing project assets.
   - Do not translate audio notes into `set_audio` actions in default refined mode. Preserve audio intent in `productionNote`; generate audio actions only when the user explicitly asks for audio objects/effects.
   - Every generated block action must include `slotIndex`; use `slotIndex: 0` by default when the action starts at the beginning of the block. Duration actions must also include a positive `slotSpan`.
   - Use AIWeb's UI defaults for generated `camera_follow`: `category: "duration"`, `slotIndex: 0`, `slotSpan: 1`, `easing: "linear"`, `params.followTarget`, `params.damping: 0`, `params.offsetX: 0`, `params.offsetY: -50`, `params.zoom: 1`, and `params.constrainBounds: true`. Do not add `smoothEntry` or speaker-specific zoom unless the user explicitly asks for that style.
   - When explicitly generating dynamic object insertion in Action Mode, mirror AIWeb's `createShadowObject()` pattern: add a setup object with `spawned: false`, then create a point `set_lifecycle` action at the current slot with `params.spawned: true` and `params.autoDespawnOnBlockEnd: true`.
   - When explicitly generating `set_transform`, `set_material`, `set_audio`, `set_light`, `set_text`, or screen-effect actions, write only the changed action params that AIWeb would create for that edit; do not serialize a full object snapshot into an action.
   - Preserve visual/audio intent in `productionNote` even when the action pass makes it visible.
   - If a line cannot receive a meaningful action because no target or asset exists, keep `actions: []` for that block and add a clear warning/provenance note instead of inventing unsupported objects.
10. Replace prior generated episodes for the same work, and remove stale empty placeholder episodes when appropriate.
11. Validate in refined mode by default, then report counts, action coverage, unresolved action opportunities, and any blocks left without actions.

## Refined Animation Reference

When the user asks to learn from the hand-edited `自制短剧/庶子闯科举.anime` first episode, treat it as the local quality target:

- First episode shape: 5 scenes, 45 script blocks, about 283 seconds.
- Every block has at least one visual/action beat in the refined version when an appropriate target exists.
- Common action vocabulary includes `camera_follow`, `camera_move`, `camera_cut`, `set_anim`, `set_transform`, `tween_transform`, `set_material`, `set_visual`, `set_lifecycle`, `set_audio`, `set_light`, `set_mask`, `set_text`, `set_scene_structure`, `tween_light`, and `tween_screen_effect`.
- Scene setups are not just actors on a background: they include targeted props, audio objects, lights, masks, and screen effects when the line calls for them.
- The strongest manual edits are pacing edits: a source row may be split for flashback impact, neighboring rows may be pulled into the previous scene for continuity, and ending lines may be merged for a stronger hook. Track source provenance when doing this.
- Default refined mode should still keep narration/dialogue self-sufficient. Actions make the episode watchable; they must not carry plot information that is missing from spoken text.
- Treat the broader action vocabulary as an advanced/manual-refinement reference, not the default generated action set. Default generated refined episodes should stay lightweight with only `camera_follow` and `set_anim`.

See `references/manual-refinement-patterns.md` for the detailed transferable rules and cue mappings extracted from this hand-edited episode.

## Safety Rules

- Always preserve `narrator.voice`.
- Do not overwrite an existing actor's `voice` unless the user asks to change配音.
- For auto-created actors, use only voice IDs listed in `references/voice-options.json`; prefer unused voices and record warnings when an explicit requested voice is unavailable or already used.
- Do not overwrite an existing actor's duplicate voice automatically; validation should report duplicate actor `voice.voiceId` values so the project can be corrected deliberately.
- Do not change composite character structure during episode generation.
- Do not delete unrelated episodes unless they are known generated placeholders or have the same generated title prefix.
- Do not auto-generate backgrounds, SVG backgrounds, scene templates, or placeholder visual assets during script-to-anime conversion. If no suitable existing background or scene template is available, record a warning and choose the closest existing option, or leave a clear `productionNote` for manual scene replacement.
- Do not use a prior scene instance as the clone source for actors or ordinary scene objects. Prefer library data (`compositeCharacters`, `sceneTemplates`, and asset stores) and AIWeb creation defaults.
- Do not set generated actor root objects below or above 100% size during import or refined generation. Newly inserted actor roots must keep `scaleX: 1` and `scaleY: 1`; only non-actor props, scene-template objects, or explicit user-requested edits may use other scales.
- Do not leave generated actor roots at `x: 0, y: 0`, off-canvas, overlapping by default, or with inherited nonzero rotation. Normalize and place them plainly in the camera view.
- Do not force generated actor root z-index above AIWeb defaults. Preserve the character-library z-index or use ordinary-object default `10`.
- Do not automatically adjust actor size for group shots or crowded scenes. Place actors plainly with spacing and leave composition polish to manual refinement.
- The default workflow includes a lightweight refined animation pass. Create only `camera_follow` and `set_anim` by default. Create `camera_move`, `camera_cut`, `set_transform`, `tween_transform`, `set_material`, `set_visual`, `set_lifecycle`, `set_audio`, `set_light`, `set_mask`, `set_text`, `set_scene_structure`, `tween_light`, `tween_screen_effect`, or similar advanced actions only when the user explicitly asks for the richer layer and their schemas are already observed in the target project or a referenced hand-edited episode.
- Keep every generated ambient light object at `lightIntensity: 1`. Do not generate `set_light` actions or dim/brighten ambient light unless the user explicitly requests lighting changes.
- Support a static-only import only when the user explicitly requests it. In static-only mode, keep generated block `actions: []` and validate with the static profile.
- In refined mode, every action target must resolve to `camera`, `_scene_`, or an object in the same scene.
- Do not create `camera_shake` in the refined animation pass unless the user explicitly asks for camera shake at a named moment.
- Do not invent action schemas. Reuse action shapes already present in the target project or the hand-edited reference episode.
- Do not use generated SVG backgrounds as a shortcut for missing environments. Prefer existing scene templates and existing asset folders.
- If a dialogue role has no actor/character and no suitable existing character resource can be selected, generate a warning instead of silently converting it to an unsupported actor.
- Handle `画外音` dialogue deliberately: bind it to the actor when the character should be present; otherwise create or reuse an offscreen actor instance and note `delivery: "voiceover"` in `productionNote`.
- Keep generated output editable: store clear scene objects, script blocks, action beats, and `productionNote` metadata.

## Scripts

Project-specific scripts may live under `tools/`. For this repository, use:

```powershell
node tools/build_dingyuan_episodes.mjs
```

Reusable build primitives live in:

```text
skills/shadiao-script-to-anime/scripts/build_anime_core.mjs
```

Then validate:

```powershell
node skills/shadiao-script-to-anime/scripts/validate_script_to_anime.mjs --anime=.\庶子闯科举.anime
```

Validate generated episodes in refined mode by default:

```powershell
node skills/shadiao-script-to-anime/scripts/validate_script_to_anime.mjs --anime=.\庶子闯科举.anime --profile=refined
```

Supported voice IDs are listed in:

```text
skills/shadiao-script-to-anime/references/voice-options.json
```

Validate the default lightweight refined profile with action and light constraints:

```powershell
node skills/shadiao-script-to-anime/scripts/validate_script_to_anime.mjs --anime=.\庶子闯科举.anime --profile=refined --allowed-actions=camera_follow,set_anim --require-light-intensity=1
```

Use the static profile only for explicit static-only imports:

```powershell
node skills/shadiao-script-to-anime/scripts/validate_script_to_anime.mjs --anime=.\庶子闯科举.anime --profile=static
```

## Quality Gate

Before final response, confirm:

- The expected episode count and scene count were created.
- No generated scene is empty.
- Scene visuals come from existing backgrounds or scene templates; no new generated background/template assets were created.
- Dialogue blocks have valid `instanceId` values.
- Default refined-animation blocks have valid action targets, useful action coverage, and no unknown action shapes invented outside the project's observed schema.
- Every block action includes a valid non-negative integer `slotIndex`; duration actions also include a positive `slotSpan`.
- Default refined-animation action types are limited to `camera_follow` and `set_anim` unless the user explicitly requested a richer action layer.
- Dialogue blocks usually include a speaker `camera_follow` and a valid existing speaking/listening `set_anim` when the actor supports one.
- Static-import blocks have empty `actions` arrays only when the user explicitly asked for static-only output.
- Props, audio, lights, masks, screen effects, transforms, and visual/material actions are absent in default refined mode unless the user explicitly requested them.
- Every generated ambient light keeps `lightIntensity: 1`, and no `set_light` action is present by default.
- Source provenance is preserved in `productionNote`, including split/merged source rows.
- Scene boundaries are justified by location changes or a clear same-location reset; adjacent same-location scenes and 1-3 block micro-scenes have been reviewed and merged when practical.
- Narration blocks preserve narrator voice indirectly by leaving `narrator` unchanged.
- If `narrator.voice` was missing, it has been configured with a supported catalog voice.
- Actor `characterId` values are valid.
- Multiple actors do not share the same `characterId`.
- Auto-created actors, if any, use existing `compositeCharacters` only and record their selection in `actor.extraInfo`.
- Actor `voice.voiceId` values are supported and not duplicated across actors unless the user explicitly allowed voice reuse.
- Newly inserted actor root objects keep `rotation: 0`, `scaleX: 1`, and `scaleY: 1`; no generated actor appears with inherited tilt, left-top default placement, or a UI size below or above 100% unless the user explicitly requested it.
- Newly inserted actors have readable initial spacing in the camera view and are not all stacked on the same position.
- The generated episode titles are not duplicated.
- A backup path and validation summary are reported.
