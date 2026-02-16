const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 5000 });

const rooms = {};
const ADMIN_PASSWORD = "1234";

// Генератор уникальных ID
function generateUserId() {
  return Math.random().toString(36).substr(2, 9);
}

wss.on("connection", (ws) => {
  ws.userId = generateUserId();
  ws.roomId = null;
  ws.isAdmin = false;
  ws.joinedAt = new Date();

  console.log(`Новое подключение: ${ws.userId}`);

  // Отправка информации о пользователях в комнате
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
            users: users,
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
        console.log(`${ws.userId} присоединился к комнате ${ws.roomId}`);

        // Отправляем историю новому клиенту
        ws.send(
          JSON.stringify({
            type: "history",
            history: rooms[ws.roomId].history,
          })
        );

        // Обновляем список пользователей
        broadcastUsers(ws.roomId);
      }

      // Стать админом
      if (data.type === "admin") {
        const room = rooms[ws.roomId];
        if (!room) {
          ws.send(
            JSON.stringify({ type: "error", message: "Комната не найдена" })
          );
          return;
        }

        if (data.password !== ADMIN_PASSWORD) {
          ws.send(
            JSON.stringify({ type: "error", message: "Неверный пароль" })
          );
          return;
        }

        room.admin = ws;
        ws.isAdmin = true;
        ws.send(JSON.stringify({ type: "admin_ok" }));
        console.log(`${ws.userId} стал админом в комнате ${ws.roomId}`);

        // Обновляем список пользователей
        broadcastUsers(ws.roomId);
      }

      // Рисование
      if (data.type === "draw" && ws.isAdmin) {
        const room = rooms[ws.roomId];
        if (!room) return;

        // Сохраняем в историю
        room.history.push({
          x0: data.x0,
          y0: data.y0,
          x1: data.x1,
          y1: data.y1,
          color: data.color,
          size: data.size,
          tool: data.tool,
          timestamp: Date.now(),
        });

        // Ограничиваем размер истории (последние 10000 линий)
        if (room.history.length > 10000) {
          room.history = room.history.slice(-10000);
        }

        // Отправляем всем клиентам
        room.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
      }

      // Очистка холста
      if (data.type === "clear" && ws.isAdmin) {
        const room = rooms[ws.roomId];
        if (!room) return;

        room.history = [];
        console.log(`Холст очищен в комнате ${ws.roomId}`);

        room.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "clear" }));
          }
        });
      }
    } catch (err) {
      console.error("Ошибка обработки сообщения:", err);
      ws.send(
        JSON.stringify({ type: "error", message: "Ошибка сервера" })
      );
    }
  });

  ws.on("close", () => {
    const room = rooms[ws.roomId];
    if (!room) return;

    room.clients.delete(ws);
    console.log(`${ws.userId} покинул комнату ${ws.roomId}`);

    if (room.admin === ws) {
      room.admin = null;
      console.log(`Админ покинул комнату ${ws.roomId}`);
    }

    // Обновляем список пользователей
    broadcastUsers(ws.roomId);

    // Удаляем пустые комнаты старше 1 часа
    if (room.clients.size === 0) {
      const roomAge = Date.now() - room.createdAt.getTime();
      if (roomAge > 3600000) {
        // 1 час
        delete rooms[ws.roomId];
        console.log(`Комната ${ws.roomId} удалена (пустая и старая)`);
      }
    }
  });

  ws.on("error", (error) => {
    console.error(`Ошибка WebSocket для ${ws.userId}:`, error);
  });

  // Heartbeat для проверки соединения
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
});

// Проверка активных соединений каждые 30 секунд
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log(`Закрываем неактивное соединение: ${ws.userId}`);
      return ws.terminate();
    }

    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => {
  clearInterval(interval);
});

// Статистика
setInterval(() => {
  const totalRooms = Object.keys(rooms).length;
  const totalClients = wss.clients.size;
  console.log(
    `📊 Статистика: ${totalRooms} комнат, ${totalClients} подключений`
  );
}, 60000); // каждую минуту

console.log("🚀 WebSocket сервер запущен на порту 5000");
console.log(`🔑 Пароль администратора: ${ADMIN_PASSWORD}`);