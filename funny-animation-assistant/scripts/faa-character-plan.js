#!/usr/bin/env node
/* eslint-disable no-console */
const { execFileSync } = require("child_process");
const path = require("path");

const CLI = path.resolve(__dirname, "faa-cli.js");

const STANDARD_NAMES = [
  "身体",
  "头部",
  "表情",
  "面部",
  "头发",
  "左上臂",
  "左下臂",
  "右上臂",
  "右下臂",
  "左臂",
  "右臂",
  "左大腿",
  "左小腿",
  "右大腿",
  "右小腿",
  "左腿",
  "右腿",
  "双腿",
];

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const part = argv[i];
    if (part.startsWith("--")) {
      const key = part.slice(2);
      args[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    } else {
      args._.push(part);
    }
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node faa-character-plan.js [--frame 0] [--out D:/exports] [--flaPath D:/work/5魔.fla] [--mode auto|assembled|discrete] [--assetKind character] [--requireAssetKind] [--all]",
    "  node faa-character-plan.js --layerIndex 0 --elementIndex 0 --frame 0 --out D:/exports/Hero",
    "",
    "This script inspects first-level stage roots and prints a character export plan.",
    "It does not modify FLA files or export PNGs.",
  ].join("\n");
}

function cliJson(args, options) {
  const fullArgs = [CLI].concat(args);
  const stdout = execFileSync(process.execPath, fullArgs, {
    cwd: path.resolve(__dirname, "../../.."),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options && options.timeoutMs ? options.timeoutMs : 120000,
  });
  return JSON.parse(stdout);
}

function unwrap(response, label) {
  if (!response || response.ok === false) {
    const err = response && response.error;
    throw new Error(`${label} failed: ${err ? `${err.code || "ERROR"} ${err.message}` : "empty response"}`);
  }
  return response.result !== undefined ? response.result : response;
}

function scanStage(frameIndex) {
  const response = cliJson(["scan-frame", "--frame", String(frameIndex), "--wait-lock", "60"]);
  return unwrap(response, "scan-frame");
}

function getSymbolStructure(symbolName) {
  const response = cliJson(["structure", "--symbol", symbolName, "--wait-lock", "60"]);
  return unwrap(response, `structure ${symbolName}`);
}

function getGroupStructure(root) {
  const response = cliJson([
    "group",
    "--layerIndex",
    String(root.layerIndex),
    "--elementIndex",
    String(root.elementIndex),
    "--frameIndex",
    String(root.frameIndex || 0),
    "--wait-lock",
    "60",
  ]);
  return unwrap(response, `group ${root.name}`);
}

function textOf(item) {
  return [
    item.name,
    item.instanceName,
    item.libraryName,
    item.libraryItemName,
    item.libraryPath,
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizedText(item) {
  return textOf(item)
    .toLowerCase()
    .replace(/[ _.\-\\/|:：()[\]{}]+/g, "");
}

function hasAny(text, patterns) {
  return patterns.some((p) => text.includes(p));
}

function classifyHairText(text) {
  if (hasAny(text, ["前发", "前髮", "刘海", "浏海", "fronthair", "hairfront", "bangs"])) return "front";
  if (hasAny(text, ["后发", "後发", "後髮", "backhair", "hairback"])) return "back";
  if (hasAny(text, ["头发", "頭髮", "发型", "髮型", "hair"])) return "generic";
  return null;
}

function inferHairPolicy(parts) {
  const variants = new Set();
  for (const part of parts) {
    const kind = classifyHairText(normalizedText(part));
    if (kind) variants.add(kind);
  }
  return {
    split: variants.has("front") && variants.has("back"),
    variants: Array.from(variants).sort(),
  };
}

function centerOf(part) {
  const transform = part.instanceTransform || {};
  const reg = transform.registrationPoint || part.registrationPoint || {};
  const width = Number(transform.width !== undefined ? transform.width : part.width || 0);
  const height = Number(transform.height !== undefined ? transform.height : part.height || 0);
  const parentX = Number(reg.parentX || 0);
  const parentY = Number(reg.parentY || 0);
  const localX = Number(reg.localX || 0);
  const localY = Number(reg.localY || 0);
  return {
    x: parentX - localX + width / 2,
    y: parentY - localY + height / 2,
    width,
    height,
    area: Math.max(width, 0) * Math.max(height, 0),
  };
}

function sideFromCenter(part, bodyCenterX) {
  const c = centerOf(part);
  if (!Number.isFinite(bodyCenterX)) return null;
  const delta = c.x - bodyCenterX;
  if (Math.abs(delta) < Math.max(2, c.width * 0.08)) return null;
  return delta < 0 ? "left" : "right";
}

function suggestByName(item, bodyCenterX, hairPolicy) {
  const text = normalizedText(item);
  const hairKind = classifyHairText(text);
  if (hairKind) {
    if (hairPolicy && hairPolicy.split) {
      if (hairKind === "front") return { standardName: "前发", confidence: 0.95, reasons: ["source-name", "split-hair-preserved"] };
      if (hairKind === "back") return { standardName: "后发", confidence: 0.95, reasons: ["source-name", "split-hair-preserved"] };
      return { standardName: "头发", confidence: 0.9, reasons: ["source-name", "hair-container-or-generic"] };
    }
    return { standardName: "头发", confidence: 0.95, reasons: ["source-name", "single-hair-normalized"] };
  }

  const reasons = [];
  let name = null;
  let confidence = 0;

  const explicitLeft = hasAny(text, ["左", "left", "larm", "lleg", "l_"]);
  const explicitRight = hasAny(text, ["右", "right", "rarm", "rleg", "r_"]);
  const side = explicitLeft ? "left" : explicitRight ? "right" : sideFromCenter(item, bodyCenterX);
  if (explicitLeft || explicitRight) reasons.push("source-name-side");
  else if (side) reasons.push("config-position-side");

  if (hasAny(text, ["表情", "expression", "expr"])) return { standardName: "表情", confidence: 0.95, reasons: ["source-name"] };
  if (hasAny(text, ["面部", "脸", "face"])) return { standardName: "面部", confidence: 0.9, reasons: ["source-name"] };
  if (hasAny(text, ["头部", "头", "head"])) return { standardName: "头部", confidence: 0.85, reasons: ["source-name"] };
  if (hasAny(text, ["身体", "身子", "躯干", "body", "torso"])) return { standardName: "身体", confidence: 0.95, reasons: ["source-name"] };
  if (hasAny(text, ["双腿", "腿部", "bothlegs", "bothleg", "legs"])) return { standardName: "双腿", confidence: 0.9, reasons: ["source-name"] };

  const isArm = hasAny(text, ["臂", "手臂", "左手", "右手", "hand", "arm"]);
  const isLeg = hasAny(text, ["腿", "leg", "thigh", "calf"]);
  const upper = hasAny(text, ["上臂", "upperarm"]);
  const lowerArm = hasAny(text, ["下臂", "前臂", "lowerarm", "forearm"]);
  const thigh = hasAny(text, ["大腿", "thigh"]);
  const calf = hasAny(text, ["小腿", "calf", "shin"]);

  if (isArm && side) {
    if (upper) name = side === "left" ? "左上臂" : "右上臂";
    else if (lowerArm) name = side === "left" ? "左下臂" : "右下臂";
    else name = side === "left" ? "左臂" : "右臂";
    confidence = explicitLeft || explicitRight ? 0.9 : 0.7;
  } else if (isLeg && side) {
    if (thigh) name = side === "left" ? "左大腿" : "右大腿";
    else if (calf) name = side === "left" ? "左小腿" : "右小腿";
    else name = side === "left" ? "左腿" : "右腿";
    confidence = explicitLeft || explicitRight ? 0.9 : 0.7;
  }

  if (name) {
    reasons.push("source-name-part");
    return { standardName: name, confidence, reasons };
  }

  return { standardName: null, confidence: 0, reasons: [] };
}

function collectSymbolParts(structure) {
  const parts = [];
  const layers = (structure && structure.layers) || [];
  for (let li = layers.length - 1; li >= 0; li--) {
    const layer = layers[li];
    if (!layer || layer.type === "guide") continue;
    for (const part of layer.parts || []) {
      parts.push(Object.assign({ sourceLayerName: layer.name, sourceLayerIndex: layer.index }, part));
    }
  }
  return parts;
}

function collectGroupParts(groupResult) {
  return (groupResult.members || []).map((member) => Object.assign({ partId: member.memberId }, member));
}

function inferBodyCenterX(parts) {
  const namedBody = parts.find((part) => {
    const text = normalizedText(part);
    return hasAny(text, ["身体", "身子", "躯干", "body", "torso"]);
  });
  if (namedBody) return centerOf(namedBody).x;

  let largest = null;
  for (const part of parts) {
    const c = centerOf(part);
    if (!largest || c.area > largest.area) largest = c;
  }
  if (largest && largest.area > 0) return largest.x;

  const centers = parts.map((part) => centerOf(part).x).filter(Number.isFinite).sort((a, b) => a - b);
  return centers.length ? centers[Math.floor(centers.length / 2)] : 0;
}

function inferMode(parts, requestedMode) {
  if (requestedMode && requestedMode !== "auto") return requestedMode;
  const names = parts.map(normalizedText).join(" ");
  if (hasAny(names, ["双腿", "腿部", "bothlegs", "bothleg"])) return "assembled";
  if (hasAny(names, ["左上臂", "左下臂", "右上臂", "右下臂", "左大腿", "左小腿", "右大腿", "右小腿", "upperarm", "lowerarm", "thigh", "calf"])) {
    return "discrete";
  }
  return "auto";
}

function recommendLevel(root, parts, mode, candidates) {
  if (["bitmap", "text", "shape"].includes(root.elementType || "")) {
    return { level: 1, reason: `${root.elementType} has no useful child structure` };
  }

  if (mode === "assembled") {
    return { level: 2, reason: "assembled character: preserve designed major parts such as 双腿" };
  }

  const confident = candidates.filter((item) => item.standardName && item.confidence >= 0.7);
  const directStandard = new Set(confident.map((item) => item.standardName));
  const hasBody = directStandard.has("身体");
  const hasLimb = ["左臂", "右臂", "左腿", "右腿", "双腿", "左上臂", "右上臂", "左大腿", "右大腿"].some((name) => directStandard.has(name));

  if (parts.length >= 3 && (hasBody || hasLimb || confident.length >= 3)) {
    return { level: 2, reason: "direct children already look like standard body parts" };
  }

  const childContainers = parts.filter((part) => part.hasChildren || (part.children && part.children.length));
  if (childContainers.length > 0 && parts.length <= 3) {
    return { level: 3, reason: "few direct containers; inspect one level deeper to reach standard parts" };
  }

  return { level: 2, reason: "safe character default; avoid over-fine recursive export" };
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:\\-]+$/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function buildExportCommand(root, level, outRoot, timeout) {
  const args = [
    "node",
    "<skill-dir>/scripts/faa-cli.js",
    "export-stage-one",
    "--layerIndex",
    root.layerIndex,
    "--elementIndex",
    root.elementIndex,
    "--frame",
    root.frameIndex || 0,
    "--level",
    level,
  ];
  if (outRoot) args.push("--out", outRoot);
  if (timeout) args.push("--timeout", timeout);
  return args.map(shellQuote).join(" ");
}

function pluginSafeFolderName(value) {
  return String(value || "character")
    .replace(/[\/\\:?*|"<>. \u3000]/g, "_")
    .slice(0, 80) || "character";
}

function stripFlaExtension(value) {
  return String(value || "").replace(/\.(fla|xfl)$/i, "");
}

function inferFlaStem(args) {
  const explicit = args.flaName || args.documentName || args.docName;
  if (explicit) return stripFlaExtension(path.basename(String(explicit)));
  if (args.flaPath || args.path || args.documentPath) {
    return stripFlaExtension(path.basename(String(args.flaPath || args.path || args.documentPath)));
  }
  return null;
}

function computeEffectiveOutputRoot(args) {
  if (!args.out) {
    return {
      requestedOutputRoot: null,
      effectiveOutputRoot: null,
      flaSubfolder: null,
      flaSubfolderApplied: false,
      notes: ["No --out was provided in the planner request."],
    };
  }

  const requestedOutputRoot = String(args.out);
  const flaStem = inferFlaStem(args);
  const normalizedFlaSubfolder = flaStem ? pluginSafeFolderName(flaStem) : null;
  if (!flaStem || args.noFlaSubdir || args.noFlaFolder) {
    return {
      requestedOutputRoot,
      effectiveOutputRoot: requestedOutputRoot,
      flaBaseName: flaStem,
      flaSubfolder: normalizedFlaSubfolder,
      flaSubfolderApplied: false,
      notes: flaStem
        ? ["FLA subfolder was disabled by --noFlaSubdir/--noFlaFolder."]
        : ["No FLA path/name was provided, so the requested output root is used directly."],
    };
  }

  const normalizedBase = pluginSafeFolderName(path.basename(requestedOutputRoot));
  const alreadyEndsWithFlaName = normalizedBase === normalizedFlaSubfolder;
  const effectiveOutputRoot = alreadyEndsWithFlaName
    ? requestedOutputRoot
    : path.join(requestedOutputRoot, normalizedFlaSubfolder);

  return {
    requestedOutputRoot,
    effectiveOutputRoot,
    flaBaseName: flaStem,
    flaSubfolder: normalizedFlaSubfolder,
    flaSubfolderApplied: !alreadyEndsWithFlaName,
    notes: alreadyEndsWithFlaName
      ? ["Requested output root already ends with the FLA name; no extra FLA subfolder was appended."]
      : ["Normalized FLA name was appended to the requested output root to avoid cross-FLA stage-name collisions."],
  };
}

function buildOutputExpectation(root, outRoot) {
  if (!outRoot) {
    return {
      outputRoot: null,
      pluginSubfolder: null,
      configPathHint: null,
      notes: ["No --out was provided in the planner request."],
    };
  }
  const displayName = root.name || root.libraryItemName || `layer_${root.layerIndex}_element_${root.elementIndex}`;
  const pluginSubfolder = pluginSafeFolderName(displayName);
  return {
    outputRoot: outRoot,
    pluginSubfolder,
    configPathHint: path.join(outRoot, pluginSubfolder, "config.json"),
    notes: [
      "Pass the shared output root to export-stage-one.",
      "The plugin creates this character subfolder from the stage display name.",
      "If the folder already exists, the plugin may append a unique suffix.",
    ],
  };
}

function selectRoots(characters, args) {
  const hasLayer = args.layerIndex !== undefined;
  const hasElement = args.elementIndex !== undefined;
  const nameFilter = args.name ? String(args.name) : null;
  args.__rootSelectionExplicit = !!(hasLayer || hasElement || nameFilter || args.all || args.allRoots || args.exportAll);
  return characters.filter((root) => {
    if (hasLayer && Number(root.layerIndex) !== Number(args.layerIndex)) return false;
    if (hasElement && Number(root.elementIndex) !== Number(args.elementIndex)) return false;
    if (nameFilter && !textOf(root).includes(nameFilter)) return false;
    return true;
  });
}

function analyzeRoot(root, args) {
  const elementType = root.elementType || "symbol";
  let parts = [];
  let structureError = null;

  try {
    if (elementType === "symbol") {
      const structureResult = getSymbolStructure(root.libraryItemName || root.libraryPath || root.name);
      parts = collectSymbolParts(structureResult.structure);
    } else if (elementType === "group") {
      const groupResult = getGroupStructure(root);
      parts = collectGroupParts(groupResult);
    }
  } catch (err) {
    structureError = err.message || String(err);
  }

  const bodyCenterX = inferBodyCenterX(parts);
  const hairPolicy = inferHairPolicy(parts);
  const candidates = parts.map((part) => {
    const suggestion = suggestByName(part, bodyCenterX, hairPolicy);
    return {
      partId: part.partId || part.memberId || null,
      sourceName: part.name || "",
      sourceLayerName: part.sourceLayerName || "",
      elementType: part.elementType || "unknown",
      hasChildren: !!part.hasChildren,
      standardName: suggestion.standardName,
      confidence: suggestion.confidence,
      reasons: suggestion.reasons,
    };
  });
  const mode = inferMode(parts, args.mode || "auto");
  const recommendation = recommendLevel(root, parts, mode, candidates);
  const confirmation = buildPlanConfirmation({
    mode,
    recommendation,
    candidates,
    structureError,
  });
  const outRoot = args.__effectiveOutputRoot || null;
  const output = buildOutputExpectation(root, outRoot);

  return {
    stageRoot: {
      name: root.name,
      libraryItemName: root.libraryItemName || null,
      layerIndex: root.layerIndex,
      elementIndex: root.elementIndex,
      frameIndex: root.frameIndex || 0,
      elementType,
    },
    mode,
    recommendedLevel: recommendation.level,
    reason: recommendation.reason,
    structureError,
    hairPolicy,
    directPartCount: parts.length,
    directParts: candidates,
    warnings: buildWarnings(candidates, structureError),
    confirmation,
    output: Object.assign({}, output, {
      requestedOutputRoot: args.__requestedOutputRoot || null,
      flaBaseName: args.__flaBaseName || null,
      flaSubfolder: args.__flaSubfolder || null,
      flaSubfolderApplied: !!args.__flaSubfolderApplied,
      outputRootNotes: args.__outputRootNotes || [],
    }),
    exportCommand: buildExportCommand(root, recommendation.level, outRoot, args.timeout || 600),
  };
}

function buildWarnings(candidates, structureError) {
  const warnings = [];
  if (structureError) warnings.push(structureError);
  const seen = new Map();
  for (const candidate of candidates) {
    if (!candidate.standardName) continue;
    if (candidate.confidence < 0.75) warnings.push(`Low-confidence name: ${candidate.sourceName} -> ${candidate.standardName}`);
    const bucket = seen.get(candidate.standardName) || [];
    bucket.push(candidate.sourceName);
    seen.set(candidate.standardName, bucket);
  }
  for (const [name, sources] of seen) {
    if (sources.length > 1) warnings.push(`Ambiguous duplicate standard name ${name}: ${sources.join(", ")}`);
  }
  return warnings;
}

function confirmationReason(code, message, question, details) {
  const out = { code, message };
  if (question) out.question = question;
  if (details !== undefined) out.details = details;
  return out;
}

function buildPlanConfirmation(plan) {
  const reasons = [];
  if (plan.structureError) {
    reasons.push(confirmationReason(
      "structure-inspection-failed",
      "The planner could not inspect the root structure completely.",
      "当前人物结构读取失败，是否仍按保守 Level 2 导出？",
      plan.structureError
    ));
  }

  if (plan.mode === "auto") {
    reasons.push(confirmationReason(
      "ambiguous-character-mode",
      "The planner cannot confidently decide whether this is an assembled or discrete character.",
      "这些人物的走路/跑步动画是否已经在腿部素材里做好？如果是按组装人物导出为 双腿，否则按离散人物保留 左腿/右腿。"
    ));
  }

  if (plan.recommendation.level >= 3) {
    reasons.push(confirmationReason(
      "level-3-overfine-risk",
      "Level 3 may expose over-fine pieces instead of usable character parts.",
      "Level 3 可能拆出更细部件，是否优先保留大部件？"
    ));
  }

  const lowConfidence = plan.candidates
    .filter((item) => item.standardName && item.confidence > 0 && item.confidence < 0.75)
    .map((item) => ({ sourceName: item.sourceName, standardName: item.standardName, confidence: item.confidence }));
  if (lowConfidence.length > 0) {
    reasons.push(confirmationReason(
      "low-confidence-standard-name",
      "Some standard-name suggestions rely on weak position or naming signals.",
      "部分部件命名置信度较低，是否确认按这些建议继续？",
      lowConfidence
    ));
  }

  const byStandardName = new Map();
  for (const candidate of plan.candidates) {
    if (!candidate.standardName) continue;
    const bucket = byStandardName.get(candidate.standardName) || [];
    bucket.push(candidate.sourceName);
    byStandardName.set(candidate.standardName, bucket);
  }
  const duplicates = [];
  for (const [standardName, sourceNames] of byStandardName) {
    if (sourceNames.length > 1) duplicates.push({ standardName, sourceNames });
  }
  if (duplicates.length > 0) {
    reasons.push(confirmationReason(
      "duplicate-standard-name",
      "Multiple parts would resolve to the same standard name.",
      "多个部件会映射到同一个标准名，是否需要先手动确认命名？",
      duplicates
    ));
  }

  return {
    needsUserConfirmation: reasons.length > 0,
    reasons,
  };
}

function buildGlobalConfirmation(args, roots, plans) {
  const reasons = [];
  const assetKind = String(args.assetKind || args.kind || "");
  if ((args.requireAssetKind || args.requireKind) && !assetKind) {
    reasons.push(confirmationReason(
      "unknown-asset-kind",
      "The caller required an explicit asset kind, but none was provided.",
      "这是要导出人物、场景模板、道具、表情还是背景？"
    ));
  }

  if (roots.length > 1 && !args.__rootSelectionExplicit) {
    reasons.push(confirmationReason(
      "multiple-stage-roots",
      "Multiple first-level stage roots match this character plan.",
      "我看到舞台上有多个一级元素，是要全部导出，还是只导出指定素材？",
      roots.map((root) => ({
        name: root.name,
        layerIndex: root.layerIndex,
        elementIndex: root.elementIndex,
        elementType: root.elementType,
      }))
    ));
  }

  for (const plan of plans) {
    if (!plan.confirmation || !plan.confirmation.needsUserConfirmation) continue;
    reasons.push(...plan.confirmation.reasons.map((reason) => Object.assign({
      stageRoot: plan.stageRoot.name,
      layerIndex: plan.stageRoot.layerIndex,
      elementIndex: plan.stageRoot.elementIndex,
    }, reason)));
  }

  return {
    needsUserConfirmation: reasons.length > 0,
    reasons,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(usage());
    return;
  }
  const explicitAssetKind = args.assetKind || args.kind;
  const assetKind = String(explicitAssetKind || "character");
  if (assetKind !== "character") {
    console.log(JSON.stringify({
      ok: false,
      error: {
        code: "ASSET_KIND_MISMATCH",
        message: `faa-character-plan only supports character assets, got ${assetKind}.`,
      },
      assetKind,
    }, null, 2));
    process.exitCode = 1;
    return;
  }
  const frameIndex = Number(args.frameIndex !== undefined ? args.frameIndex : args.frame || 0);
  const scan = scanStage(frameIndex);
  const characters = scan.characters || [];
  const roots = selectRoots(characters, args);
  if (roots.length === 0) {
    console.log(JSON.stringify({
      ok: false,
      error: {
        code: "NO_STAGE_ROOT",
        message: "No matching first-level stage element found. Character export requires the whole character to be a stage root.",
      },
      frameIndex,
      availableRoots: characters.map((root) => ({
        name: root.name,
        layerIndex: root.layerIndex,
        elementIndex: root.elementIndex,
        elementType: root.elementType,
      })),
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  args.__singleRoot = roots.length === 1;
  const outputRoot = computeEffectiveOutputRoot(args);
  args.__requestedOutputRoot = outputRoot.requestedOutputRoot;
  args.__effectiveOutputRoot = outputRoot.effectiveOutputRoot;
  args.__flaBaseName = outputRoot.flaBaseName;
  args.__flaSubfolder = outputRoot.flaSubfolder;
  args.__flaSubfolderApplied = outputRoot.flaSubfolderApplied;
  args.__outputRootNotes = outputRoot.notes;
  const plans = roots.map((root) => analyzeRoot(root, args));
  const confirmation = buildGlobalConfirmation(args, roots, plans);
  console.log(JSON.stringify({
    ok: true,
    assetKind,
    assetKindExplicit: !!explicitAssetKind,
    frameIndex,
    outputRoot,
    standardNames: STANDARD_NAMES,
    confirmation,
    notes: [
      "Use export-stage-one per stage root so each character can have its own export level.",
      "If both front and back hair are detected, preserve 前发 and 后发 instead of collapsing both into duplicate 头发 aliases.",
      "Use 双腿 only for assembled characters whose legs are already one designed part.",
      "Do not use 腿部.",
    ],
    plans,
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(JSON.stringify({
    ok: false,
    error: {
      code: err.code || "CHARACTER_PLAN_FAILED",
      message: err.message || String(err),
    },
  }, null, 2));
  process.exit(1);
}
