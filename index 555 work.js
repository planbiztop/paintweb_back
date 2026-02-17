const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 5000;

const rooms = {};
const ADMIN_PASSWORD = "1234";

// Просто чтобы Render не ругался (health check)
app.get("/", (req, res) => {
  res.send("WebSocket server is running 🚀");
});

// Генератор уникальных ID
function generateUserId() {
  return Math.random().toString(36).substring(2, 9);
}

wss.on("connection", (ws) => {
  ws.userId = generateUserId();
  ws.roomId = null;
  ws.isAdmin = false;
  ws.joinedAt = new Date();
  ws.isAlive = true;

  console.log(`Новое подключение: ${ws.userId}`);

  function broadcastUsers(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const users = Array.from(room.clients).map((client) => ({
      userId: client.userId,
      isAdmin: client.isAdmin,
      joinedAt: client.joinedAt,
    }));

    room.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: "users",
            users,
          })
        );
      }
    });
  }

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      // Вход в комнату
      if (data.type === "join") {
        ws.roomId = data.roomId;

        if (!rooms[ws.roomId]) {
          rooms[ws.roomId] = {
            admin: null,
            clients: new Set(),
            history: [],
            createdAt: new Date(),
          };
          console.log(`Создана новая комната: ${ws.roomId}`);
        }

        rooms[ws.roomId].clients.add(ws);
        console.log(`${ws.userId} вошел в ${ws.roomId}`);

        ws.send(
          JSON.stringify({
            type: "history",
            history: rooms[ws.roomId].history,
          })
        );

        broadcastUsers(ws.roomId);
      }

      // Стать админом
      if (data.type === "admin") {
        const room = rooms[ws.roomId];
        if (!room) {
          ws.send(JSON.stringify({ type: "error", message: "Комната не найдена" }));
          return;
        }

        if (data.password !== ADMIN_PASSWORD) {
          ws.send(JSON.stringify({ type: "error", message: "Неверный пароль" }));
          return;
        }

        room.admin = ws;
        ws.isAdmin = true;

        ws.send(JSON.stringify({ type: "admin_ok" }));
        broadcastUsers(ws.roomId);

        console.log(`${ws.userId} стал админом`);
      }

      // Рисование
      if (data.type === "draw" && ws.isAdmin) {
        const room = rooms[ws.roomId];
        if (!room) return;

        room.history.push({
          ...data,
          timestamp: Date.now(),
        });

        if (room.history.length > 10000) {
          room.history = room.history.slice(-10000);
        }

        room.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
      }

      // Очистка
      if (data.type === "clear" && ws.isAdmin) {
        const room = rooms[ws.roomId];
        if (!room) return;

        room.history = [];

        room.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "clear" }));
          }
        });

        console.log(`Холст очищен в ${ws.roomId}`);
      }
    } catch (err) {
      console.error("Ошибка:", err);
      ws.send(JSON.stringify({ type: "error", message: "Ошибка сервера" }));
    }
  });

  ws.on("close", () => {
    const room = rooms[ws.roomId];
    if (!room) return;

    room.clients.delete(ws);

    if (room.admin === ws) {
      room.admin = null;
      console.log("Админ вышел");
    }

    broadcastUsers(ws.roomId);

    if (room.clients.size === 0) {
      const roomAge = Date.now() - room.createdAt.getTime();
      if (roomAge > 3600000) {
        delete rooms[ws.roomId];
        console.log(`Комната ${ws.roomId} удалена`);
      }
    }
  });

  ws.on("pong", () => {
    ws.isAlive = true;
  });
});

// Heartbeat
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => {
  clearInterval(interval);
});

// Запуск
server.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`🔑 Admin password: ${ADMIN_PASSWORD}`);
});
