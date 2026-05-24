import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    anime: '',
    profile: 'static',
    allowActions: false,
    episodeNumber: null,
    allowedActions: null,
    requireLightIntensity: null,
  };
  for (const arg of args) {
    if (arg.startsWith('--anime=')) result.anime = arg.slice('--anime='.length);
    else if (arg.startsWith('--profile=')) result.profile = arg.slice('--profile='.length);
    else if (arg === '--allow-actions') result.allowActions = true;
    else if (arg.startsWith('--episode=')) result.episodeNumber = Number(arg.slice('--episode='.length));
    else if (arg.startsWith('--allowed-actions=')) {
      result.allowedActions = new Set(
        arg
          .slice('--allowed-actions='.length)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      );
    } else if (arg.startsWith('--require-light-intensity=')) {
      result.requireLightIntensity = Number(arg.slice('--require-light-intensity='.length));
    }
  }
  if (!result.anime) {
    console.error('Usage: node validate_script_to_anime.mjs --anime=<file.anime> [--profile=static|refined] [--allow-actions] [--episode=<number>] [--allowed-actions=camera_follow,set_anim] [--require-light-intensity=1]');
    process.exit(2);
  }
  if (!['static', 'refined'].includes(result.profile)) {
    console.error('Invalid --profile. Expected static or refined.');
    process.exit(2);
  }
  if (result.episodeNumber !== null && !Number.isInteger(result.episodeNumber)) {
    console.error('Invalid --episode. Expected an integer episode number.');
    process.exit(2);
  }
  if (result.requireLightIntensity !== null && !Number.isFinite(result.requireLightIntensity)) {
    console.error('Invalid --require-light-intensity. Expected a number.');
    process.exit(2);
  }
  return result;
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function sortedObject(map) {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function normalizeScenePlace(title = '') {
  const raw = String(title)
    .replace(/^第?\d+集[-－]?\d*\.?\s*/u, '')
    .replace(/^[\d一二三四五六七八九十]+[.、]\s*/u, '')
    .split(/[：:]/u)[0]
    .trim();
  return raw
    .replace(/[\/／].*$/u, '')
    .replace(/[门口内外上下前后]$/u, '')
    .replace(/\s+/gu, '');
}

function loadVoiceCatalog() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const catalogPath = path.resolve(scriptDir, '..', 'references', 'voice-options.json');
  try {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    return {
      path: catalogPath,
      voices: Array.isArray(catalog.voices) ? catalog.voices : [],
    };
  } catch (error) {
    return {
      path: catalogPath,
      voices: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function voiceIdOf(voice) {
  if (voice === null || voice === undefined || voice === '') return '';
  if (typeof voice === 'string' || typeof voice === 'number') return String(voice);
  if (typeof voice === 'object' && voice.voiceId !== undefined && voice.voiceId !== null && voice.voiceId !== '') {
    return String(voice.voiceId);
  }
  return '';
}

const args = parseArgs();
const animePath = path.resolve(args.anime);
const data = JSON.parse(fs.readFileSync(animePath, 'utf8'));
const episodes = data.episodes || [];
const actors = data.actors || [];
const characters = data.compositeCharacters || [];
const voiceCatalog = loadVoiceCatalog();
const supportedVoiceIds = new Set(voiceCatalog.voices.map((voice) => String(voice.id)));

const characterIds = new Set(characters.map((character) => character.id));
const sceneProblems = [];
const dialogueProblems = [];
const actorProblems = [];
const narratorVoiceProblems = [];
const actorVoiceProblems = [];
const duplicateActorVoiceProblems = [];
const actorScaleProblems = [];
const duplicateActorCharacterProblems = [];
const actionProblems = [];
const actionWhitelistProblems = [];
const lightIntensityProblems = [];
const staticActionProblems = [];
const sceneSegmentationWarnings = [];
const warnings = [];
const titleCounts = new Map();
const actorCharacterCounts = new Map();
const actorVoiceCounts = new Map();
const allowedSpecialTargets = new Set(['camera', '_scene_']);
const actorIds = new Set(actors.map((actor) => actor.id).filter(Boolean));
const actorNames = new Set(actors.map((actor) => actor.name).filter(Boolean));

if (!voiceCatalog.voices.length) {
  warnings.push({
    type: 'voice_catalog_unavailable',
    path: voiceCatalog.path,
    error: voiceCatalog.error || 'No voices found',
  });
}

const narratorVoiceId = voiceIdOf(data.narrator?.voice);
if (!narratorVoiceId) {
  narratorVoiceProblems.push({ problem: 'missing narrator voiceId' });
} else if (supportedVoiceIds.size && !supportedVoiceIds.has(narratorVoiceId)) {
  narratorVoiceProblems.push({ problem: 'unsupported narrator voiceId', voiceId: narratorVoiceId });
}

for (const actor of actors) {
  if (!characterIds.has(actor.characterId)) {
    actorProblems.push({ actor: actor.name, characterId: actor.characterId });
  }

  const actorVoiceId = voiceIdOf(actor.voice);
  if (actorVoiceId) {
    if (supportedVoiceIds.size && !supportedVoiceIds.has(actorVoiceId)) {
      actorVoiceProblems.push({ actor: actor.name, voiceId: actorVoiceId, problem: 'unsupported actor voiceId' });
    }
    if (!actorVoiceCounts.has(actorVoiceId)) {
      actorVoiceCounts.set(actorVoiceId, []);
    }
    actorVoiceCounts.get(actorVoiceId).push(actor.name || actor.id || '<unnamed actor>');
  }

  if (!actor.characterId) continue;
  if (!actorCharacterCounts.has(actor.characterId)) {
    actorCharacterCounts.set(actor.characterId, []);
  }
  actorCharacterCounts.get(actor.characterId).push(actor.name || actor.id || '<unnamed actor>');
}

for (const [characterId, actorNames] of actorCharacterCounts.entries()) {
  if (actorNames.length > 1) {
    duplicateActorCharacterProblems.push({ characterId, actors: actorNames });
  }
}

for (const [voiceId, actorNames] of actorVoiceCounts.entries()) {
  if (actorNames.length > 1) {
    duplicateActorVoiceProblems.push({ voiceId, actors: actorNames });
  }
}

const episodeResults = [];

for (const episode of episodes) {
  if (args.episodeNumber !== null && episode.episodeNumber !== args.episodeNumber) continue;

  titleCounts.set(episode.name, (titleCounts.get(episode.name) || 0) + 1);

  const episodeActionTypes = new Map();
  const episodeObjectTypes = new Map();
  let episodeBlocks = 0;
  let episodeBlocksWithActions = 0;
  let episodeBlocksWithoutProductionNote = 0;

  const scenes = [];
  let previousSceneSummary = null;

  for (const scene of episode.scenes || []) {
    const objects = scene.setup?.objects || [];
    const objectIds = new Set(objects.map((object) => object.id));
    const blocks = scene.script || [];
    const sceneActionTypes = new Map();
    const sceneObjectTypes = new Map();
    let sceneBlocksWithActions = 0;
    let sceneBlocksWithoutProductionNote = 0;

    episodeBlocks += blocks.length;

    for (const object of objects) {
      increment(sceneObjectTypes, object.type || 'unknown');
      increment(episodeObjectTypes, object.type || 'unknown');

      const isActorRoot =
        object.type === 'composite' &&
        !object.parentId &&
        (object.extraInfo?.kind === 'actor' ||
          actorIds.has(object.extraInfo?.actorId) ||
          actorNames.has(object.name));
      if (isActorRoot) {
        const scaleX = object.scaleX ?? 1;
        const scaleY = object.scaleY ?? 1;
        if (scaleX !== 1 || scaleY !== 1) {
          actorScaleProblems.push({
            episode: episode.name,
            scene: scene.title,
            objectId: object.id,
            actor: object.name,
            scaleX,
            scaleY,
            problem: 'generated actor root must remain at 100% size',
          });
        }
      }
      if (
        args.requireLightIntensity !== null &&
        object.type === 'light' &&
        object.lightIntensity !== args.requireLightIntensity
      ) {
        lightIntensityProblems.push({
          episode: episode.name,
          scene: scene.title,
          objectId: object.id,
          lightIntensity: object.lightIntensity,
          expected: args.requireLightIntensity,
        });
      }
    }

    if (!objects.length) sceneProblems.push({ episode: episode.name, scene: scene.title, problem: 'empty objects' });
    if (!blocks.length) sceneProblems.push({ episode: episode.name, scene: scene.title, problem: 'empty script' });

    const scenePlace = normalizeScenePlace(scene.title);
    if (blocks.length > 0 && blocks.length <= 3) {
      sceneSegmentationWarnings.push({
        type: 'micro_scene',
        episode: episode.name,
        scene: scene.title,
        blocks: blocks.length,
        suggestion:
          'Review whether this 1-3 block scene should merge with a neighboring same-location scene unless it marks a real place change, time jump, or layout reset.',
      });
    }
    if (
      previousSceneSummary &&
      previousSceneSummary.place &&
      scenePlace &&
      previousSceneSummary.place === scenePlace
    ) {
      sceneSegmentationWarnings.push({
        type: 'adjacent_same_place_scenes',
        episode: episode.name,
        previousScene: previousSceneSummary.title,
        scene: scene.title,
        place: scenePlace,
        suggestion:
          'Scene boundaries should usually follow place changes; consider merging adjacent same-place scenes and using camera/action beats for internal story turns.',
      });
    }

    for (const block of blocks) {
      const actions = Array.isArray(block.actions) ? block.actions : [];
      if (!block.productionNote) {
        sceneBlocksWithoutProductionNote += 1;
        episodeBlocksWithoutProductionNote += 1;
      }
      if (actions.length) {
        sceneBlocksWithActions += 1;
        episodeBlocksWithActions += 1;
      } else if (args.profile === 'refined') {
        warnings.push({
          type: 'refined_block_without_actions',
          episode: episode.name,
          scene: scene.title,
          blockId: block.id,
          text: block.text,
        });
      }

      if (args.profile === 'static' && actions.length && !args.allowActions) {
        staticActionProblems.push({
          episode: episode.name,
          scene: scene.title,
          blockId: block.id,
          text: block.text,
          actions: actions.length,
        });
      }

      if (block.type === 'dialogue' && !objectIds.has(block.instanceId)) {
        dialogueProblems.push({
          episode: episode.name,
          scene: scene.title,
          blockId: block.id,
          text: block.text,
          instanceId: block.instanceId,
        });
      }

      for (const action of actions) {
        const actionType = action.type || 'unknown';
        increment(sceneActionTypes, actionType);
        increment(episodeActionTypes, actionType);

        if (args.allowedActions && !args.allowedActions.has(actionType)) {
          actionWhitelistProblems.push({
            episode: episode.name,
            scene: scene.title,
            blockId: block.id,
            actionId: action.id,
            actionType,
            allowed: [...args.allowedActions].sort(),
          });
        }

        if (!action.id) {
          actionProblems.push({
            episode: episode.name,
            scene: scene.title,
            blockId: block.id,
            problem: 'missing action id',
            actionType,
          });
        }
        if (!action.type) {
          actionProblems.push({
            episode: episode.name,
            scene: scene.title,
            blockId: block.id,
            problem: 'missing action type',
            actionId: action.id,
          });
        }
        if (!Number.isInteger(action.slotIndex) || action.slotIndex < 0) {
          actionProblems.push({
            episode: episode.name,
            scene: scene.title,
            blockId: block.id,
            problem: 'missing or invalid action slotIndex',
            actionId: action.id,
            actionType,
            slotIndex: action.slotIndex,
          });
        }
        if (
          action.category === 'duration' &&
          (!Number.isFinite(action.slotSpan) || action.slotSpan <= 0)
        ) {
          actionProblems.push({
            episode: episode.name,
            scene: scene.title,
            blockId: block.id,
            problem: 'missing or invalid duration action slotSpan',
            actionId: action.id,
            actionType,
            slotSpan: action.slotSpan,
          });
        }
        if (!action.target) {
          actionProblems.push({
            episode: episode.name,
            scene: scene.title,
            blockId: block.id,
            problem: 'missing action target',
            actionId: action.id,
            actionType,
          });
        } else if (!allowedSpecialTargets.has(action.target) && !objectIds.has(action.target)) {
          actionProblems.push({
            episode: episode.name,
            scene: scene.title,
            blockId: block.id,
            problem: 'action target not found in scene',
            actionId: action.id,
            actionType,
            target: action.target,
          });
        }
      }
    }

    if (sceneBlocksWithoutProductionNote) {
      warnings.push({
        type: 'blocks_without_productionNote',
        episode: episode.name,
        scene: scene.title,
        count: sceneBlocksWithoutProductionNote,
      });
    }

    scenes.push({
      title: scene.title,
      objects: objects.length,
      objectTypes: sortedObject(sceneObjectTypes),
      blocks: blocks.length,
      blocksWithActions: sceneBlocksWithActions,
      blocksWithoutProductionNote: sceneBlocksWithoutProductionNote,
      actionTypes: sortedObject(sceneActionTypes),
    });
    previousSceneSummary = {
      title: scene.title,
      place: scenePlace,
    };
  }

  episodeResults.push({
    name: episode.name,
    episodeNumber: episode.episodeNumber,
    scenes: (episode.scenes || []).length,
    blocks: episodeBlocks,
    blocksWithActions: episodeBlocksWithActions,
    blocksWithoutProductionNote: episodeBlocksWithoutProductionNote,
    duration: episode.duration,
    objectTypes: sortedObject(episodeObjectTypes),
    actionTypes: sortedObject(episodeActionTypes),
    sceneDetails: scenes,
  });
}

const duplicateEpisodeTitles = [...titleCounts].filter(([, count]) => count > 1);
const result = {
  profile: args.profile,
  voiceCatalog: {
    path: voiceCatalog.path,
    voices: voiceCatalog.voices.length,
  },
  episodes: episodeResults,
  actorProblems,
  narratorVoiceProblems,
  actorVoiceProblems,
  duplicateActorVoiceProblems,
  actorScaleProblems,
  duplicateActorCharacterProblems,
  sceneProblems,
  dialogueProblems,
  actionProblems,
  actionWhitelistProblems,
  lightIntensityProblems,
  staticActionProblems,
  duplicateEpisodeTitles,
  sceneSegmentationWarnings,
  warnings,
};

console.log(JSON.stringify(result, null, 2));

const failed =
  actorProblems.length ||
  narratorVoiceProblems.length ||
  actorVoiceProblems.length ||
  duplicateActorVoiceProblems.length ||
  actorScaleProblems.length ||
  duplicateActorCharacterProblems.length ||
  sceneProblems.length ||
  dialogueProblems.length ||
  actionProblems.length ||
  actionWhitelistProblems.length ||
  lightIntensityProblems.length ||
  staticActionProblems.length ||
  duplicateEpisodeTitles.length;
process.exit(failed ? 1 : 0);
