#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'])
const MIN_CONFIG_VERSION = '2.0.0'
const CANVAS_CENTER_X = 960
const CANVAS_CENTER_Y = 540
const CAMERA_BASE_WIDTH = 1920
const CAMERA_BASE_HEIGHT = 1080

function usage() {
  return `Usage:
node import_anime_assets.mjs --anime <project.anime> --kind <kind> --input <path> [options]

Kinds:
  scene-template | character | background | prop | expression | sound | sfx | bgm

Options:
  --input <path>          Repeatable asset path.
  --recursive            Recursively discover config.json or media files.
  --onDuplicate <mode>   skip | replace | keep. Default: skip.
  --tags <a,b,c>         Comma-separated tags.
  --gender <value>       Character gender: male | female | other. Default: other.
  --projectRoot <path>   Defaults to dirname(--anime).
  --dryRun               Do not write changes.
  --noBackup             Do not create a backup.
`
}

function parseArgs(argv) {
  const args = {
    inputs: [],
    kind: 'scene-template',
    onDuplicate: 'skip',
    tags: [],
    gender: 'other',
    recursive: false,
    dryRun: false,
    backup: true,
  }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    const next = () => {
      const value = argv[++i]
      if (!value) throw new Error(`Missing value for ${token}`)
      return value
    }
    if (token === '--anime') args.anime = next()
    else if (token === '--input') args.inputs.push(next())
    else if (token === '--kind') args.kind = next()
    else if (token === '--onDuplicate') args.onDuplicate = next()
    else if (token === '--tags') args.tags = next().split(',').map(s => s.trim()).filter(Boolean)
    else if (token === '--gender') args.gender = next()
    else if (token === '--projectRoot') args.projectRoot = next()
    else if (token === '--recursive') args.recursive = true
    else if (token === '--dryRun') args.dryRun = true
    else if (token === '--noBackup') args.backup = false
    else if (token === '--help' || token === '-h') args.help = true
    else throw new Error(`Unknown argument: ${token}`)
  }
  return args
}

function normalizeKind(kind) {
  const k = kind.toLowerCase()
  if (['scene-template', 'scene-template-dir', 'scene', 'template'].includes(k)) return 'scene-template'
  if (['character', 'composite-character', 'person'].includes(k)) return 'character'
  if (['background', 'bg'].includes(k)) return 'background'
  if (['prop', 'props', 'item'].includes(k)) return 'prop'
  if (['expression', 'face'].includes(k)) return 'expression'
  if (['sound', 'audio', 'sfx', 'bgm'].includes(k)) return k === 'bgm' ? 'bgm' : k === 'sfx' ? 'sfx' : 'sound'
  throw new Error(`Unsupported kind: ${kind}`)
}

function toSlash(p) {
  return p.replace(/\\/g, '/')
}

function relPath(from, to) {
  return toSlash(path.relative(from, to))
}

function stripRuntime(value) {
  if (Array.isArray(value)) return value.map(stripRuntime)
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [key, val] of Object.entries(value)) {
    if (key.startsWith('_')) continue
    if (key === 'spawned') continue
    out[key] = stripRuntime(val)
  }
  if (out.type === 'composite') out.compositeLocked = true
  return out
}

function nowId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function objectId() {
  return `sceneobject_${crypto.randomUUID()}`
}

function frameId() {
  return `frame_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function statSafe(p) {
  try {
    return await fs.stat(p)
  } catch {
    return null
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'))
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8')
}

function parseVersionTuple(version) {
  const match = /^ver(\d+)\.(\d+)\.(\d+)$/.exec(version || '')
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

function isVersionSatisfied(version, minVersion) {
  const current = parseVersionTuple(version)
  const required = parseVersionTuple(`ver${minVersion}`)
  if (!current || !required) return false
  for (let i = 0; i < 3; i++) {
    if (current[i] > required[i]) return true
    if (current[i] < required[i]) return false
  }
  return true
}

function parseConfigJson(text) {
  const parsed = JSON.parse(text)
  if (parsed.type !== 'composite') throw new Error('config.json root must be composite')
  if (!Array.isArray(parsed.children)) throw new Error('config.json root missing children[]')
  if (!parsed.version) throw new Error('config.json missing version')
  if (!isVersionSatisfied(parsed.version, MIN_CONFIG_VERSION)) {
    throw new Error(`config.json version ${parsed.version} is older than ver${MIN_CONFIG_VERSION}`)
  }
  return parsed
}

function collectAllFramePaths(config) {
  const paths = new Set()
  const walk = node => {
    if (node.type === 'symbol') {
      for (const frame of node.frames || []) paths.add(frame.path)
    } else {
      for (const child of node.children || []) walk(child)
    }
  }
  for (const child of config.children || []) walk(child)
  return paths
}

async function listFilesRecursive(dir) {
  const files = []
  async function walk(current, base) {
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      const rel = base ? path.join(base, entry.name) : entry.name
      if (entry.isDirectory()) await walk(full, rel)
      else if (entry.isFile()) files.push({ full, rel: toSlash(rel) })
    }
  }
  await walk(dir, '')
  return files
}

async function validateConfigResources(framePaths, configDir) {
  const files = await listFilesRecursive(configDir)
  const lower = new Map(files.map(f => [f.rel.toLowerCase(), f]))
  const missingFiles = []
  const resolvedRelativePaths = new Map()

  for (const framePath of framePaths) {
    const normalizedRelative = String(framePath).replace(/\\/g, '/').toLowerCase()
    const directMatch = lower.get(normalizedRelative)
    if (directMatch) {
      resolvedRelativePaths.set(framePath, directMatch.rel)
      continue
    }

    let normalized = String(framePath).replace(/^file:\/\/\//, '')
    try { normalized = decodeURIComponent(normalized) } catch {}
    normalized = normalized.replace(/\\/g, '/').toLowerCase()

    let best = null
    for (const file of files) {
      const candidate = file.rel.toLowerCase()
      if (normalized.endsWith(`/${candidate}`) || normalized === candidate) {
        if (!best || file.rel.length > best.rel.length) best = file
      }
    }
    if (best) resolvedRelativePaths.set(framePath, best.rel)
    else missingFiles.push(normalized.split('/').slice(-3).join('/'))
  }
  return { valid: missingFiles.length === 0, missingFiles, resolvedRelativePaths }
}

function resolveFrameUrl(framePath, resolvedRelativePaths, importDirectoryPath) {
  const relativePath = (resolvedRelativePaths.get(framePath) || '').replace(/\\/g, '/')
  return importDirectoryPath ? `${importDirectoryPath}/${relativePath}` : relativePath
}

function convertFramesToMaterials(frames, name, resolvedRelativePaths, importDirectoryPath) {
  const groups = new Map()
  for (const frame of frames || []) {
    const key = Number(frame.keyframe ?? 0)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(frame)
  }
  for (const groupFrames of groups.values()) {
    groupFrames.sort((a, b) => Number(a.subIndex ?? 0) - Number(b.subIndex ?? 0))
  }

  const materials = []
  const sortedKeyframes = [...groups.keys()].sort((a, b) => a - b)
  for (const keyframe of sortedKeyframes) {
    const groupFrames = groups.get(keyframe)
    const materialId = crypto.randomUUID()
    if (groupFrames.length === 1) {
      const frame = groupFrames[0]
      materials.push({
        id: materialId,
        name: frame.label || `${name} frame ${keyframe + 1}`,
        type: 'static',
        url: resolveFrameUrl(frame.path, resolvedRelativePaths, importDirectoryPath),
      })
    } else {
      const animFrames = groupFrames.map(frame => ({
        url: resolveFrameUrl(frame.path, resolvedRelativePaths, importDirectoryPath),
      }))
      const firstName = groupFrames.find(frame => frame.label)?.label
      materials.push({
        id: materialId,
        name: firstName || `${name} animation ${keyframe + 1}`,
        type: 'animation',
        frames: animFrames,
        fps: 24,
        loop: true,
      })
    }
  }
  return materials
}

function normalizeAlpha(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1
}

function convertSymbolNode(node, resolvedRelativePaths, importDirectoryPath) {
  const t = node.instanceTransform || {}
  const rp = t.registrationPoint || {}
  const width = Number(t.width || 0)
  const height = Number(t.height || 0)
  const centerX = Number(rp.parentX || 0) + (width / 2 - Number(rp.localX || 0))
  const centerY = Number(rp.parentY || 0) + (height / 2 - Number(rp.localY || 0))
  const materials = convertFramesToMaterials(node.frames || [], node.name, resolvedRelativePaths, importDirectoryPath)
  const firstMaterialId = materials[0]?.id
  const obj = {
    id: objectId(),
    type: 'symbol',
    name: node.name,
    alias: node.name,
    refId: '',
    materials,
    ...(firstMaterialId ? { currentMaterialId: firstMaterialId } : {}),
    x: centerX,
    y: centerY,
    width,
    height,
    scaleX: Number(t.scaleX ?? 1),
    scaleY: Number(t.scaleY ?? 1),
    rotation: Number(t.rotation || 0) * Math.PI / 180,
    alpha: normalizeAlpha(node.alpha),
    flipX: false,
    zIndex: 10,
    visible: true,
  }
  return { objects: [obj], rootObject: obj }
}

function convertCompositeNode(node, resolvedRelativePaths, importDirectoryPath, compositeMode) {
  const childResults = []
  for (const child of node.children || []) {
    childResults.push(convertNode(child, resolvedRelativePaths, importDirectoryPath, compositeMode))
  }
  const childRoots = childResults.map(r => r.rootObject)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const child of childRoots) {
    const halfW = child.width * Math.abs(child.scaleX ?? 1) / 2
    const halfH = child.height * Math.abs(child.scaleY ?? 1) / 2
    minX = Math.min(minX, child.x - halfW)
    maxX = Math.max(maxX, child.x + halfW)
    minY = Math.min(minY, child.y - halfH)
    maxY = Math.max(maxY, child.y + halfH)
  }
  const compositeX = childRoots.length ? (minX + maxX) / 2 : 0
  const compositeY = childRoots.length ? (minY + maxY) / 2 : 0
  const compositeId = objectId()
  const compositeObj = {
    id: compositeId,
    type: 'composite',
    name: node.name,
    alias: node.name,
    refId: '',
    childIds: childRoots.map(c => c.id),
    compositeLocked: true,
    compositeMode,
    x: compositeX,
    y: compositeY,
    width: childRoots.length ? maxX - minX : 0,
    height: childRoots.length ? maxY - minY : 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    alpha: normalizeAlpha(node.alpha),
    flipX: false,
    zIndex: 10,
    visible: true,
  }
  for (const child of childRoots) {
    child.x -= compositeX
    child.y -= compositeY
    child.parentId = compositeId
  }
  const objects = [compositeObj]
  for (const result of childResults) objects.push(...result.objects)
  return { objects, rootObject: compositeObj }
}

function convertNode(node, resolvedRelativePaths, importDirectoryPath, compositeMode) {
  if (node.type === 'symbol') return convertSymbolNode(node, resolvedRelativePaths, importDirectoryPath)
  return convertCompositeNode(node, resolvedRelativePaths, importDirectoryPath, compositeMode)
}

function fitAndCenter(objects, fitTo) {
  const topLevel = objects.filter(o => !o.parentId)
  if (!topLevel.length) return
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const obj of topLevel) {
    const halfW = obj.width * Math.abs(obj.scaleX ?? 1) / 2
    const halfH = obj.height * Math.abs(obj.scaleY ?? 1) / 2
    minX = Math.min(minX, obj.x - halfW)
    maxX = Math.max(maxX, obj.x + halfW)
    minY = Math.min(minY, obj.y - halfH)
    maxY = Math.max(maxY, obj.y + halfH)
  }
  const offsetX = CANVAS_CENTER_X - (minX + maxX) / 2
  const offsetY = CANVAS_CENTER_Y - (minY + maxY) / 2
  for (const obj of topLevel) {
    obj.x += offsetX
    obj.y += offsetY
  }
  if (fitTo) {
    const padding = fitTo.padding || 0
    const targetWidth = Math.max(fitTo.width - padding * 2, 1)
    const targetHeight = Math.max(fitTo.height - padding * 2, 1)
    const bboxWidth = maxX - minX
    const bboxHeight = maxY - minY
    if (bboxWidth > targetWidth || bboxHeight > targetHeight) {
      const scale = Math.min(targetWidth / bboxWidth, targetHeight / bboxHeight)
      for (const obj of topLevel) {
        obj.scaleX *= scale
        obj.scaleY *= scale
      }
    }
  }
}

async function convertConfigToSceneObjects(config, configDir, projectRoot, compositeMode, fitTo) {
  const importDirectoryPath = relPath(projectRoot, configDir)
  const allPaths = collectAllFramePaths(config)
  const validation = await validateConfigResources(allPaths, configDir)
  const result = convertCompositeNode(config, validation.resolvedRelativePaths, importDirectoryPath, compositeMode)
  const objects = result.objects
  fitAndCenter(objects, fitTo)
  rebuildEntityRenderChains(objects)
  return { objects, validation, importDirectoryPath }
}

function participatesInRenderChain(obj) {
  return obj.type !== 'camera' && obj.type !== 'audio' && obj.type !== 'light'
}

function buildRenderChain(objects, parentId) {
  const objectMap = new Map(objects.map((obj, index) => [obj.id, { obj, index }]))
  const result = []
  const collect = pid => {
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i]
      if ((pid === undefined && obj.parentId !== undefined) || (pid !== undefined && obj.parentId !== pid)) continue
      if (!participatesInRenderChain(obj)) continue
      if (obj.type === 'composite' && obj.compositeMode === 'union') {
        expandUnion(obj)
      } else {
        result.push({ id: obj.id, zIndex: obj.zIndex ?? 0, originalIndex: i })
      }
    }
  }
  const expandUnion = union => {
    for (const childId of union.childIds || []) {
      const item = objectMap.get(childId)
      if (!item) continue
      const child = item.obj
      if (child.type === 'composite' && child.compositeMode === 'union') expandUnion(child)
      else if (participatesInRenderChain(child)) {
        result.push({ id: child.id, zIndex: child.zIndex ?? 0, originalIndex: item.index })
      }
    }
  }
  collect(parentId)
  result.sort((a, b) => a.zIndex === b.zIndex ? a.originalIndex - b.originalIndex : a.zIndex - b.zIndex)
  return result.map(r => r.id)
}

function rebuildEntityRenderChains(objects) {
  for (const obj of objects) {
    if (obj.type === 'composite' && obj.compositeMode === 'entity') {
      obj.renderChain = buildRenderChain(objects, obj.id)
    }
  }
}

function computeBoundingBoxCenter(objects) {
  if (!objects.length) return { cx: 0, cy: 0 }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const obj of objects) {
    const halfW = obj.width * Math.abs(obj.scaleX ?? 1) / 2
    const halfH = obj.height * Math.abs(obj.scaleY ?? 1) / 2
    minX = Math.min(minX, obj.x - halfW)
    maxX = Math.max(maxX, obj.x + halfW)
    minY = Math.min(minY, obj.y - halfH)
    maxY = Math.max(maxY, obj.y + halfH)
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
}

function templateFromObjects(objects, name, tags, importSourcePath) {
  const cloned = objects.map(stripRuntime)
  const topLevel = cloned.filter(o => !o.parentId)
  const topLevelIds = new Set(topLevel.map(o => o.id))
  const { cx, cy } = computeBoundingBoxCenter(topLevel)
  for (const obj of cloned) {
    if (topLevelIds.has(obj.id)) {
      obj.x -= cx
      obj.y -= cy
      delete obj.parentId
    }
  }
  rebuildEntityRenderChains(cloned)
  return {
    id: nowId('stpl'),
    name,
    createdAt: Date.now(),
    objects: cloned,
    ...(tags.length ? { tags } : {}),
    ...(buildRenderChain(cloned).length ? { renderChain: buildRenderChain(cloned) } : {}),
    editorAnchor: { x: cx, y: cy },
    ...(importSourcePath ? { importSourcePath } : {}),
  }
}

function characterFromObjects(objects, name, tags, importSourcePath, gender) {
  const tpl = templateFromObjects(objects, name, tags, importSourcePath)
  const topLevel = tpl.objects.find(o => !o.parentId && o.type === 'composite')
  return {
    id: nowId('cchar'),
    name,
    gender,
    createdAt: Date.now(),
    objects: tpl.objects,
    ...(tpl.renderChain ? { renderChain: tpl.renderChain } : {}),
    ...(tags.length ? { tags } : {}),
    ...(tpl.editorAnchor ? { editorAnchor: tpl.editorAnchor } : {}),
    ...(importSourcePath ? { importSourcePath } : {}),
    ...(topLevel ? { rootCompositeId: topLevel.id } : {}),
  }
}

async function discoverConfigDirs(inputs, recursive) {
  const dirs = []
  for (const input of inputs) {
    const full = path.resolve(input)
    const st = await statSafe(full)
    if (!st) throw new Error(`Input not found: ${input}`)
    if (st.isFile()) {
      if (path.basename(full).toLowerCase() === 'config.json') dirs.push(path.dirname(full))
      else throw new Error(`Config import input file must be config.json: ${input}`)
      continue
    }
    if (await exists(path.join(full, 'config.json'))) {
      dirs.push(full)
      continue
    }
    const entries = await fs.readdir(full, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const child = path.join(full, entry.name)
      if (await exists(path.join(child, 'config.json'))) dirs.push(child)
    }
    if (recursive) {
      async function walk(current) {
        const nested = await fs.readdir(current, { withFileTypes: true })
        for (const entry of nested) {
          if (!entry.isDirectory()) continue
          const child = path.join(current, entry.name)
          if (await exists(path.join(child, 'config.json'))) dirs.push(child)
          else await walk(child)
        }
      }
      await walk(full)
    }
  }
  return [...new Set(dirs.map(d => path.resolve(d)))]
}

async function discoverMediaFiles(inputs, exts, recursive) {
  const files = []
  for (const input of inputs) {
    const full = path.resolve(input)
    const st = await statSafe(full)
    if (!st) throw new Error(`Input not found: ${input}`)
    if (st.isFile()) {
      if (exts.has(path.extname(full).toLowerCase())) files.push(full)
      continue
    }
    const list = await listFilesRecursive(full)
    for (const item of list) {
      if (!recursive && item.rel.includes('/')) continue
      if (exts.has(path.extname(item.full).toLowerCase())) files.push(item.full)
    }
  }
  return [...new Set(files.map(f => path.resolve(f)))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

async function discoverMediaGroups(inputs, exts, recursive) {
  const groups = []
  for (const input of inputs) {
    const full = path.resolve(input)
    const st = await statSafe(full)
    if (!st) throw new Error(`Input not found: ${input}`)
    if (st.isFile()) {
      if (exts.has(path.extname(full).toLowerCase())) groups.push({ name: path.parse(full).name, files: [full] })
      continue
    }
    const directFiles = (await fs.readdir(full, { withFileTypes: true }))
      .filter(e => e.isFile() && exts.has(path.extname(e.name).toLowerCase()))
      .map(e => path.join(full, e.name))
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    if (directFiles.length) groups.push({ name: path.basename(full), files: directFiles })
    const entries = await fs.readdir(full, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const child = path.join(full, entry.name)
      const childFiles = await discoverMediaFiles([child], exts, recursive)
      if (childFiles.length) groups.push({ name: entry.name, files: childFiles })
    }
  }
  return groups
}

function ensureProjectCollections(project) {
  project.assets ||= {}
  project.assets.backgrounds ||= []
  project.assets.props ||= []
  project.assets.sounds ||= []
  project.expressions ||= {}
  project.sceneTemplates ||= []
  project.compositeCharacters ||= []
}

function addByName(collection, item, onDuplicate) {
  const index = collection.findIndex(x => x?.name === item.name)
  if (index === -1) {
    collection.push(item)
    return 'added'
  }
  if (onDuplicate === 'replace') {
    collection[index] = item
    return 'replaced'
  }
  if (onDuplicate === 'keep') {
    collection.push({ ...item, name: uniqueName(collection, item.name) })
    return 'added'
  }
  return 'skipped'
}

function addExpression(expressions, item, onDuplicate) {
  const existingKey = Object.keys(expressions).find(id => expressions[id]?.name === item.name)
  if (!existingKey) {
    expressions[item.id] = item
    return 'added'
  }
  if (onDuplicate === 'replace') {
    delete expressions[existingKey]
    expressions[item.id] = item
    return 'replaced'
  }
  if (onDuplicate === 'keep') {
    item.name = uniqueName(Object.values(expressions), item.name)
    expressions[item.id] = item
    return 'added'
  }
  return 'skipped'
}

function uniqueName(collection, base) {
  const names = new Set(collection.map(x => x?.name))
  let i = 2
  while (names.has(`${base} (${i})`)) i++
  return `${base} (${i})`
}

function mediaUrl(file, projectRoot) {
  return relPath(projectRoot, file)
}

function visualAssetFromGroup(group, projectRoot, prefix, tags) {
  const files = group.files
  const id = nowId(prefix)
  if (files.length === 1) {
    return {
      id,
      name: group.name,
      type: 'static',
      tags,
      createdAt: Date.now(),
      fps: 25,
      loop: true,
      url: mediaUrl(files[0], projectRoot),
    }
  }
  return {
    id,
    name: group.name,
    type: 'animation',
    tags,
    createdAt: Date.now(),
    fps: 25,
    loop: true,
    url: mediaUrl(files[0], projectRoot),
    frames: files.map(file => ({ url: mediaUrl(file, projectRoot) })),
    stillFrameSource: 'frame',
    stillFrameIndex: 0,
  }
}

function expressionFromGroup(group, projectRoot, tags) {
  const files = group.files
  const defaultFile = files[0]
  const speaking = files.length > 1 ? files.slice(1) : []
  return {
    id: nowId('expr'),
    name: group.name,
    tags,
    defaultFrame: { id: frameId(), url: mediaUrl(defaultFile, projectRoot) },
    speakingFrames: speaking.map(file => ({ id: frameId(), url: mediaUrl(file, projectRoot) })),
    anchor: { x: 0.5, y: 0.5 },
    speakingFps: 12,
    speakingLoop: true,
    flipHorizontal: false,
    lockEdit: false,
    createdAt: Date.now(),
  }
}

function soundFromFile(file, projectRoot, type, tags) {
  return {
    id: nowId('sound'),
    name: path.parse(file).name,
    type,
    tags,
    url: mediaUrl(file, projectRoot),
    createdAt: Date.now(),
    volume: 1,
    loop: type === 'bgm',
    fadeIn: 0,
    fadeOut: 0,
  }
}

async function backupAnime(animePath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = animePath.replace(/\.anime$/i, `.backup-${stamp}.anime`)
  await fs.copyFile(animePath, backupPath)
  return backupPath
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  if (!args.anime) throw new Error('--anime is required')
  if (!args.inputs.length) throw new Error('--input is required')
  if (!['skip', 'replace', 'keep'].includes(args.onDuplicate)) throw new Error('--onDuplicate must be skip, replace, or keep')
  if (!['male', 'female', 'other'].includes(args.gender)) throw new Error('--gender must be male, female, or other')

  const kind = normalizeKind(args.kind)
  const animePath = path.resolve(args.anime)
  const projectRoot = path.resolve(args.projectRoot || path.dirname(animePath))
  const project = await readJson(animePath)
  ensureProjectCollections(project)

  const summary = { kind, dryRun: args.dryRun, added: 0, replaced: 0, skipped: 0, warnings: [], items: [] }

  const warnOutside = p => {
    const rel = relPath(projectRoot, p)
    if (rel.startsWith('../')) summary.warnings.push(`Asset outside project root: ${p}`)
  }

  if (kind === 'scene-template' || kind === 'character') {
    const configDirs = await discoverConfigDirs(args.inputs, args.recursive)
    for (const dir of configDirs) {
      warnOutside(dir)
      const name = path.basename(dir)
      try {
        const config = parseConfigJson(await fs.readFile(path.join(dir, 'config.json'), 'utf8'))
        const fit = kind === 'character' ? { width: CAMERA_BASE_WIDTH, height: CAMERA_BASE_HEIGHT } : undefined
        const { objects, validation, importDirectoryPath } = await convertConfigToSceneObjects(config, dir, projectRoot, 'entity', fit)
        if (!validation.valid) summary.warnings.push(`${name}: missing ${validation.missingFiles.join(', ')}`)
        const item = kind === 'scene-template'
          ? templateFromObjects(objects, name, args.tags, importDirectoryPath)
          : characterFromObjects(objects, name, args.tags, importDirectoryPath, args.gender)
        const collection = kind === 'scene-template' ? project.sceneTemplates : project.compositeCharacters
        const result = addByName(collection, item, args.onDuplicate)
        summary[result]++
        summary.items.push({ name, result, objects: objects.length, missingFiles: validation.missingFiles.length })
      } catch (error) {
        summary.warnings.push(`${name}: ${error.message}`)
        summary.skipped++
        summary.items.push({ name, result: 'failed', error: error.message })
      }
    }
  } else if (kind === 'background' || kind === 'prop' || kind === 'expression') {
    const groups = await discoverMediaGroups(args.inputs, IMAGE_EXTS, args.recursive)
    for (const group of groups) {
      for (const file of group.files) warnOutside(file)
      if (kind === 'expression') {
        const result = addExpression(project.expressions, expressionFromGroup(group, projectRoot, args.tags), args.onDuplicate)
        summary[result]++
        summary.items.push({ name: group.name, result, files: group.files.length })
      } else {
        const prefix = kind === 'background' ? 'bg' : 'prop'
        const item = visualAssetFromGroup(group, projectRoot, prefix, args.tags)
        const collection = kind === 'background' ? project.assets.backgrounds : project.assets.props
        const result = addByName(collection, item, args.onDuplicate)
        summary[result]++
        summary.items.push({ name: group.name, result, files: group.files.length })
      }
    }
  } else {
    const soundType = kind === 'bgm' ? 'bgm' : 'sfx'
    const files = await discoverMediaFiles(args.inputs, AUDIO_EXTS, args.recursive)
    for (const file of files) {
      warnOutside(file)
      const item = soundFromFile(file, projectRoot, soundType, args.tags)
      const result = addByName(project.assets.sounds, item, args.onDuplicate)
      summary[result]++
      summary.items.push({ name: item.name, result, file: mediaUrl(file, projectRoot) })
    }
  }

  if (!args.dryRun) {
    let backupPath = null
    if (args.backup) backupPath = await backupAnime(animePath)
    await writeJson(animePath, project)
    summary.backupPath = backupPath
    summary.written = animePath
  }

  JSON.parse(JSON.stringify(project))
  console.log(JSON.stringify(summary, null, 2))
}

main().catch(error => {
  console.error(error.message)
  console.error('')
  console.error(usage())
  process.exit(1)
})
