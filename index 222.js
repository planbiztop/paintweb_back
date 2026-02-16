const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 5000 });

const rooms = {};
const ADMIN_PASSWORD = "1234";

wss.on("connection", (ws) => {
  ws.roomId = null;
  ws.isAdmin = false;

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // вход в комнату
    if (data.type === "join") {
      ws.roomId = data.roomId;

      if (!rooms[ws.roomId]) {
        rooms[ws.roomId] = {
          admin: null,
          clients: new Set(),
          history: [], // 👈 история рисования
        };
      }

      rooms[ws.roomId].clients.add(ws);

      // отправляем историю новому клиенту
      ws.send(
        JSON.stringify({
          type: "history",
          history: rooms[ws.roomId].history,
        })
      );
    }

    // стать админом
    if (data.type === "admin") {
      const room = rooms[ws.roomId];
      if (data.password !== ADMIN_PASSWORD) {
        ws.send(JSON.stringify({ type: "error", message: "Неверный пароль" }));
        return;
      }
      room.admin = ws;
      ws.isAdmin = true;
      ws.send(JSON.stringify({ type: "admin_ok" }));
    }

    // рисование
    if (data.type === "draw" && ws.isAdmin) {
      const room = rooms[ws.roomId];

      room.history.push(data); // 👈 сохраняем

      room.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    }
  });

  ws.on("close", () => {
    const room = rooms[ws.roomId];
    if (!room) return;
    room.clients.delete(ws);
    if (room.admin === ws) room.admin = null;
  });
});

console.log("WS сервер запущен");
