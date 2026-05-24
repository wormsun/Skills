/* eslint-disable no-console */
const http = require("http");
const crypto = require("crypto");

const HOST = "127.0.0.1";
const PORT = Number(process.env.FAA_BRIDGE_PORT || 17321);
const BRIDGE_VERSION = "0.2.0";
const PROTOCOL_VERSION = "faa-agent-v1";

let plugin = null;
const agents = new Map();
const pending = new Map();

function encodeFrame(text) {
  const payload = Buffer.from(text);
  let header;
  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[1] = payload.length;
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  header[0] = 0x81;
  return Buffer.concat([header, payload]);
}

function tryDecodeFrames(connection) {
  const messages = [];
  let buffer = connection.buffer;

  while (buffer.length >= 2) {
    const opcode = buffer[0] & 0x0f;
    let offset = 2;
    let length = buffer[1] & 0x7f;
    const masked = (buffer[1] & 0x80) !== 0;

    if (length === 126) {
      if (buffer.length < offset + 2) break;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (buffer.length < offset + 8) break;
      length = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }

    let mask;
    if (masked) {
      if (buffer.length < offset + 4) break;
      mask = buffer.slice(offset, offset + 4);
      offset += 4;
    }

    if (buffer.length < offset + length) break;
    let payload = buffer.slice(offset, offset + length);
    buffer = buffer.slice(offset + length);

    if (opcode === 0x8) {
      connection.socket.end();
      continue;
    }

    if (masked) {
      const unmasked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) {
        unmasked[i] = payload[i] ^ mask[i % 4];
      }
      payload = unmasked;
    }

    if (opcode === 0x1) {
      messages.push(payload.toString("utf8"));
    }
  }

  connection.buffer = buffer;
  return messages;
}

function send(connection, message) {
  if (!connection || connection.socket.destroyed) return;
  connection.socket.write(encodeFrame(JSON.stringify(message)));
}

function broadcastAgentList() {
  const list = Array.from(agents.values()).map((agent) => ({
    clientId: agent.clientId,
    clientName: agent.clientName,
    pid: agent.pid,
    connectedAt: agent.connectedAt,
    lastRequestAt: agent.lastRequestAt,
  }));
  send(plugin, { type: "agent.list", agents: list });
}

function closeAgent(clientId) {
  const agent = agents.get(clientId);
  if (agent) {
    agent.socket.end();
    agents.delete(clientId);
    for (const [requestId, pendingAgent] of pending) {
      if (pendingAgent === agent) {
        pending.delete(requestId);
      }
    }
    broadcastAgentList();
  }
}

function replaceExistingAgent(connection) {
  if (!connection.clientId) return;
  const existing = agents.get(connection.clientId);
  if (!existing || existing === connection) return;

  for (const [requestId, pendingAgent] of pending) {
    if (pendingAgent === existing) {
      pending.delete(requestId);
    }
  }
  try {
    existing.socket.end();
  } catch (err) {
    existing.socket.destroy();
  }
  agents.delete(connection.clientId);
}

function handlePluginMessage(connection, msg) {
  if (msg.type === "plugin.hello") {
    plugin = connection;
    connection.pluginInfo = msg;
    console.log("[bridge] plugin connected:", msg.plugin || "unknown");
    broadcastAgentList();
    return;
  }

  if (msg.type === "command.response") {
    const agent = pending.get(msg.id);
    if (agent) {
      pending.delete(msg.id);
      send(agent, msg);
    }
    return;
  }

  if (msg.type === "job.event") {
    for (const agent of agents.values()) {
      send(agent, msg);
    }
    return;
  }

  if (msg.type === "agent.disconnect") {
    closeAgent(msg.clientId);
  }
}

function handleAgentMessage(connection, msg) {
  if (msg.type === "agent.bye") {
    if (connection.clientId) {
      closeAgent(connection.clientId);
    }
    return;
  }

  if (msg.type === "agent.hello") {
    connection.clientName = msg.clientName || "agent";
    connection.pid = msg.pid || null;
    connection.clientId = msg.clientId || `${connection.clientName}:${connection.pid || crypto.randomBytes(4).toString("hex")}`;
    connection.connectedAt = new Date().toISOString();
    connection.lastRequestAt = null;
    replaceExistingAgent(connection);
    agents.set(connection.clientId, connection);
    send(connection, {
      type: "agent.hello.ack",
      clientId: connection.clientId,
      pluginOnline: !!plugin,
      bridgeVersion: BRIDGE_VERSION,
      protocolVersion: PROTOCOL_VERSION,
    });
    broadcastAgentList();
    return;
  }

  if (msg.type === "command.request") {
    connection.lastRequestAt = new Date().toISOString();
    broadcastAgentList();
    if (!plugin) {
      send(connection, {
        type: "command.response",
        id: msg.id,
        ok: false,
        error: { code: "PLUGIN_OFFLINE", message: "Animate 插件面板未连接" },
      });
      return;
    }
    pending.set(msg.id, connection);
    send(plugin, msg);
  }
}

function attachSocket(socket, role) {
  const connection = { socket, role, buffer: Buffer.alloc(0) };
  function cleanupConnection() {
    if (connection.cleanedUp) return;
    connection.cleanedUp = true;
    if (connection === plugin) {
      plugin = null;
      console.log("[bridge] plugin disconnected");
    }
    if (connection.clientId && agents.get(connection.clientId) === connection) {
      agents.delete(connection.clientId);
      for (const [requestId, pendingAgent] of pending) {
        if (pendingAgent === connection) {
          pending.delete(requestId);
        }
      }
      broadcastAgentList();
    }
  }

  socket.setKeepAlive(true, 5000);
  socket.on("data", (chunk) => {
    connection.buffer = Buffer.concat([connection.buffer, chunk]);
    for (const raw of tryDecodeFrames(connection)) {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (err) {
        console.error("[bridge] invalid json:", err.message);
        continue;
      }
      if (role === "plugin") {
        handlePluginMessage(connection, msg);
      } else {
        handleAgentMessage(connection, msg);
      }
    }
  });
  socket.on("end", cleanupConnection);
  socket.on("close", cleanupConnection);
  socket.on("error", () => {
    socket.destroy();
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      bridgeOnline: true,
      bridgeVersion: BRIDGE_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      pluginOnline: !!plugin,
      plugin: plugin && plugin.pluginInfo ? {
        name: plugin.pluginInfo.plugin || null,
        version: plugin.pluginInfo.version || null,
      } : null,
      agents: agents.size,
    }));
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

server.on("upgrade", (req, socket) => {
  const role = req.url === "/plugin" ? "plugin" : req.url === "/agent" ? "agent" : null;
  if (!role) {
    socket.destroy();
    return;
  }
  const key = req.headers["sec-websocket-key"];
  const accept = crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      "\r\n"
  );
  attachSocket(socket, role);
});

server.listen(PORT, HOST, () => {
  console.log(`[bridge] listening on ws://${HOST}:${PORT}`);
});
