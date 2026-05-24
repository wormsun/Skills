#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

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
const STANDARD_SET = new Set(STANDARD_NAMES);
const DETAIL_NAMES = ["前发", "后发"];
const DETAIL_SET = new Set(DETAIL_NAMES);

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
    "  node faa-normalize-character-export.js --config D:/exports/Hero/config.json",
    "  node faa-normalize-character-export.js --dir D:/exports/Hero --apply",
    "  node faa-normalize-character-export.js --dir D:/exports/characters --recursive --apply",
    "",
    "Default mode prints diagnostics only. --apply updates config node names without creating backups.",
    "Pass --backup only when you explicitly want a .bak copy before writing.",
    "--dir first checks D:/dir/config.json. If it is missing, it recursively finds child config.json files.",
  ].join("\n");
}

function findConfigPaths(args) {
  if (args.config) return [path.resolve(String(args.config))];
  if (!args.dir) throw new Error("Missing --config or --dir");

  const dir = path.resolve(String(args.dir));
  const direct = path.join(dir, "config.json");
  if (fs.existsSync(direct)) return [direct];

  const found = [];
  walkForConfigs(dir, found);
  found.sort((a, b) => a.localeCompare(b));
  if (found.length > 0) return found;
  throw new Error("Missing --config or --dir");
}

function walkForConfigs(dir, out) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkForConfigs(full, out);
    } else if (entry.isFile() && entry.name === "config.json") {
      out.push(full);
    }
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonWithOptionalBackup(filePath, data, backup) {
  if (backup) {
    const backupPath = `${filePath}.${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
    fs.copyFileSync(filePath, backupPath);
  }
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function traverse(node, parent, depth, out) {
  if (!node || typeof node !== "object") return out;
  out.push({ node, parent, depth, path: buildPath(parent, node) });
  for (const child of node.children || []) traverse(child, node, depth + 1, out);
  return out;
}

function buildPath(parent, node) {
  if (!parent || !parent.__faaPath) {
    Object.defineProperty(node, "__faaPath", { value: node.name || "", enumerable: false, configurable: true });
    return node.__faaPath;
  }
  Object.defineProperty(node, "__faaPath", {
    value: `${parent.__faaPath}/${node.name || ""}`,
    enumerable: false,
    configurable: true,
  });
  return node.__faaPath;
}

function stripInternalPathProps(entries) {
  for (const entry of entries) {
    try { delete entry.node.__faaPath; } catch {}
  }
}

function normalizedText(value) {
  return String(value || "")
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

function inferHairPolicy(entries) {
  const variants = new Set();
  for (const entry of entries) {
    if (entry.depth === 0) continue;
    const kind = classifyHairText(normalizedText(entry.node.name));
    if (kind) variants.add(kind);
  }
  return {
    split: variants.has("front") && variants.has("back"),
    variants: Array.from(variants).sort(),
  };
}

function transformCenter(node) {
  const transform = node.instanceTransform || {};
  const reg = transform.registrationPoint || {};
  const width = Number(transform.width || 0);
  const height = Number(transform.height || 0);
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

function inferBodyCenterX(entries) {
  const bodyEntry = entries.find((entry) => {
    const text = normalizedText(entry.node.name);
    return text === "身体" || hasAny(text, ["身子", "躯干", "body", "torso"]);
  });
  if (bodyEntry) return transformCenter(bodyEntry.node).x;

  let largest = null;
  for (const entry of entries) {
    if (entry.depth === 0) continue;
    const center = transformCenter(entry.node);
    if (!largest || center.area > largest.area) largest = center;
  }
  if (largest && largest.area > 0) return largest.x;

  const xs = entries
    .filter((entry) => entry.depth > 0)
    .map((entry) => transformCenter(entry.node).x)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  return xs.length ? xs[Math.floor(xs.length / 2)] : 0;
}

function sideFromCenter(node, bodyCenterX) {
  const c = transformCenter(node);
  const delta = c.x - bodyCenterX;
  if (!Number.isFinite(delta)) return null;
  if (Math.abs(delta) < Math.max(2, c.width * 0.08)) return null;
  return delta < 0 ? "left" : "right";
}

function suggestName(node, bodyCenterX, hairPolicy) {
  const original = String(node.name || "");
  if (STANDARD_SET.has(original)) {
    return { suggested: original, confidence: 1, reasons: ["already-standard"], apply: false };
  }

  const text = normalizedText(original);
  const hairKind = classifyHairText(text);
  if (hairKind) {
    if (hairPolicy && hairPolicy.split) {
      if (hairKind === "front") {
        return { suggested: "前发", confidence: 0.95, reasons: ["source-name", "split-hair-preserved"], apply: original !== "前发" };
      }
      if (hairKind === "back") {
        return { suggested: "后发", confidence: 0.95, reasons: ["source-name", "split-hair-preserved"], apply: original !== "后发" };
      }
      return { suggested: "头发", confidence: 0.9, reasons: ["source-name", "hair-container-or-generic"], apply: true };
    }
    return { suggested: "头发", confidence: 0.95, reasons: ["source-name", "single-hair-normalized"], apply: original !== "头发" };
  }

  const explicitLeft = hasAny(text, ["左", "left", "larm", "lleg", "l_"]);
  const explicitRight = hasAny(text, ["右", "right", "rarm", "rleg", "r_"]);
  const side = explicitLeft ? "left" : explicitRight ? "right" : sideFromCenter(node, bodyCenterX);
  const reasons = [];
  if (explicitLeft || explicitRight) reasons.push("source-name-side");
  else if (side) reasons.push("config-position-side");

  if (hasAny(text, ["表情", "expression", "expr"])) return { suggested: "表情", confidence: 0.95, reasons: ["source-name"], apply: true };
  if (hasAny(text, ["面部", "脸", "face"])) return { suggested: "面部", confidence: 0.9, reasons: ["source-name"], apply: true };
  if (hasAny(text, ["头部", "头", "head"])) return { suggested: "头部", confidence: 0.85, reasons: ["source-name"], apply: true };
  if (hasAny(text, ["身体", "身子", "躯干", "body", "torso"])) return { suggested: "身体", confidence: 0.95, reasons: ["source-name"], apply: true };
  if (hasAny(text, ["双腿", "腿部", "bothlegs", "bothleg", "legs"])) return { suggested: "双腿", confidence: 0.9, reasons: ["source-name"], apply: true };

  const isArm = hasAny(text, ["臂", "手臂", "左手", "右手", "hand", "arm"]);
  const isLeg = hasAny(text, ["腿", "leg", "thigh", "calf"]);
  const upper = hasAny(text, ["上臂", "upperarm"]);
  const lowerArm = hasAny(text, ["下臂", "前臂", "lowerarm", "forearm"]);
  const thigh = hasAny(text, ["大腿", "thigh"]);
  const calf = hasAny(text, ["小腿", "calf", "shin"]);

  let suggested = null;
  let confidence = 0;
  if (isArm && side) {
    if (upper) suggested = side === "left" ? "左上臂" : "右上臂";
    else if (lowerArm) suggested = side === "left" ? "左下臂" : "右下臂";
    else suggested = side === "left" ? "左臂" : "右臂";
    confidence = explicitLeft || explicitRight ? 0.9 : 0.7;
    reasons.push("source-name-part");
  } else if (isLeg && side) {
    if (thigh) suggested = side === "left" ? "左大腿" : "右大腿";
    else if (calf) suggested = side === "left" ? "左小腿" : "右小腿";
    else suggested = side === "left" ? "左腿" : "右腿";
    confidence = explicitLeft || explicitRight ? 0.9 : 0.7;
    reasons.push("source-name-part");
  }

  if (suggested) return { suggested, confidence, reasons, apply: true };
  return { suggested: null, confidence: 0, reasons: [], apply: false };
}

function findBlockedSuggestions(items) {
  const byName = new Map();
  for (const item of items) {
    if (STANDARD_SET.has(item.currentName) || DETAIL_SET.has(item.currentName)) {
      const bucket = byName.get(item.currentName) || [];
      bucket.push(Object.assign({}, item, { suggested: item.currentName }));
      byName.set(item.currentName, bucket);
    }
    if (item.suggested && item.suggested !== item.currentName) {
      const bucket = byName.get(item.suggested) || [];
      bucket.push(item);
      byName.set(item.suggested, bucket);
    }
  }
  const blocked = new Set();
  for (const [name, bucket] of byName) {
    if (bucket.length > 1) {
      for (const item of bucket) {
        if (item.suggested !== item.currentName) blocked.add(`${item.path}=>${name}`);
      }
    }
  }
  return blocked;
}

function summarizeCoverage(entries) {
  const present = new Set();
  for (const entry of entries) {
    if (STANDARD_SET.has(entry.node.name)) present.add(entry.node.name);
  }
  return {
    present: STANDARD_NAMES.filter((name) => present.has(name)),
    missing: STANDARD_NAMES.filter((name) => !present.has(name)),
  };
}

function processConfig(configPath, args) {
  const minConfidence = Number(args.minConfidence || 0.75);
  const config = readJson(configPath);
  const entries = traverse(config, null, 0, []);
  const bodyCenterX = inferBodyCenterX(entries);
  const hairPolicy = inferHairPolicy(entries);
  const diagnostics = entries
    .filter((entry) => entry.depth > 0)
    .map((entry) => {
      const suggestion = suggestName(entry.node, bodyCenterX, hairPolicy);
      return {
        path: entry.path,
        currentName: entry.node.name || "",
        elementType: entry.node.elementType || null,
        suggested: suggestion.suggested,
        confidence: suggestion.confidence,
        reasons: suggestion.reasons,
        canApply: suggestion.apply && suggestion.suggested && suggestion.suggested !== entry.node.name && suggestion.confidence >= minConfidence,
        node: entry.node,
      };
    });

  const duplicateKeys = findBlockedSuggestions(diagnostics);
  for (const item of diagnostics) {
    if (item.canApply && duplicateKeys.has(`${item.path}=>${item.suggested}`)) {
      item.canApply = false;
      item.duplicate = true;
    }
  }

  const applied = [];
  if (args.apply) {
    for (const item of diagnostics) {
      if (!item.canApply) continue;
      item.node.name = item.suggested;
      applied.push({ path: item.path, from: item.currentName, to: item.suggested });
    }
    stripInternalPathProps(entries);
    writeJsonWithOptionalBackup(configPath, config, !!args.backup);
  } else {
    stripInternalPathProps(entries);
  }

  const coverage = summarizeCoverage(entries);
  const reportItems = diagnostics.map((item) => {
    const out = {
      path: item.path,
      currentName: item.currentName,
      suggested: item.suggested,
      confidence: item.confidence,
      reasons: item.reasons,
      canApply: item.canApply,
    };
    if (item.duplicate) out.warning = "duplicate-suggestion";
    if (!item.suggested) out.warning = "needs-review";
    return out;
  });

  return {
    ok: true,
    configPath,
    applied: args.apply ? applied : [],
    dryRun: !args.apply,
    minConfidence,
    standardNames: STANDARD_NAMES,
    detailNames: DETAIL_NAMES,
    hairPolicy,
    coverage,
    diagnostics: reportItems,
    notes: [
      "This tool updates config node names only. It does not rename PNG files.",
      "If both front and back hair are detected, 前发 and 后发 are preserved as render-layer detail names instead of being collapsed to duplicate 头发 aliases.",
      "腿部 is normalized to 双腿 when detected; 腿部 is never emitted.",
      "Low-confidence and duplicate suggestions are left unchanged for user review.",
    ],
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(usage());
    return;
  }

  const configPaths = findConfigPaths(args);
  const reports = configPaths.map((configPath) => processConfig(configPath, args));
  const applied = reports.flatMap((report) => report.applied.map((item) => Object.assign({ configPath: report.configPath }, item)));

  console.log(JSON.stringify({
    ok: true,
    dryRun: !args.apply,
    configCount: reports.length,
    configPaths,
    applied,
    reports,
    notes: [
      "When --dir points at a multi-character export root, child config.json files are processed recursively.",
      "This tool updates config node names only. It does not rename PNG files.",
    ],
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(JSON.stringify({
    ok: false,
    error: {
      code: err.code || "NORMALIZE_CHARACTER_EXPORT_FAILED",
      message: err.message || String(err),
    },
  }, null, 2));
  process.exit(1);
}
