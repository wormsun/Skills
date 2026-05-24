---
name: anime-asset-importer
description: Import exported Funny Animation Assistant / AIWeb assets into .anime project files. Use when Codex needs to register asset folders or files into an .anime project, especially scene templates exported as config.json + PNG folders, composite characters, expressions, props, backgrounds, sounds/BGM, or when batch-importing assets from 自制短剧 resource directories after Adobe Animate export.
---

# Anime Asset Importer

Use this skill to modify `.anime` project JSON so exported assets become project-level resources. It is for registration/import work after assets already exist on disk. Use `funny-animation-assistant` first when FLA files still need to be scanned or exported.

## Quick Start

Run the bundled importer from the skill directory:

```powershell
node .agents/skills/anime-asset-importer/scripts/import_anime_assets.mjs `
  --anime "D:/Study/AIGC/项目/BaiduSyncdisk/自制短剧/庶子闯科举.anime" `
  --kind scene-template `
  --input "D:/Study/AIGC/项目/BaiduSyncdisk/自制短剧/场景模板" `
  --recursive `
  --onDuplicate skip
```

The script backs up the `.anime` file by default, writes only valid JSON, and prints a summary. Use `--dryRun` before large imports.

## Workflow

1. Confirm the target `.anime` file and asset kind.
2. Confirm the assets live under the same project folder as the `.anime` file. AIWeb stores relative paths; paths outside the project root will be written as `../...` and usually cannot load in the app.
3. For config-based assets, prefer standard directories shaped as `<assetName>/config.json`. If a Funny Animation Assistant export produced `<assetName>/<genericStageName>/config.json`, re-export with `--out <parentRoot> --name <assetName>` or flatten the generated subfolder before import.
4. Use `--dryRun` on the first pass.
5. Import with `--onDuplicate skip` unless the user explicitly wants replacement.
6. Validate the result by reopening/parsing the `.anime` JSON and checking counts.

## Supported Kinds

- `scene-template`: imports folders containing `config.json` into top-level `sceneTemplates[]`.
- `character`: imports `config.json` folders into top-level `compositeCharacters[]`; pass `--gender male|female|other` when known.
- `background`: imports image folders/files into `assets.backgrounds[]`.
- `prop`: imports image folders/files into `assets.props[]`.
- `sound` / `sfx` / `bgm`: imports audio files into `assets.sounds[]`.
- `expression`: imports image folders/files into top-level `expressions{}`; the first image is the default frame, remaining images become speaking frames.

Scene templates and characters use the same conversion rules as AIWeb's `src/utils/configImporter.ts`: `config.json` is parsed, frame paths are resolved relative to the config folder, symbol materials are self-contained on `symbol` scene objects, and composite objects use `entity` mode by default.

## Important Options

- `--input <path>`: repeatable. Can point to an asset folder, a `config.json`, a directory containing many asset folders, or a single media file for simple assets.
- `--recursive`: find nested `config.json` files or nested simple media files.
- `--onDuplicate skip|replace|keep`: default `skip`. Duplicate detection uses resource name.
- `--tags "古代,场景"`: optional comma-separated tags.
- `--dryRun`: report what would change without writing.
- `--noBackup`: skip automatic backup only when the user explicitly asks.
- `--projectRoot <path>`: override the default project root, which is the `.anime` file's directory.

## AIWeb References

Read `references/aiweb-import-map.md` when changing importer behavior or adding a new asset kind. It lists the source files in `D:/Study/AIGC/AIWeb/as.aitalk.cloud` that define import behavior and `.anime` schema.

## Safety

- Always preserve unrelated `.anime` content: episodes, actors, narrator, existing assets, and custom preset animations.
- Never rewrite media files during import; only register relative paths in the `.anime` JSON.
- Back up before writing unless the user explicitly disables it.
- Prefer `skip` duplicates for batch imports. Use `replace` only when the user wants existing resources with the same names overwritten.
