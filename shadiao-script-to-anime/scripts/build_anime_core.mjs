import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CAMERA = {
  x: 3012.6236052759787,
  y: 1364.4081562782765,
  width: 1456,
  height: 819,
  zoom: 1,
};

const CANVAS_CENTER_X = 3360;
const CANVAS_CENTER_Y = 1400;
const Z_INDEX_BACKGROUND = -10;
const Z_INDEX_DEFAULT = 10;
const Z_INDEX_LIGHT = 1000;
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const VOICE_CATALOG_PATH = join(MODULE_DIR, '..', 'references', 'voice-options.json');
const DEFAULT_VOICE_SPEED = 0;
let cachedVoiceCatalog = null;

export function genId(prefix = '') {
  return prefix + randomUUID().replace(/-/g, '').slice(0, 16);
}

export function makeLight(overrides = {}) {
  return {
    id: genId('light_'),
    refId: '',
    type: 'light',
    name: '环境光',
    x: CANVAS_CENTER_X,
    y: CANVAS_CENTER_Y,
    width: 96,
    height: 96,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    zIndex: Z_INDEX_LIGHT,
    flipX: false,
    visible: true,
    alpha: 1,
    spawned: true,
    alias: '环境光',
    lightType: 'ambient',
    lightColor: '#ffffff',
    lightIntensity: 1,
    lightRadius: 500,
    ...overrides,
  };
}

export function makeBackgroundObject(background, camera, overrides = {}) {
  const center = cameraCenter(camera);
  return {
    id: genId('bg_'),
    refId: background.id,
    type: 'background',
    name: background.name,
    alias: background.name,
    x: center.x,
    y: center.y,
    width: 0,
    height: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    alpha: 1,
    flipX: false,
    zIndex: Z_INDEX_BACKGROUND,
    visible: true,
    spawned: true,
    ...overrides,
  };
}

export function readAnimeProject(animePath) {
  return JSON.parse(readFileSync(animePath, 'utf8'));
}

export function writeAnimeProject(animePath, anime) {
  writeFileSync(animePath, JSON.stringify(anime, null, 2), 'utf8');
}

export function backupAnimeProject(animePath, now = new Date()) {
  const ext = extname(animePath);
  const stem = basename(animePath, ext);
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  const backupPath = join(dirname(animePath), `${stem}_backup_${stamp}${ext}`);
  copyFileSync(animePath, backupPath);
  return backupPath;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function indexById(objects = []) {
  return new Map(objects.filter((object) => object?.id).map((object) => [object.id, object]));
}

function rootIdsFromObjects(objects = []) {
  const roots = objects.filter((object) => object?.id && !object.parentId).map((object) => object.id);
  return roots.length ? roots : objects.slice(0, 1).map((object) => object.id).filter(Boolean);
}

function collectTreeIds(objects = [], rootIds = []) {
  const byId = indexById(objects);
  const ids = new Set();
  const stack = [...rootIds].filter(Boolean);

  while (stack.length) {
    const id = stack.pop();
    if (!id || ids.has(id)) continue;
    const object = byId.get(id);
    if (!object) continue;

    ids.add(id);
    for (const childId of object.childIds || []) {
      stack.push(childId);
    }
  }

  return ids;
}

function makeObjectId(sourceId = '') {
  if (
    sourceId.startsWith('obj_') ||
    sourceId.startsWith('sceneobject_') ||
    sourceId.startsWith('node_')
  ) {
    return genId('obj_');
  }
  return genId(`${sourceId.slice(0, 3) || 'obj'}_`);
}

function remapRefs(value, idMap) {
  if (typeof value === 'string') {
    return idMap.get(value) || value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => remapRefs(item, idMap)).filter((item) => item !== undefined);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = remapRefs(item, idMap);
  }
  return result;
}

export function cloneObjectForest(objects = [], rootIds = rootIdsFromObjects(objects), idMap = new Map()) {
  const idsToClone = collectTreeIds(objects, rootIds);
  const sourceObjects = objects.filter((object) => idsToClone.has(object.id));

  for (const object of sourceObjects) {
    if (!idMap.has(object.id)) {
      idMap.set(object.id, makeObjectId(object.id));
    }
  }

  const clonedObjects = sourceObjects.map((object) => {
    const clone = remapRefs(deepClone(object), idMap);
    clone.id = idMap.get(object.id);
    clone.spawned = true;
    return clone;
  });

  return {
    clonedObjects,
    newRootIds: rootIds.map((id) => idMap.get(id) || id).filter(Boolean),
    idMap,
  };
}

export function cloneTemplate(template, idMap = new Map()) {
  const objects = template?.objects || [];
  const rootIds = template?.renderChain?.length ? template.renderChain : rootIdsFromObjects(objects);
  return cloneObjectForest(objects, rootIds, idMap);
}

function cameraCenter(camera) {
  const zoom = camera.zoom || 1;
  return {
    x: camera.x + camera.width / (2 * zoom),
    y: camera.y + camera.height / (2 * zoom),
  };
}

function objectBounds(object) {
  const x = object.x ?? 0;
  const y = object.y ?? 0;
  const halfWidth = ((object.width ?? 0) * Math.abs(object.scaleX ?? 1)) / 2;
  const halfHeight = ((object.height ?? 0) * Math.abs(object.scaleY ?? 1)) / 2;
  return {
    left: x - halfWidth,
    right: x + halfWidth,
    top: y - halfHeight,
    bottom: y + halfHeight,
  };
}

function boundsCenter(bounds) {
  return {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
  };
}

function unionBounds(objects) {
  const bounds = objects.map(objectBounds);
  if (!bounds.length) return null;
  return {
    left: Math.min(...bounds.map((item) => item.left)),
    right: Math.max(...bounds.map((item) => item.right)),
    top: Math.min(...bounds.map((item) => item.top)),
    bottom: Math.max(...bounds.map((item) => item.bottom)),
  };
}

export function centerTemplateObjects(objects, rootIds, camera) {
  const roots = rootIds
    .map((id) => objects.find((object) => object.id === id))
    .filter(Boolean);
  const bounds = unionBounds(roots);
  if (!bounds) return { dx: 0, dy: 0 };

  const from = boundsCenter(bounds);
  const to = cameraCenter(camera);
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  for (const root of roots) {
    root.x = (root.x ?? 0) + dx;
    root.y = (root.y ?? 0) + dy;
  }

  return { dx, dy };
}

export function centerSceneObjects(objects, rootIds, camera) {
  return centerTemplateObjects(objects, rootIds, camera);
}

function makeProductionNote(row, sceneConfig) {
  if (typeof row.productionNote === 'string') return row.productionNote;
  return {
    sourceIndex: row.seq,
    scene: sceneConfig.title,
    visual: row.visual || '',
    audio: row.audio || row.sound || '',
    ...(row.productionNote || {}),
  };
}

export function makeNarrationBlock(row, sceneConfig) {
  return {
    id: genId('blk_'),
    type: 'narration',
    text: row.text,
    speed: row.speed ?? 1,
    actions: [],
    productionNote: makeProductionNote(row, sceneConfig),
  };
}

export function makeDialogueBlock(row, instanceId, sceneConfig) {
  return {
    id: genId('blk_'),
    type: 'dialogue',
    text: row.text,
    speed: row.speed ?? 1,
    instanceId,
    actions: [],
    productionNote: makeProductionNote(row, sceneConfig),
  };
}

function actorByName(anime, actorName) {
  return (anime.actors || []).find((actor) => actor.name === actorName);
}

function characterById(anime, characterId) {
  return (anime.compositeCharacters || []).find((character) => character.id === characterId);
}

function loadVoiceCatalog(warnings = []) {
  if (cachedVoiceCatalog) return cachedVoiceCatalog;
  try {
    const catalog = JSON.parse(readFileSync(VOICE_CATALOG_PATH, 'utf8'));
    cachedVoiceCatalog = {
      ...catalog,
      voices: Array.isArray(catalog.voices) ? catalog.voices : [],
    };
  } catch (error) {
    cachedVoiceCatalog = {
      defaults: {
        narrator: { voiceId: '101026', speed: DEFAULT_VOICE_SPEED },
        female: { voiceId: '101026', speed: DEFAULT_VOICE_SPEED },
        male: { voiceId: '101030', speed: DEFAULT_VOICE_SPEED },
        other: { voiceId: '101026', speed: DEFAULT_VOICE_SPEED },
      },
      voices: [],
    };
    warnings.push(`Voice catalog not loaded from "${VOICE_CATALOG_PATH}": ${error.message}`);
  }
  return cachedVoiceCatalog;
}

function normalizeText(value = '') {
  return String(value).trim().toLowerCase();
}

function normalizeCompact(value = '') {
  return normalizeText(value).replace(/\s+/g, '');
}

function uniqueList(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function isNonActorSpeaker(speaker = '') {
  return ['旁白', '叙述', '解说', '字幕'].includes(String(speaker).trim());
}

function voiceIdOf(voice) {
  if (voice === null || voice === undefined || voice === '') return '';
  if (typeof voice === 'string' || typeof voice === 'number') return String(voice);
  if (typeof voice === 'object' && voice.voiceId !== undefined && voice.voiceId !== null && voice.voiceId !== '') {
    return String(voice.voiceId);
  }
  return '';
}

function voiceSpeedOf(voice, fallback = DEFAULT_VOICE_SPEED) {
  if (voice && typeof voice === 'object' && Number.isFinite(voice.speed)) return voice.speed;
  return fallback;
}

function makeVoiceConfig(voice, fallbackSpeed = DEFAULT_VOICE_SPEED) {
  const voiceId = voiceIdOf(voice);
  if (!voiceId) return null;
  return {
    voiceId,
    speed: voiceSpeedOf(voice, fallbackSpeed),
  };
}

function usedActorVoiceIds(anime) {
  return new Set((anime.actors || []).map((actor) => voiceIdOf(actor.voice)).filter(Boolean));
}

function supportedVoiceIds(warnings = []) {
  return new Set(loadVoiceCatalog(warnings).voices.map((voice) => String(voice.id)));
}

function inferGender(actorName = '', character = {}) {
  const text = [actorName, character.name, character.alias, character.title, character.gender, character.description]
    .filter(Boolean)
    .join(' ');
  const compact = normalizeCompact(text);
  if (/(女|丫鬟|小姐|夫人|嬷嬷|姨娘|姑娘|婢|婆|娘|母|姐|妹|妻|嫂|妃|后|female)/u.test(compact)) {
    return 'female';
  }
  if (/(男|少爷|公子|老爷|侯|王|皇帝|父|爹|哥|弟|夫|郎|书生|先生|管家|小厮|侍卫|male)/u.test(compact)) {
    return 'male';
  }
  return 'other';
}

function configuredVoiceFromMaps(actorName, sceneConfig = {}, options = {}) {
  return (
    sceneConfig.actorVoiceMap?.[actorName] ??
    sceneConfig.roleToVoiceMap?.[actorName] ??
    options.actorVoiceMap?.[actorName] ??
    options.roleToVoiceMap?.[actorName] ??
    null
  );
}

function pickUnusedCatalogVoice(anime, gender, warnings) {
  const catalog = loadVoiceCatalog(warnings);
  const used = usedActorVoiceIds(anime);
  const preferredDefault = catalog.defaults?.[gender]?.voiceId || catalog.defaults?.other?.voiceId;
  const candidateGroups = [
    catalog.voices.filter((voice) => String(voice.id) === String(preferredDefault)),
    catalog.voices.filter((voice) => voice.gender === gender),
    catalog.voices,
  ];

  for (const candidates of candidateGroups) {
    const match = candidates.find((voice) => !used.has(String(voice.id)));
    if (match) return { voiceId: String(match.id), speed: DEFAULT_VOICE_SPEED };
  }
  return preferredDefault ? { voiceId: String(preferredDefault), speed: DEFAULT_VOICE_SPEED } : null;
}

function selectVoiceForNewActor(anime, actorName, character, sceneConfig, options, warnings) {
  const supportedIds = supportedVoiceIds(warnings);
  const usedIds = usedActorVoiceIds(anime);
  const requested = makeVoiceConfig(configuredVoiceFromMaps(actorName, sceneConfig, options));
  const candidates = [
    requested,
    makeVoiceConfig(character.voice),
    makeVoiceConfig(options.defaultActorVoice),
    makeVoiceConfig(options.defaultActorVoiceId),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (supportedIds.size && !supportedIds.has(candidate.voiceId)) {
      warnings.push(`Voice "${candidate.voiceId}" for new actor "${actorName}" is not in the supported voice list`);
      continue;
    }
    if (usedIds.has(candidate.voiceId) && options.allowVoiceReuse !== true) {
      warnings.push(`Voice "${candidate.voiceId}" for new actor "${actorName}" is already used; selecting another voice`);
      continue;
    }
    return candidate;
  }

  return pickUnusedCatalogVoice(anime, inferGender(actorName, character), warnings);
}

function ensureNarratorVoice(anime, options, warnings) {
  const catalog = loadVoiceCatalog(warnings);
  anime.narrator = anime.narrator || {};
  if (voiceIdOf(anime.narrator.voice)) return;

  const configured =
    makeVoiceConfig(options.defaultNarratorVoice) ||
    makeVoiceConfig(options.defaultNarratorVoiceId) ||
    makeVoiceConfig(catalog.defaults?.narrator);
  if (!configured) {
    warnings.push('Narrator voice is missing and no supported default narrator voice is available');
    return;
  }

  anime.narrator.voice = configured;
  warnings.push(`Configured missing narrator voice with voiceId "${configured.voiceId}"`);
}

function characterLabel(character = {}) {
  return [character.name, character.alias, character.title].filter(Boolean).join('/');
}

function characterSearchText(character = {}) {
  const scalarValues = [];
  for (const [key, value] of Object.entries(character)) {
    if (['objects', 'renderChain'].includes(key)) continue;
    if (['string', 'number', 'boolean'].includes(typeof value)) {
      scalarValues.push(value);
    } else if (Array.isArray(value)) {
      scalarValues.push(...value.filter((item) => ['string', 'number', 'boolean'].includes(typeof item)));
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) {
        if (['string', 'number', 'boolean'].includes(typeof item)) scalarValues.push(item);
        if (Array.isArray(item)) {
          scalarValues.push(...item.filter((entry) => ['string', 'number', 'boolean'].includes(typeof entry)));
        }
      }
    }
  }
  return normalizeCompact(scalarValues.join(' '));
}

function roleKeywords(actorName = '') {
  const keywordGroups = [
    ['女', '丫鬟', '小姐', '夫人', '嬷嬷', '姨娘', '姑娘', '婢', '婆', '娘', '母', '姐', '妹', '妻', '嫂', '妃', '后'],
    ['男', '少爷', '公子', '老爷', '侯', '王', '皇帝', '父', '爹', '哥', '弟', '夫', '郎', '书生', '先生', '管家', '小厮', '侍卫'],
    ['老', '嬷嬷', '婆', '爷爷', '奶奶', '祖', '父', '母'],
    ['小', '童', '娃', '孩子', '孩', '少年', '少女'],
  ];
  return uniqueList(keywordGroups.flatMap((group) => group.filter((keyword) => actorName.includes(keyword))));
}

function resolveRequestedCharacter(anime, actorName, sceneConfig = {}, options = {}) {
  const request =
    sceneConfig.roleToCharacterMap?.[actorName] ??
    sceneConfig.actorCharacterMap?.[actorName] ??
    options.roleToCharacterMap?.[actorName] ??
    options.actorCharacterMap?.[actorName];
  if (!request) return null;

  const requestText = normalizeCompact(request);
  return (
    (anime.compositeCharacters || []).find((character) => character.id === request) ||
    (anime.compositeCharacters || []).find((character) =>
      [character.name, character.alias, character.title]
        .filter(Boolean)
        .some((value) => normalizeCompact(value) === requestText),
    ) ||
    (anime.compositeCharacters || []).find((character) =>
      [character.name, character.alias, character.title]
        .filter(Boolean)
        .some((value) => normalizeCompact(value).includes(requestText) || requestText.includes(normalizeCompact(value))),
    ) ||
    null
  );
}

function scoreCharacterForActor(character, actorName) {
  const actorText = normalizeCompact(actorName);
  const labelText = normalizeCompact(characterLabel(character));
  const searchText = characterSearchText(character);
  let score = 0;

  if (labelText && labelText === actorText) score += 100;
  if (labelText && (labelText.includes(actorText) || actorText.includes(labelText))) score += 60;
  if (searchText && searchText.includes(actorText)) score += 40;

  for (const keyword of roleKeywords(actorName)) {
    if (labelText.includes(keyword)) score += 18;
    if (searchText.includes(keyword)) score += 10;
  }

  return score;
}

function selectCharacterForNewActor(anime, actorName, sceneConfig, options, warnings) {
  const characters = anime.compositeCharacters || [];
  if (!characters.length) return null;

  const usedCharacterIds = new Set((anime.actors || []).map((actor) => actor.characterId).filter(Boolean));
  const requested = resolveRequestedCharacter(anime, actorName, sceneConfig, options);
  if (requested) {
    if (usedCharacterIds.has(requested.id) && options.allowCharacterReuse !== true) {
      warnings.push(
        `Requested character "${characterLabel(requested) || requested.id}" for new actor "${actorName}" is already used; set allowCharacterReuse to reuse it.`,
      );
      return null;
    }
    return { character: requested, reason: 'explicit map' };
  }

  let candidates = characters.filter((character) => !usedCharacterIds.has(character.id));
  if (!candidates.length) {
    if (options.allowCharacterReuse !== true) {
      warnings.push(`No unused character resource is available for new actor "${actorName}"`);
      return null;
    }
    candidates = characters;
  }

  const scored = candidates
    .map((character, index) => ({
      character,
      index,
      score: scoreCharacterForActor(character, actorName),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const best = scored[0];
  if (!best) return null;

  return {
    character: best.character,
    reason: best.score > 0 ? `auto match score ${best.score}` : 'first unused fallback',
  };
}

function createActorFromCharacter(anime, actorName, character, options, reason) {
  const warnings = options.__warnings || [];
  const voice = selectVoiceForNewActor(anime, actorName, character, options.__sceneConfig || {}, options, warnings);
  const actor = {
    id: genId('actor_'),
    name: actorName,
    characterId: character.id,
    voice: voice || undefined,
    extraInfo: {
      generatedBy: 'shadiao-script-to-anime',
      autoCreated: true,
      characterSelectionReason: reason,
    },
  };
  anime.actors = anime.actors || [];
  anime.actors.push(actor);
  return actor;
}

function ensureActor(anime, actorName, sceneConfig, options, warnings) {
  const existing = actorByName(anime, actorName);
  if (existing) return existing;

  if (options.autoCreateActors === false) return null;

  const selection = selectCharacterForNewActor(anime, actorName, sceneConfig, options, warnings);
  if (!selection?.character) return null;

  const actor = createActorFromCharacter(
    anime,
    actorName,
    selection.character,
    { ...options, __warnings: warnings, __sceneConfig: sceneConfig },
    selection.reason,
  );
  warnings.push(
    `Auto-created actor "${actorName}" with character "${characterLabel(selection.character) || selection.character.id}" (${selection.reason})`,
  );
  return actor;
}

function expressionMatchKey(object) {
  return [object.name, object.alias].filter(Boolean).join('\u0000');
}

function applyCharacterDefaultExpressions(clonedObjects, character, actorName, warnings) {
  const characterExpressions = (character?.objects || []).filter(
    (object) => object?.type === 'expression' && (object.defaultRefId || object.refId),
  );
  const clonedExpressions = (clonedObjects || []).filter((object) => object?.type === 'expression');
  if (!characterExpressions.length || !clonedExpressions.length) return;

  const defaultsByKey = new Map();
  for (const expression of characterExpressions) {
    const key = expressionMatchKey(expression);
    if (key && !defaultsByKey.has(key)) {
      defaultsByKey.set(key, expression.defaultRefId || expression.refId);
    }
  }

  clonedExpressions.forEach((expression, index) => {
    const key = expressionMatchKey(expression);
    const defaultRefId =
      (key && defaultsByKey.get(key)) ||
      characterExpressions[index]?.defaultRefId ||
      characterExpressions[index]?.refId ||
      (characterExpressions.length === 1
        ? characterExpressions[0].defaultRefId || characterExpressions[0].refId
        : '');

    if (!defaultRefId) {
      warnings.push(`Actor "${actorName}" expression "${expression.name || expression.id}" has no character default`);
      return;
    }

    expression.refId = defaultRefId;
    expression.defaultRefId = defaultRefId;
  });
}

function instantiateActor(anime, actorName, sceneConfig, options, warnings) {
  const actor = ensureActor(anime, actorName, sceneConfig, options, warnings);
  if (!actor) {
    warnings.push(`Actor "${actorName}" not found`);
    return null;
  }

  const character = characterById(anime, actor.characterId);
  if (!character) {
    warnings.push(`Actor "${actorName}" character "${actor.characterId}" not found`);
    return null;
  }

  const cloneResult = cloneObjectForest(character.objects || [], rootIdsFromObjects(character.objects || []), new Map());
  applyCharacterDefaultExpressions(cloneResult.clonedObjects, character, actorName, warnings);

  const rootId = cloneResult.newRootIds[0];
  const rootObject = cloneResult.clonedObjects.find((object) => object.id === rootId);
  if (rootObject) {
    rootObject.name = actorName;
    rootObject.alias = actorName;
    rootObject.rotation = 0;
    rootObject.scaleX = 1;
    rootObject.scaleY = 1;
    rootObject.zIndex = rootObject.zIndex ?? Z_INDEX_DEFAULT;
    rootObject.visible = true;
    rootObject.spawned = true;
    rootObject.extraInfo = {
      ...(rootObject.extraInfo || {}),
      kind: rootObject.extraInfo?.kind || 'actor',
      actorId: actor.id,
    };
  }

  return {
    actor,
    objects: cloneResult.clonedObjects,
    rootId,
  };
}

function layoutActorRoots(objects, rootIds, camera, layout = {}) {
  if (layout.enabled === false) return;

  const roots = rootIds
    .map((id) => objects.find((object) => object.id === id))
    .filter(Boolean);
  if (!roots.length) return;

  const center = cameraCenter(camera);
  const spacing =
    layout.spacing ??
    (roots.length >= 5 ? 210 : roots.length >= 3 ? 260 : 330);
  const startX =
    layout.startX ??
    center.x - ((roots.length - 1) * spacing) / 2;
  const baseY = layout.y ?? center.y + 70;
  const staggerY = layout.staggerY ?? 18;

  roots.forEach((root, index) => {
    root.x = startX + index * spacing;
    root.y = baseY + (layout.stagger === false ? 0 : index % 2 === 0 ? 0 : staggerY);
    root.rotation = 0;
    root.scaleX = 1;
    root.scaleY = 1;
    root.flipX = layout.flipX ?? false;
    root.visible = true;
    root.spawned = true;
  });
}

function rowsForScene(rows, range) {
  if (!range) return rows;
  const [start, end] = range;
  return rows.filter((row) => row.seq >= start && row.seq <= end);
}

function resolveSpeaker(row, sceneActors, speakerAliases = {}) {
  const speaker = row.speaker || '';
  const candidates = [speaker, ...(speakerAliases[speaker] || [])].filter(Boolean);

  for (const candidate of candidates) {
    const exact = sceneActors.find((actorName) => actorName === candidate);
    if (exact) return exact;
  }
  for (const candidate of candidates) {
    const fuzzy = sceneActors.find((actorName) => candidate.includes(actorName) || actorName.includes(candidate));
    if (fuzzy) return fuzzy;
  }
  return null;
}

function collectSceneActorNames(sceneConfig, sceneRows, options) {
  const actorNames = [...(sceneConfig.actors || [])];
  if (options.autoAddDialogueSpeakers === false) return uniqueList(actorNames);

  for (const row of sceneRows) {
    if (row.type !== 'dialogue' || !row.speaker) continue;
    if (isNonActorSpeaker(row.speaker)) continue;
    if (resolveSpeaker(row, actorNames, options.speakerAliases)) continue;
    actorNames.push(row.speaker);
  }

  return uniqueList(actorNames);
}

function findBackground(anime, sceneConfig) {
  const backgrounds = anime.assets?.backgrounds || [];
  if (sceneConfig.backgroundId) {
    return backgrounds.find((background) => background.id === sceneConfig.backgroundId) || null;
  }
  if (sceneConfig.backgroundName) {
    return (
      backgrounds.find((background) => background.name === sceneConfig.backgroundName) ||
      backgrounds.find((background) => background.name?.includes(sceneConfig.backgroundName)) ||
      null
    );
  }
  return null;
}

function instantiateSceneVisual(anime, sceneConfig, camera, options, warnings) {
  if (sceneConfig.backgroundId || sceneConfig.backgroundName) {
    const background = findBackground(anime, sceneConfig);
    const label = sceneConfig.backgroundId || sceneConfig.backgroundName;
    if (!background) {
      warnings.push(`Background "${label}" for "${sceneConfig.title}" not found`);
      return null;
    }

    const backgroundObject = makeBackgroundObject(background, camera, sceneConfig.backgroundObject);
    if (
      sceneConfig.centerBackground !== false &&
      sceneConfig.centerVisual !== false &&
      options.centerBackground !== false &&
      options.centerVisual !== false
    ) {
      centerSceneObjects([backgroundObject], [backgroundObject.id], camera);
    }
    return {
      objects: [backgroundObject],
      renderChain: [backgroundObject.id],
    };
  }

  const templates = new Map((anime.sceneTemplates || []).map((template) => [template.id, template]));
  const template = templates.get(sceneConfig.templateId);
  if (!template) {
    warnings.push(`Template "${sceneConfig.templateId}" for "${sceneConfig.title}" not found`);
    return null;
  }

  const templateClone = cloneTemplate(template, new Map());
  if (
    sceneConfig.centerTemplate !== false &&
    sceneConfig.centerVisual !== false &&
    options.centerTemplate !== false &&
    options.centerVisual !== false
  ) {
    centerSceneObjects(templateClone.clonedObjects, templateClone.newRootIds, camera);
  }

  const templateRenderChain = (template.renderChain?.length ? template.renderChain : templateClone.newRootIds)
    .map((id) => templateClone.idMap.get(id) || id)
    .filter(Boolean);
  return {
    objects: templateClone.clonedObjects,
    renderChain: templateRenderChain,
  };
}

function buildScene(anime, sceneConfig, scriptRows, options, warnings) {
  const objects = [];
  const renderChain = [];
  const camera = { ...DEFAULT_CAMERA, ...(options.camera || {}), ...(sceneConfig.camera || {}) };
  if (options.addLight !== false) {
    objects.push(makeLight(options.light));
  }

  const sceneVisual = instantiateSceneVisual(anime, sceneConfig, camera, options, warnings);
  if (!sceneVisual) return null;
  objects.push(...sceneVisual.objects);
  renderChain.push(...sceneVisual.renderChain);

  const sceneRows = rowsForScene(scriptRows, sceneConfig.rowRange);
  const sceneActorNames = collectSceneActorNames(sceneConfig, sceneRows, options);
  const actorIdMap = new Map();
  const actorRootIds = [];
  for (const actorName of sceneActorNames) {
    const actorInstance = instantiateActor(anime, actorName, sceneConfig, options, warnings);
    if (!actorInstance) continue;

    objects.push(...actorInstance.objects);
    renderChain.push(actorInstance.rootId);
    actorRootIds.push(actorInstance.rootId);
    actorIdMap.set(actorName, actorInstance.rootId);
    actorIdMap.set(actorInstance.actor.id, actorInstance.rootId);
  }
  layoutActorRoots(objects, actorRootIds, camera, {
    ...(options.actorLayout || {}),
    ...(sceneConfig.actorLayout || {}),
  });

  const script = sceneRows.map((row) => {
    if (row.type === 'narration') return makeNarrationBlock(row, sceneConfig);
    if (row.type !== 'dialogue') {
      warnings.push(`Row ${row.seq} has unsupported type "${row.type}", using narration`);
      return makeNarrationBlock(row, sceneConfig);
    }
    if (isNonActorSpeaker(row.speaker)) return makeNarrationBlock(row, sceneConfig);

    const matchedActor = resolveSpeaker(row, sceneActorNames, options.speakerAliases);
    const instanceId = matchedActor ? actorIdMap.get(matchedActor) : '';
    if (instanceId) return makeDialogueBlock(row, instanceId, sceneConfig);

    warnings.push(`Row ${row.seq} speaker "${row.speaker}" is not bound in "${sceneConfig.title}"`);
    if (options.missingDialogueStrategy === 'keep-dialogue') {
      return makeDialogueBlock(row, '', sceneConfig);
    }
    return makeNarrationBlock(row, sceneConfig);
  });

  return {
    id: genId('scene_'),
    type: 'scene_container',
    title: sceneConfig.title,
    setup: {
      camera,
      objects,
      renderChain,
    },
    script,
  };
}

export function buildAnimeEpisode(anime, config) {
  const warnings = [];
  const options = {
    addLight: true,
    missingDialogueStrategy: 'narration',
    speakerAliases: {},
    autoAddDialogueSpeakers: true,
    autoCreateActors: true,
    allowCharacterReuse: false,
    allowVoiceReuse: false,
    centerVisual: true,
    ...(config.options || {}),
  };
  ensureNarratorVoice(anime, options, warnings);

  const scenes = [];
  for (const sceneConfig of config.scenes || []) {
    const scene = buildScene(anime, sceneConfig, config.scriptRows || [], options, warnings);
    if (scene) scenes.push(scene);
  }

  const episode = {
    id: genId('episode_'),
    episodeNumber: config.episodeNumber,
    name: config.episodeName,
    scenes,
  };

  const replaceNames = new Set([config.episodeName, ...(config.replaceEpisodeNames || [])]);
  anime.episodes = (anime.episodes || []).filter((item) => {
    if (replaceNames.has(item.name)) return false;
    if (config.replaceByEpisodeNumber !== false && item.episodeNumber === config.episodeNumber) return false;
    return true;
  });
  anime.episodes.push(episode);
  anime.episodes.sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0));

  return {
    anime,
    episode,
    warnings,
    summary: summarizeEpisode(episode),
  };
}

export function summarizeEpisode(episode) {
  return {
    name: episode.name,
    episodeNumber: episode.episodeNumber,
    scenes: episode.scenes.length,
    blocks: episode.scenes.reduce((count, scene) => count + (scene.script || []).length, 0),
    sceneDetails: episode.scenes.map((scene) => ({
      title: scene.title,
      objects: scene.setup?.objects?.length || 0,
      blocks: scene.script?.length || 0,
    })),
  };
}

export function buildAnimeProjectFile({ animePath, config, write = true, backup = true }) {
  const anime = readAnimeProject(animePath);
  const result = buildAnimeEpisode(anime, config);
  let backupPath = '';

  if (write) {
    if (backup) backupPath = backupAnimeProject(animePath);
    writeAnimeProject(animePath, result.anime);
  }

  return {
    ...result,
    backupPath,
  };
}
