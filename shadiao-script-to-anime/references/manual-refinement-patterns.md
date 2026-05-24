# Manual Refinement Patterns

Use this reference when a user asks the skill to learn from a hand-edited `.anime` episode or asks for an output closer to a finished 沙雕动画小助手 project. Treat it as advanced/manual-refinement guidance. Default generated refined episodes should stay lightweight unless the user explicitly asks for richer action layers.

## Local Reference Episode

Reference file: `自制短剧/庶子闯科举.anime`

Hand-edited first episode observed shape:

- Episode title: `定远侯府 第1集：池底亡魂`
- 5 scenes, 45 script blocks, duration field about 283 seconds
- Scene rhythm: short cold open, memory/conflict setup, interrogation/comedy beat, dinner/contrast beat, study/dream hook
- Refined blocks use actions throughout; no block is merely spoken text on a static setup

Observed advanced action vocabulary:

- Camera: `camera_follow`, `camera_move`, `camera_cut`
- Character/object state: `set_anim`, `set_transform`, `tween_transform`, `set_material`, `set_visual`, `set_lifecycle`
- Atmosphere and media: `set_audio`, `set_light`, `tween_light`, `set_mask`, `set_text`, `set_scene_structure`, `tween_screen_effect`

Default generated refined pass:

- Generate only `camera_follow` and `set_anim`.
- Keep ambient light objects at `lightIntensity: 1`.
- Do not generate `set_light`, `set_audio`, `set_lifecycle`, `set_transform`, `tween_transform`, `set_material`, `set_visual`, masks, text, screen effects, props, or camera move/cut unless explicitly requested.
- Preserve audio/visual intent in `productionNote` when the default action whitelist cannot represent it.

Use AIWeb defaults when generating new `camera_follow` actions:

```json
{
  "target": "camera",
  "type": "camera_follow",
  "category": "duration",
  "slotSpan": 1,
  "easing": "linear",
  "params": {
    "followTarget": "<scene object id>",
    "damping": 0,
    "offsetX": 0,
    "offsetY": -50,
    "zoom": 1,
    "constrainBounds": true
  }
}
```

Do not emit `smoothEntry`, `smoothEntryDuration`, or speaker-specific zoom values by default. Those are style choices, not AIWeb defaults.

Do not automatically create `camera_shake`. Reserve it for rare, explicitly requested beats such as a named impact, explosion, collapse, or shock moment. In default refined mode, prefer `camera_follow` plus `set_anim`; use camera cuts/moves, lights, masks, screen effects, or material changes only when the user explicitly asks for richer animation.

Observed scene object vocabulary:

- Template/background composites and symbols
- Character composites with expression children
- `prop` objects for bowls, books, food, rain/water/impact effects, candle/fire elements, and hand props
- `audio` objects for footsteps, ambient crowd, eating/dinner noise, fire, rooster, and punchline effects
- `light`, `mask`, and `screen_effect` objects for focus, flashback, dream, and awakening beats

## Transferable Rules

Keep the spoken script self-sufficient. The refined pass improves watchability, but the story must still make sense if actions are removed.

Preserve source provenance. If a source script row is split into multiple animation blocks, copied into a neighboring scene, or merged with the ending hook, keep `productionNote.sourceIndex`, `sourceRange`, or `derivedFrom`.

Segment scenes by place first. Treat a scene as an editable location setup, not as a screenplay beat label. Keep a continuous same-location exchange in one scene even when it moves from hook to conflict, conflict to escalation, or escalation to punchline. Prefer camera focus, actor visibility, entrance/exit motion, light changes, and production notes to express those internal turns.

Merge over-split same-location beats. A scene with only 1-3 script blocks should usually be folded into the previous or next scene unless it has a real place change, a clear time jump, a full layout reset, or a substantially different cast/object setup. Adjacent titles such as `花园：月洞门偶遇` and `花园：最扎心名场面` should usually become one `花园/月洞门` scene because the audience experiences them as one continuous location.

Use the scene title and every row's `画面配合` / `音效/BGM` as action cues for focus/animation selection. Do not create non-whitelisted actions from those cues unless explicitly requested.

Treat every line as one lightweight visual beat in default refined mode:

- Dialogue: focus camera on speaker and choose an existing talk/reaction animation.
- Narration with a named role: focus the named role and add an existing character animation.
- Pure atmosphere narration: focus the nearest relevant actor or scene subject with `camera_follow`; keep unsupported atmosphere detail in `productionNote`.
- Memory/dream narration: use only camera focus and existing character animation by default; add masks, screen effects, or light changes only on explicit request.

Prefer existing assets over generated placeholders. Search current project assets and scene templates first. If no fitting asset exists, leave a warning and a `productionNote` for manual replacement.

When adding objects during advanced/manual refinement, follow AIWeb's creation paths:

- Setup-mode resource objects should mirror `sceneObjectStore.create*Object()` defaults.
- Action-mode dynamic objects should mirror `createShadowObject()`: setup object `spawned: false`, plus a current-slot `set_lifecycle` action with `spawned: true` and `autoDespawnOnBlockEnd: true`.
- Actors and reusable scene groups should be instantiated from `compositeCharacters` or `sceneTemplates`, not cloned from a prior scene instance.

Use `画外音` deliberately. Keep dialogue as dialogue when the role is known. Bind it to an actor instance; if the speaker should not be visible, make it offscreen or hidden and annotate `productionNote.delivery = "voiceover"`.

## Suggested Cue Mapping

Awakening, shock, pain, or sudden realization:

- `set_anim` to an existing surprise/open-eye/recoil animation when present
- `camera_cut` or tight `camera_follow`
- optional `screen_effect`, `tween_screen_effect`, or quick light change

Memory flashback, drowning, dream, or hidden murder:

- add water/dream/mask/screen-effect objects if available
- dim or tint light via `set_light` / `tween_light`
- split long narration into multiple blocks when it contains separate images

Entrance, footsteps, opening door, or someone arriving:

- add/reuse footstep or door audio objects
- use `set_lifecycle` to reveal entering actors or props
- use `tween_transform` for short movement into frame

Interrogation or verbal reversal:

- alternate `camera_follow` between speakers
- use subtle expression or material swaps for embarrassment, fear, or frozen smile
- keep camera movement restrained so the joke lands on the line

Food, medicine, study, or object business:

- instantiate matching props when available: bowl, tray, book, candle, food, chopsticks
- use `set_transform`, `set_lifecycle`, or `set_scene_structure` to bring props into the actor's hand/table area
- add matching audio only when it helps the beat

Night, lamp, study, or ending hook:

- add candle/fire/light props when available
- use `set_audio` for watchman, fire, rooster, or low BGM cues
- end with a deliberate camera cut/move and a simplified final composition

## Validation Expectations For Refined Mode

A default refined episode should report:

- valid dialogue `instanceId` values
- valid actor `characterId` values
- no empty scenes or empty scripts
- action targets resolving to `camera` or scene object IDs
- action type counts limited to `camera_follow` and `set_anim`
- ambient light objects with `lightIntensity: 1`
- warnings for blocks without `productionNote`
- warnings for refined blocks with no actions
