# AIWeb Import Map

Use these files as the source of truth when maintaining the importer:

- `D:/Study/AIGC/AIWeb/as.aitalk.cloud/src/utils/configImporter.ts`
  Converts exported `config.json` trees into flat `SceneObject[]`.
- `D:/Study/AIGC/AIWeb/as.aitalk.cloud/src/components/SceneTemplateEditor.vue`
  UI flow for importing a `config.json` into a scene template editor.
- `D:/Study/AIGC/AIWeb/as.aitalk.cloud/src/components/CompositeCharacterEditor.vue`
  UI flow for importing a `config.json` into a composite character editor.
- `D:/Study/AIGC/AIWeb/as.aitalk.cloud/src/utils/sceneTemplateEngine.ts`
  Snapshot and template normalization rules.
- `D:/Study/AIGC/AIWeb/as.aitalk.cloud/src/utils/renderChainUtils.ts`
  Render-chain rules for root scene chains and entity composite chains.
- `D:/Study/AIGC/AIWeb/as.aitalk.cloud/src/types/sceneTemplate.ts`
  `SceneTemplate` shape.
- `D:/Study/AIGC/AIWeb/as.aitalk.cloud/src/types/compositeCharacter.ts`
  `CompositeCharacter` shape.
- `D:/Study/AIGC/AIWeb/as.aitalk.cloud/src/types/project.ts`
  `Background`, `PropAsset`, `SoundAsset`, `Expression`, and project data shapes.
- `D:/Study/AIGC/AIWeb/as.aitalk.cloud/src/stores/projectStore.ts`
  `.anime` save/load field placement.
- `D:/Study/AIGC/AIWeb/as.aitalk.cloud/src/constants/canvas.ts`
  Canvas and camera constants. Current physical canvas is `6720x2800`, center is `3360,1400`, and camera base viewport is `1456x819`.

Current field placement in `.anime`:

- `sceneTemplates`: top-level array.
- `compositeCharacters`: top-level array.
- `expressions`: top-level object keyed by expression id.
- `assets.backgrounds`: array.
- `assets.props`: array.
- `assets.sounds`: array.

Config folder rules:

- `config.json` version must satisfy `ver2.0.0` or newer.
- Frame paths are first matched relative to the config folder; old absolute/file URL paths can be resolved by suffix match.
- Persistent URLs stored in `.anime` must be slash-normalized relative paths from the project root.
- `symbol` objects are self-contained and store image materials directly; they do not use `assets.props`.
- Imported config-based resources should use `compositeMode: "entity"`.
- Entity composites need `renderChain`; root templates/characters also need a top-level `renderChain`.
