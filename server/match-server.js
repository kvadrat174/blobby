// server/match-server.js
import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { nanoid } from "nanoid";
import cors from "cors";

const app = express();

// CORS для разработки
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ 
  server,
  path: "/ws"  // Опционально: явный путь для WebSocket
});

const matches = new Map();

// Функция для очистки закрытого соединения
function cleanupConnection(ws) {
  for (const [id, match] of matches) {
    if (match.host === ws || match.guest === ws) {
      // Уведомляем другого игрока
      const other = match.host === ws ? match.guest : match.host;
      if (other && other.readyState === ws.OPEN) {
        other.send(JSON.stringify({ 
          type: "opponent-disconnected",
          message: "Соперник отключился" 
        }));
      }
      matches.delete(id);
      console.log(`❌ Match ${id} removed (player disconnected)`);
    }
  }
}

wss.on("connection", (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`✅ Client connected from ${clientIp}`);

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch (err) {
      console.error("Invalid JSON:", err);
      ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
      return;
    }

    console.log(`📨 Received: ${data.type}`, data);

    switch (data.type) {
      case "create": {
        const matchId = nanoid(6);
        matches.set(matchId, { host: ws, guest: null, createdAt: Date.now() });
        ws.send(JSON.stringify({ type: "created", matchId }));
        console.log(`🎮 Match created: ${matchId} (total: ${matches.size})`);
        break;
      }

      case "join": {
        const match = matches.get(data.matchId);
        
        if (!match) {
          ws.send(JSON.stringify({ 
            type: "error", 
            message: "Игра не найдена или уже закрыта" 
          }));
          console.log(`❌ Join failed: match ${data.matchId} not found`);
          return;
        }
        
        if (match.guest) {
          ws.send(JSON.stringify({ 
            type: "error", 
            message: "В игре уже есть два игрока" 
          }));
          console.log(`❌ Join failed: match ${data.matchId} is full`);
          return;
        }

        if (match.host === ws) {
          ws.send(JSON.stringify({ 
            type: "error", 
            message: "Нельзя присоединиться к своей игре" 
          }));
          return;
        }

        match.guest = ws;
        ws.send(JSON.stringify({ type: "joined", matchId: data.matchId }));
        
        // Уведомляем хоста
        if (match.host.readyState === ws.OPEN) {
          match.host.send(JSON.stringify({ type: "guest-joined" }));
          console.log(`👥 Guest joined match: ${data.matchId}`);
        } else {
          // Хост отключился
          matches.delete(data.matchId);
          ws.send(JSON.stringify({ 
            type: "error", 
            message: "Хост отключился" 
          }));
        }
        break;
      }

      case "signal": {
        const match = matches.get(data.matchId);
        if (!match) {
          console.log(`⚠️ Signal for unknown match: ${data.matchId}`);
          ws.send(JSON.stringify({ 
            type: "error", 
            message: "Match not found" 
          }));
          return;
        }

        const target = data.to === "host" ? match.host : match.guest;
        
        if (!target) {
          console.log(`⚠️ Target player not found: ${data.to} in match ${data.matchId}`);
          return;
        }

        if (target.readyState === ws.OPEN) {
          // ВАЖНО: Отправляем сигнал без изменений
          target.send(JSON.stringify({
            type: "signal",
            matchId: data.matchId,
            from: data.from,
            to: data.to,
            signal: data.signal
          }));
          
          const signalType = data.signal.type || (data.signal.candidate ? 'candidate' : 'unknown');
          console.log(`🔄 Signal relayed: ${data.from} → ${data.to} (${signalType})`);
        } else {
          console.log(`⚠️ Target WebSocket not open for ${data.to}`);
          ws.send(JSON.stringify({ 
            type: "error", 
            message: `Target player ${data.to} is not connected` 
          }));
        }
        break;
      }

      default:
        ws.send(JSON.stringify({ 
          type: "error", 
          message: `Unknown message type: ${data.type}` 
        }));
    }
  });

  ws.on("close", () => {
    console.log(`🔌 Client disconnected from ${clientIp}`);
    cleanupConnection(ws);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
    cleanupConnection(ws);
  });

  // Heartbeat для поддержания соединения
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
});

// Периодическая проверка соединений
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log("⏱️ Terminating inactive connection");
      cleanupConnection(ws);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000); // каждые 30 секунд

wss.on("close", () => {
  clearInterval(interval);
});

// HTTP эндпоинты для мониторинга
app.get("/", (_, res) => {
  res.json({ 
    status: "ok",
    message: "Volleyball Matchmaking Server",
    matches: matches.size,
    connections: wss.clients.size
  });
});

app.get("/health", (_, res) => {
  res.json({ 
    status: "healthy",
    uptime: process.uptime(),
    matches: matches.size,
    connections: wss.clients.size,
    memory: process.memoryUsage()
  });
});

app.get("/matches", (_, res) => {
  const matchList = [];
  for (const [id, match] of matches) {
    matchList.push({
      id,
      hasHost: !!match.host,
      hasGuest: !!match.guest,
      createdAt: match.createdAt,
      age: Date.now() - match.createdAt
    });
  }
  res.json({ matches: matchList });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing server...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔════════════════════════════════════════╗
║   🏐 Volleyball Matchmaking Server    ║
║                                        ║
║   WebSocket: ws://localhost:${PORT}/ws  ║
║   HTTP: http://localhost:${PORT}        ║
╚════════════════════════════════════════╝
  `);
});