#!/usr/bin/env node
/* eslint-disable no-console */
const http = require("http");
const net = require("net");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const path = require("path");

const PORT = Number(process.env.FAA_BRIDGE_PORT || 17321);
const HOST = "127.0.0.1";
const DEFAULT_REQUEST_TIMEOUT_MS = Number(process.env.FAA_CLI_TIMEOUT_MS || 60000);
const EXPORT_REQUEST_TIMEOUT_MS = Number(process.env.FAA_CLI_EXPORT_TIMEOUT_MS || 10 * 60 * 1000);
const SKILL_VERSION = "0.2.0";
const EXPECTED_PROTOCOL_VERSION = "faa-agent-v1";
const LOCK_DIR = process.env.FAA_CLI_LOCK_DIR || path.join(os.tmpdir(), "funny-animation-assistant");
const LOCK_PATH = path.join(LOCK_DIR, `faa-cli-${PORT}.lock`);
let activeLock = null;

function createCliError(code, message, details) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPidAlive(pid) {
  if (!pid || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === "EPERM";
  }
}

function readLock() {
  try {
    return JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
  } catch {
    return null;
  }
}

function tryAcquireCliLock(command) {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  try {
    const fd = fs.openSync(LOCK_PATH, "wx");
    const lock = {
      path: LOCK_PATH,
      pid: process.pid,
      command: command || "",
      startedAt: new Date().toISOString(),
    };
    fs.writeFileSync(fd, JSON.stringify(lock, null, 2));
    fs.closeSync(fd);
    activeLock = lock;
    return lock;
  } catch (err) {
    if (!err || err.code !== "EEXIST") throw err;
    const existing = readLock();
    if (!existing || !isPidAlive(Number(existing.pid))) {
      try {
        fs.unlinkSync(LOCK_PATH);
      } catch {}
      return tryAcquireCliLock(command);
    }
    return null;
  }
}

async function acquireCliLock(args) {
  const command = args._.join(" ");
  var waitLock = args["wait-lock"] !== undefined ? args["wait-lock"] : args.waitLock;
  var waitSeconds = waitLock === true ? 60 : Number(waitLock || 0);
  const startedAt = Date.now();

  while (true) {
    const lock = tryAcquireCliLock(command);
    if (lock) return lock;

    const existing = readLock();
    if (!waitSeconds || Date.now() - startedAt >= waitSeconds * 1000) {
      throw createCliError(
        "FAA_CLI_BUSY",
        `已有 faa-cli 命令正在运行${existing && existing.pid ? ` (pid=${existing.pid})` : ""}`,
        { lockPath: LOCK_PATH, existing }
      );
    }
    await sleep(250);
  }
}

function releaseCliLock(lock) {
  if (!lock) return;
  const current = readLock();
  if (current && Number(current.pid) === process.pid) {
    try {
      fs.unlinkSync(lock.path);
    } catch {}
  }
  if (activeLock === lock) {
    activeLock = null;
  }
}

function releaseActiveLockAndExit(code) {
  releaseCliLock(activeLock);
  process.exit(code);
}

process.on("SIGINT", () => releaseActiveLockAndExit(130));
process.on("SIGTERM", () => releaseActiveLockAndExit(143));

function checkStatus() {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: "/status", timeout: 500 }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

function bridgeServerCandidates() {
  return [
    path.resolve(__dirname, "../bridge/server.js"),
    path.resolve(__dirname, "../../../bridge/server.js"),
  ];
}

function resolveBridgeServer() {
  const candidates = bridgeServerCandidates();
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`找不到 Bridge server.js。已检查: ${candidates.join("; ")}`);
}

function startBridge() {
  const serverPath = resolveBridgeServer();
  const child = spawn(process.execPath, [serverPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    cwd: path.dirname(serverPath),
  });
  child.unref();
  return serverPath;
}

async function ensureBridge() {
  let status = await checkStatus();
  if (status) return status;
  startBridge();
  const start = Date.now();
  while (Date.now() - start < 5000) {
    await new Promise((r) => setTimeout(r, 250));
    status = await checkStatus();
    if (status) return status;
  }
  throw new Error("Bridge 启动失败");
}

async function doctor() {
  const report = {
    ok: true,
    skillVersion: SKILL_VERSION,
    expectedProtocolVersion: EXPECTED_PROTOCOL_VERSION,
    node: {
      executable: process.execPath,
      version: process.version,
    },
    bridge: {
      host: HOST,
      port: PORT,
      candidates: bridgeServerCandidates().map((candidate) => ({
        path: candidate,
        exists: fs.existsSync(candidate),
      })),
      selectedPath: null,
      status: null,
      started: false,
    },
    plugin: {
      online: false,
      name: null,
      version: null,
    },
    nextSteps: [],
  };

  try {
    report.bridge.selectedPath = resolveBridgeServer();
  } catch (err) {
    report.ok = false;
    report.nextSteps.push(err.message);
    return report;
  }

  let status = await checkStatus();
  if (!status) {
    startBridge();
    report.bridge.started = true;
    const start = Date.now();
    while (Date.now() - start < 5000) {
      await new Promise((r) => setTimeout(r, 250));
      status = await checkStatus();
      if (status) break;
    }
    if (!status) {
      report.ok = false;
      report.nextSteps.push("Bridge 启动失败，请检查 Node.js 权限或端口是否被占用。");
      return report;
    }
  }

  report.bridge.status = status;
  report.plugin.online = !!(status && status.pluginOnline);
  if (status && status.plugin) {
    report.plugin.name = status.plugin.name || null;
    report.plugin.version = status.plugin.version || null;
  }

  if (!status.protocolVersion || status.protocolVersion !== EXPECTED_PROTOCOL_VERSION) {
    report.ok = false;
    report.nextSteps.push(`Bridge 协议版本不匹配: ${status.protocolVersion || "unknown"}，期望 ${EXPECTED_PROTOCOL_VERSION}。请停止旧 Bridge 后重新运行 doctor。`);
  }
  if (!report.plugin.online) {
    report.ok = false;
    report.nextSteps.push("打开 Adobe Animate，打开插件面板，切换到 AI自动化，并开启“允许外部工具控制”。");
  }
  if (report.nextSteps.length === 0) {
    report.nextSteps.push("环境正常，可以执行 scan、timeline、export-stage 等命令。");
  }
  return report;
}

function encodeClientFrame(text) {
  const payload = Buffer.from(text);
  const mask = crypto.randomBytes(4);
  let header;
  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | payload.length;
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  header[0] = 0x81;
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    masked[i] = payload[i] ^ mask[i % 4];
  }
  return Buffer.concat([header, mask, masked]);
}

function decodeServerFrames(state) {
  const out = [];
  let buffer = state.buffer;
  while (buffer.length >= 2) {
    const opcode = buffer[0] & 0x0f;
    let offset = 2;
    let length = buffer[1] & 0x7f;
    if (length === 126) {
      if (buffer.length < offset + 2) break;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (buffer.length < offset + 8) break;
      length = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }
    if (buffer.length < offset + length) break;
    const payload = buffer.slice(offset, offset + length);
    buffer = buffer.slice(offset + length);
    if (opcode === 1) out.push(payload.toString("utf8"));
  }
  state.buffer = buffer;
  return out;
}

function wsRequest(method, params, options) {
  return new Promise((resolve, reject) => {
    const timeoutMs = options && options.timeoutMs ? options.timeoutMs : DEFAULT_REQUEST_TIMEOUT_MS;
    const key = crypto.randomBytes(16).toString("base64");
    const socket = net.connect(PORT, HOST);
    const state = { buffer: Buffer.alloc(0), ready: false };
    const id = `req_${Date.now()}`;
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(`请求超时 (${Math.round(timeoutMs / 1000)}s)`));
    }, timeoutMs);

    function finish(fn, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      fn(value);
    }

    socket.on("connect", () => {
      socket.write(
        `GET /agent HTTP/1.1\r\nHost: ${HOST}:${PORT}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
      );
    });

    socket.on("data", (chunk) => {
      if (!state.ready) {
        const text = chunk.toString("utf8");
        const idx = text.indexOf("\r\n\r\n");
        if (idx >= 0) {
          state.ready = true;
          const rest = chunk.slice(Buffer.byteLength(text.substring(0, idx + 4)));
          socket.write(encodeClientFrame(JSON.stringify({
            type: "agent.hello",
            clientId: "faa-cli",
            clientName: "faa-cli",
            pid: process.pid,
          })));
          socket.write(encodeClientFrame(JSON.stringify({
            type: "command.request",
            id,
            method,
            params: params || {},
          })));
          if (rest.length) state.buffer = Buffer.concat([state.buffer, rest]);
        } else {
          return;
        }
      } else {
        state.buffer = Buffer.concat([state.buffer, chunk]);
      }

      for (const raw of decodeServerFrames(state)) {
        const msg = JSON.parse(raw);
        if (msg.type === "command.response" && msg.id === id) {
          socket.write(encodeClientFrame(JSON.stringify({
            type: "agent.bye",
            clientId: "faa-cli",
          })));
          setTimeout(() => finish(resolve, msg), 10);
        }
      }
    });
    socket.on("error", (err) => {
      finish(reject, err);
    });
  });
}

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

function hasArg(args, key) {
  return Object.prototype.hasOwnProperty.call(args, key);
}

function requireArg(args, key, message) {
  if (!hasArg(args, key) || args[key] === true || args[key] === "") {
    throw createCliError("INVALID_PARAMS", message || `缺少参数 --${key}`);
  }
  return args[key];
}

function parseNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw createCliError("INVALID_PARAMS", `${name} 必须是数字`);
  }
  return parsed;
}

function parseRequiredNumber(args, key) {
  return parseNumber(requireArg(args, key), `--${key}`);
}

function parseFrameIndex(args) {
  if (hasArg(args, "frameIndex")) return parseNumber(args.frameIndex, "--frameIndex");
  if (hasArg(args, "frame")) return parseNumber(args.frame, "--frame");
  return 0;
}

function exportOptionsFromArgs(args, defaultLevel) {
  const out = requireArg(args, "out", "缺少参数 --out");
  return {
    basePath: out,
    exportRoot: out,
    exportLevel: Number(args.level || defaultLevel || 1),
    useSubfolder: args.subfolder !== "false",
    scaleMode: args.scaleMode || "none",
    scaleRatio: Number(args.scaleRatio || 100),
    targetWidth: Number(args.targetWidth || args.width || 0),
    targetHeight: Number(args.targetHeight || args.height || 0),
  };
}

function scanCharacters(scanResponse) {
  return (scanResponse.result && scanResponse.result.characters) || [];
}

function findStageElement(characters, layerIndex, elementIndex) {
  return characters.find((item) => Number(item.layerIndex) === layerIndex && Number(item.elementIndex) === elementIndex);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lock = await acquireCliLock(args);
  try {
    const command = args._[0] || "status";
    const requestedTimeoutMs = args.timeoutMs
      ? Number(args.timeoutMs)
      : args.timeout
        ? Number(args.timeout) * 1000
        : null;
    if (command === "doctor") {
      console.log(JSON.stringify(await doctor(), null, 2));
      return;
    }

    const status = await ensureBridge();
    if (command === "status") {
      console.log(JSON.stringify(status, null, 2));
      return;
    }

    const map = {
      scan: ["scan_stage", {}],
      "scan-frame": ["scan_stage_at_frame", { frameIndex: Number(args.frameIndex || args.frame || args._[1] || 0) }],
      timeline: ["get_timeline_summary", {}],
      "set-frame": ["set_current_frame", { frameIndex: Number(args.frameIndex || args.frame || args._[1] || 0) }],
      structure: ["get_symbol_structure", { symbolName: args.symbol || args._[1] }],
      group: ["get_group_structure", {
        layerIndex: Number(args.layerIndex || 0),
        elementIndex: Number(args.elementIndex || 0),
        frameIndex: Number(args.frameIndex || 0),
      }],
      open: ["open_document", { path: args._[1] }],
      close: ["close_document_without_save", { path: args.path || args._[1], documentId: args.documentId }],
      cancel: ["cancel_job", {}],
      job: ["get_job_status", {}],
      export: ["export_character", {
        characterName: args.character,
        displayName: args.character,
        basePath: args.out,
        exportRoot: args.out,
        exportLevel: Number(args.level || 2),
        useSubfolder: args.subfolder !== "false",
        scaleMode: args.scaleMode || "none",
        scaleRatio: Number(args.scaleRatio || 100),
        targetWidth: Number(args.targetWidth || args.width || 0),
        targetHeight: Number(args.targetHeight || args.height || 0),
      }],
    };

    if (command === "export-stage") {
      const frameIndex = args.frame !== undefined || args.frameIndex !== undefined
        ? Number(args.frameIndex || args.frame)
        : null;
      const scanResponse = frameIndex !== null
        ? await wsRequest("scan_stage_at_frame", { frameIndex })
        : await wsRequest("scan_stage", {});
      if (!scanResponse.ok) {
        console.log(JSON.stringify(scanResponse, null, 2));
        process.exitCode = 1;
        return;
      }
      const items = ((scanResponse.result && scanResponse.result.characters) || []).map((item) => ({
        characterName: item.libraryItemName || item.name,
        displayName: item.name,
        selectedParts: null,
        layerIndex: item.layerIndex,
        elementIndex: item.elementIndex,
        frameIndex: item.frameIndex || 0,
        elementType: item.elementType || "symbol",
      }));
      const response = await wsRequest("export_batch", {
        items,
        options: {
          basePath: args.out,
          exportRoot: args.out,
          exportLevel: Number(args.level || 1),
          useSubfolder: args.subfolder !== "false",
          scaleMode: args.scaleMode || "none",
          scaleRatio: Number(args.scaleRatio || 100),
          targetWidth: Number(args.targetWidth || args.width || 0),
          targetHeight: Number(args.targetHeight || args.height || 0),
        },
      }, {
        timeoutMs: requestedTimeoutMs || EXPORT_REQUEST_TIMEOUT_MS,
      });
      console.log(JSON.stringify(response, null, 2));
      return;
    }

    if (command === "export-stage-one") {
      const layerIndex = parseRequiredNumber(args, "layerIndex");
      const elementIndex = parseRequiredNumber(args, "elementIndex");
      const frameIndex = parseFrameIndex(args);
      const options = exportOptionsFromArgs(args, 1);
      const scanResponse = await wsRequest("scan_stage_at_frame", { frameIndex });
      if (!scanResponse.ok) {
        console.log(JSON.stringify(scanResponse, null, 2));
        process.exitCode = 1;
        return;
      }

      const matched = findStageElement(scanCharacters(scanResponse), layerIndex, elementIndex);
      if (!matched) {
        throw createCliError("ELEMENT_NOT_FOUND", `指定舞台元素不存在: layerIndex=${layerIndex}, elementIndex=${elementIndex}, frame=${frameIndex}`);
      }

      const displayName = args.name || matched.name || matched.libraryItemName || `layer_${layerIndex}_element_${elementIndex}`;
      const characterName = args.characterName || args.character || matched.libraryItemName || displayName;
      const item = {
        characterName,
        displayName,
        selectedParts: null,
        layerIndex,
        elementIndex,
        frameIndex: matched.frameIndex !== undefined ? Number(matched.frameIndex) : frameIndex,
        elementType: args.elementType || matched.elementType || "symbol",
      };

      const response = await wsRequest("export_batch", {
        items: [item],
        options,
      }, {
        timeoutMs: requestedTimeoutMs || EXPORT_REQUEST_TIMEOUT_MS,
      });
      console.log(JSON.stringify(response, null, 2));
      return;
    }

    if (!map[command]) {
      throw new Error(`未知命令: ${command}`);
    }
    const [method, params] = map[command];
    const isExportCommand = method === "export_character" || method === "export_batch";
    const response = await wsRequest(method, params, {
      timeoutMs: requestedTimeoutMs || (isExportCommand ? EXPORT_REQUEST_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS),
    });
    console.log(JSON.stringify(response, null, 2));
  } finally {
    releaseCliLock(lock);
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: { code: err.code, message: err.message, details: err.details } }, null, 2));
  process.exit(1);
});
