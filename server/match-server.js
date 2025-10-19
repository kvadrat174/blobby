// server/match-server.js
import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { nanoid } from "nanoid";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const matches = new Map();

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    switch (data.type) {
      case "create": {
        const matchId = nanoid(6);
        matches.set(matchId, { host: ws, guest: null });
        ws.send(JSON.stringify({ type: "created", matchId }));
        console.log("Match created:", matchId);
        break;
      }
      case "join": {
        const match = matches.get(data.matchId);
        if (!match || match.guest) {
          ws.send(JSON.stringify({ type: "error", message: "Игра не найдена" }));
          return;
        }
        match.guest = ws;
        ws.send(JSON.stringify({ type: "joined", matchId: data.matchId }));
        match.host.send(JSON.stringify({ type: "guest-joined" }));
        break;
      }
      case "signal": {
        const match = matches.get(data.matchId);
        if (!match) return;
        const target = data.to === "host" ? match.host : match.guest;
        if (target && target.readyState === ws.OPEN) {
          target.send(JSON.stringify({
            type: "signal",
            from: data.from,
            signal: data.signal
          }));
        }
        break;
      }
    }
  });

  ws.on("close", () => {
    for (const [id, m] of matches) {
      if (m.host === ws || m.guest === ws) {
        matches.delete(id);
        console.log("Match removed:", id);
      }
    }
  });
});

app.get("/", (_, res) => res.send("✅ Matchmaking server is running"));

const PORT = 8080;
server.listen(PORT, () => console.log(`WebSocket server on :${PORT}`));
