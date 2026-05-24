#!/usr/bin/env node
/* eslint-disable no-console */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (part.startsWith("--")) {
      const key = part.slice(2);
      const next = argv[i + 1];
      args[key] = next && !next.startsWith("--") ? argv[++i] : true;
    } else {
      args._.push(part);
    }
  }
  return args;
}

function usage() {
  return `Usage:
  node faa-export-multiframe-scenes.js --fla D:/work/scenes.fla --out D:/exports/scenes [options]

Options:
  --cli <path>                 Path to faa-cli.js. Defaults to sibling faa-cli.js.
  --logRoot <path>             Directory for logs. Defaults to <out>/_faa_multiframe_export_<stamp>.
  --layerIndex <n>             Stage layer index to export. Default: first scanned item.
  --elementIndex <n>           Stage element index to export. Default: first scanned item.
  --level <n>                  Export level. Default: 2.
  --scaleMode <none|ratio|custom>  Default: none.
  --scaleRatio <n>             Default: 100.
  --targetWidth <n>            Custom export width.
  --targetHeight <n>           Custom export height.
  --fallbackCategory <name>    Fallback category for generic frame roots. Default: 场景模板.
  --categoryRanges <rules>     Zero-based ranges, e.g. "0-37=古代室内;38-45=古代客栈走廊".
  --scanMode <keyframes|all>   Candidate frame mode from plugin timeline. Default: keyframes.
  --namePrefixWidth <n>        Folder number width. Default: 3.
  --exportTimeout <seconds>    Default: 1800.
  --jobTimeout <seconds>       Default: 600.
  --jobPoll <seconds>          Default: 15.
  --listOnly                   Discover and name frames without exporting.
  --directOut                  Export directly into --out instead of --out/<normalized FLA name>.\n  --closeWhenDone              Close the FLA without saving after the run.
`;
}

function requireArg(args, key, aliases = []) {
  for (const name of [key, ...aliases]) {
    if (args[name] !== undefined && args[name] !== true && args[name] !== "") return String(args[name]);
  }
  throw new Error(`Missing required argument --${key}`);
}

function numberArg(args, key, fallback) {
  if (args[key] === undefined || args[key] === true || args[key] === "") return fallback;
  const n = Number(args[key]);
  if (!Number.isFinite(n)) throw new Error(`--${key} must be a number`);
  return n;
}

function boolArg(args, key) {
  return args[key] === true || args[key] === "true" || args[key] === "1";
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function logLine(logPath, message) {
  const line = `${new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "")} ${message}`;
  fs.appendFileSync(logPath, `${line}\n`, "utf8");
  console.log(line);
}

function runCli(cliPath, cliArgs, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...cliArgs], {
      cwd: path.dirname(cliPath),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => {
      const raw = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
      let json = null;
      try { json = raw ? JSON.parse(raw) : null; } catch {}
      if (options.outputPath) fs.writeFileSync(options.outputPath, raw ? `${raw}\n` : "", "utf8");
      resolve({ code, stdout, stderr, raw, json });
    });
  });
}

async function runCliJson(cliPath, cliArgs, options = {}) {
  const result = await runCli(cliPath, cliArgs, options);
  if (result.code !== 0) {
    const msg = result.json && result.json.error ? result.json.error.message : result.raw;
    throw new Error(`faa-cli ${cliArgs[0]} failed: ${msg || `exit ${result.code}`}`);
  }
  if (!result.json) throw new Error(`faa-cli ${cliArgs[0]} did not return JSON: ${result.raw}`);
  if (result.json.ok === false) {
    const err = result.json.error || {};
    throw new Error(`faa-cli ${cliArgs[0]} failed: ${err.code || "ERROR"}: ${err.message || result.raw}`);
  }
  return result.json;
}

function parseCategoryRanges(text) {
  if (!text) return [];
  return String(text).split(";").map((chunk) => {
    const item = chunk.trim();
    if (!item) return null;
    const eq = item.indexOf("=");
    if (eq < 0) throw new Error(`Invalid --categoryRanges item: ${item}`);
    const range = item.slice(0, eq).trim();
    const name = item.slice(eq + 1).trim();
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(range);
    if (!m) throw new Error(`Invalid frame range: ${range}`);
    const start = Number(m[1]);
    const end = m[2] === undefined ? start : Number(m[2]);
    if (end < start) throw new Error(`Invalid descending frame range: ${range}`);
    return { start, end, name };
  }).filter(Boolean);
}

function fallbackForFrame(frameIndex, rules, fallbackCategory) {
  const found = rules.find((rule) => frameIndex >= rule.start && frameIndex <= rule.end);
  return found ? found.name : fallbackCategory;
}

function basenameFromSource(name) {
  return String(name || "").replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
}

function safeName(name) {
  const cleaned = String(name || "")
    .replace(/[\\/:?*|"<>. \u3000]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._\s]+|[._\s]+$/g, "");
  return cleaned || "未命名";
}

function normalizeSceneName(sourceName, frameIndex, options) {
  let base = basenameFromSource(sourceName);
  if (!base || base === "DOMGroup" || /^元件(\s|_|$)/.test(base) || /^图层/.test(base)) {
    base = `${fallbackForFrame(frameIndex, options.categoryRules, options.fallbackCategory)}_第${String(frameIndex + 1).padStart(2, "0")}景`;
  }
  return `${String(frameIndex + 1).padStart(options.namePrefixWidth, "0")}_${safeName(base)}`;
}

function normalizedFlaBaseName(flaPath) {
  return safeName(path.basename(flaPath, path.extname(flaPath)));
}

function effectiveOutputRoot(requestedOutRoot, flaPath, directOut) {
  if (directOut) return requestedOutRoot;
  const flaBase = normalizedFlaBaseName(flaPath);
  const outBase = safeName(path.basename(requestedOutRoot));
  if (outBase === flaBase) return requestedOutRoot;
  return path.join(requestedOutRoot, flaBase);
}

function collectCandidateFrames(timeline, scanMode) {
  const frameCount = Number(timeline.frameCount || 0);
  if (scanMode === "all") {
    return Array.from({ length: frameCount }, (_, i) => i);
  }
  const set = new Set();
  for (const layer of timeline.layers || []) {
    if (layer.visible === false || layer.type === "folder" || layer.type === "guide") continue;
    for (const kf of layer.keyframes || []) {
      if (Number.isFinite(Number(kf.frameIndex))) set.add(Number(kf.frameIndex));
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

function stageItemsFromScan(scanJson) {
  if (!scanJson || scanJson.ok === false) return [];
  const result = scanJson.result || scanJson;
  return result.characters || [];
}

function pickStageItem(items, layerIndex, elementIndex) {
  if (layerIndex === null || layerIndex === undefined || elementIndex === null || elementIndex === undefined) {
    return items[0] || null;
  }
  return items.find((item) => Number(item.layerIndex) === layerIndex && Number(item.elementIndex) === elementIndex) || null;
}

function sceneDone(outRoot, exportName) {
  return fs.existsSync(path.join(outRoot, exportName, "config.json"));
}

async function discoverFrames(cliPath, timeline, opts, logPath, logRoot) {
  const candidates = collectCandidateFrames(timeline, opts.scanMode);
  const frames = [];
  for (const frameIndex of candidates) {
    const tag = String(frameIndex + 1).padStart(opts.namePrefixWidth, "0");
    const scanPath = path.join(logRoot, `scan_${tag}.json`);
    const scan = await runCliJson(cliPath, ["scan-frame", "--frame", String(frameIndex), "--wait-lock", "60", "--timeout", String(opts.jobTimeout)], { outputPath: scanPath });
    const items = stageItemsFromScan(scan);
    const selected = pickStageItem(items, opts.layerIndex, opts.elementIndex);
    if (!selected) continue;
    const sourceName = selected.libraryItemName || selected.name || "";
    const exportName = normalizeSceneName(sourceName, frameIndex, opts);
    frames.push({
      frameIndex,
      sourceName,
      exportName,
      layerIndex: Number(selected.layerIndex),
      elementIndex: Number(selected.elementIndex),
      stageName: selected.name || null,
      libraryItemName: selected.libraryItemName || null,
      elementType: selected.elementType || null,
    });
    logLine(logPath, `DISCOVER frame=${frameIndex} name=${exportName} source=${sourceName || selected.name || ""}`);
  }
  return frames;
}

async function waitPluginJob(cliPath, exportName, opts, logRoot, tag) {
  const startedAt = Date.now();
  const maxWaitMs = Math.max(opts.exportTimeout, opts.jobTimeout) * 1000;
  while (true) {
    const jobPath = path.join(logRoot, `job_${tag}.json`);
    const job = await runCli(cliPath, ["job", "--wait-lock", "60", "--timeout", String(opts.jobTimeout)], { outputPath: jobPath });
    const raw = job.raw || "";
    if (sceneDone(opts.outRoot, exportName) && /"busy"\s*:\s*false/.test(raw)) return "success";
    if (sceneDone(opts.outRoot, exportName) && /"status"\s*:\s*"success"/.test(raw)) return "success";
    if (/"busy"\s*:\s*false/.test(raw)) return "idle";
    if (Date.now() - startedAt >= maxWaitMs) return "timeout";
    await new Promise((resolve) => setTimeout(resolve, opts.jobPoll * 1000));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (boolArg(args, "help") || boolArg(args, "h")) {
    console.log(usage());
    return;
  }

  const cliPath = path.resolve(String(args.cli || path.join(__dirname, "faa-cli.js")));
  const flaPath = path.resolve(requireArg(args, "fla", ["flaPath"]));
  const requestedOutRoot = path.resolve(requireArg(args, "out", ["outRoot"]));
  const outRoot = effectiveOutputRoot(requestedOutRoot, flaPath, boolArg(args, "directOut"));
  const logRoot = path.resolve(String(args.logRoot || path.join(outRoot, `_faa_multiframe_export_${timestamp()}`)));
  const opts = {
    outRoot,
    requestedOutRoot,
    directOut: boolArg(args, "directOut"),
    flaFolderName: normalizedFlaBaseName(flaPath),
    layerIndex: args.layerIndex === undefined ? null : numberArg(args, "layerIndex", null),
    elementIndex: args.elementIndex === undefined ? null : numberArg(args, "elementIndex", null),
    level: numberArg(args, "level", 2),
    scaleMode: String(args.scaleMode || "none"),
    scaleRatio: numberArg(args, "scaleRatio", 100),
    targetWidth: numberArg(args, "targetWidth", numberArg(args, "width", 0)),
    targetHeight: numberArg(args, "targetHeight", numberArg(args, "height", 0)),
    fallbackCategory: String(args.fallbackCategory || "场景模板"),
    categoryRules: parseCategoryRanges(args.categoryRanges || ""),
    scanMode: String(args.scanMode || "keyframes"),
    namePrefixWidth: numberArg(args, "namePrefixWidth", 3),
    openTimeout: numberArg(args, "openTimeout", 600),
    exportTimeout: numberArg(args, "exportTimeout", 1800),
    jobTimeout: numberArg(args, "jobTimeout", 600),
    jobPoll: numberArg(args, "jobPoll", 15),
  };
  if (!["keyframes", "all"].includes(opts.scanMode)) throw new Error("--scanMode must be keyframes or all");

  ensureDir(outRoot);
  ensureDir(logRoot);
  const logPath = path.join(logRoot, "export.log");
  if (requestedOutRoot !== outRoot) {
    logLine(logPath, `EFFECTIVE_OUT_ROOT ${outRoot}`);
  }

  try {
    logLine(logPath, `OPEN ${flaPath}`);
    await runCliJson(cliPath, ["open", flaPath, "--wait-lock", "60", "--timeout", String(opts.openTimeout)], { outputPath: path.join(logRoot, "open.json") });

    const timeline = await runCliJson(cliPath, ["timeline", "--wait-lock", "60", "--timeout", String(opts.jobTimeout)], { outputPath: path.join(logRoot, "timeline.json") });
    const timelineResult = timeline.result || timeline;
    const frames = await discoverFrames(cliPath, timelineResult, opts, logPath, logRoot);
    fs.writeFileSync(path.join(logRoot, "frames.json"), `${JSON.stringify(frames, null, 2)}\n`, "utf8");
    logLine(logPath, `FRAMES nonEmpty=${frames.length}`);

    if (boolArg(args, "listOnly")) {
      const summary = { mode: "list-only", flaPath, requestedOutRoot, outRoot, directOut: opts.directOut, flaFolderName: opts.flaFolderName, frames: frames.length, manifest: path.join(logRoot, "frames.json") };
      fs.writeFileSync(path.join(logRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
      logLine(logPath, "SUMMARY list-only");
      return;
    }

    let completed = 0;
    const failed = [];
    let stoppedEarly = false;
    for (const frame of frames) {
      const tag = String(frame.frameIndex + 1).padStart(opts.namePrefixWidth, "0");
      if (sceneDone(outRoot, frame.exportName)) {
        completed += 1;
        logLine(logPath, `SKIP done frame=${frame.frameIndex} name=${frame.exportName}`);
        continue;
      }

      logLine(logPath, `EXPORT frame=${frame.frameIndex} name=${frame.exportName} source=${frame.sourceName}`);
      const exportArgs = [
        "export-stage-one",
        "--frame", String(frame.frameIndex),
        "--layerIndex", String(frame.layerIndex),
        "--elementIndex", String(frame.elementIndex),
        "--name", frame.exportName,
        "--out", outRoot,
        "--level", String(opts.level),
        "--scaleMode", opts.scaleMode,
        "--scaleRatio", String(opts.scaleRatio),
        "--wait-lock", "60",
        "--timeout", String(opts.exportTimeout),
      ];
      if (opts.targetWidth > 0) exportArgs.push("--targetWidth", String(opts.targetWidth));
      if (opts.targetHeight > 0) exportArgs.push("--targetHeight", String(opts.targetHeight));
      const exportResult = await runCli(cliPath, exportArgs, { outputPath: path.join(logRoot, `export_${tag}.json`) });
      const jobStatus = await waitPluginJob(cliPath, frame.exportName, opts, logRoot, tag);

      if (sceneDone(outRoot, frame.exportName)) {
        completed += 1;
        logLine(logPath, `DONE frame=${frame.frameIndex} name=${frame.exportName} exit=${exportResult.code} job=${jobStatus}`);
      } else {
        failed.push(frame);
        logLine(logPath, `FAIL frame=${frame.frameIndex} name=${frame.exportName} exit=${exportResult.code} job=${jobStatus}`);
        if (jobStatus === "timeout") {
          stoppedEarly = true;
          logLine(logPath, "STOP timeout while plugin job is still busy; rerun after checking/cancelling the plugin job.");
          break;
        }
      }
    }

    const configCount = countFiles(outRoot, "config.json");
    const pngCount = countFiles(outRoot, ".png");
    const summary = {
      mode: "export",
      flaPath,
      requestedOutRoot,
      outRoot,
      directOut: opts.directOut,
      flaFolderName: opts.flaFolderName,
      level: opts.level,
      scaleMode: opts.scaleMode,
      scaleRatio: opts.scaleRatio,
      targetWidth: opts.targetWidth,
      targetHeight: opts.targetHeight,
      completed,
      failed: failed.length,
      stoppedEarly,
      configCount,
      pngCount,
      failedFrames: failed,
    };
    fs.writeFileSync(path.join(logRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    logLine(logPath, `SUMMARY completed=${completed} failed=${failed.length} configs=${configCount} pngs=${pngCount}`);
  } finally {
    if (boolArg(args, "closeWhenDone")) {
      logLine(logPath, "CLOSE without save");
      await runCli(cliPath, ["close", "--no-save", "--wait-lock", "60", "--timeout", "600"], { outputPath: path.join(logRoot, "close.json") });
    }
  }
}

function countFiles(root, suffixOrName) {
  let count = 0;
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (suffixOrName.startsWith(".") ? entry.name.toLowerCase().endsWith(suffixOrName) : entry.name === suffixOrName) count += 1;
    }
  }
  walk(root);
  return count;
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: { message: err.message } }, null, 2));
  process.exit(1);
});