import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import Redis from "ioredis";
import morgan from "morgan";
import client from "prom-client";
import { WebSocketServer } from "ws";

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const subscriber = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");
let redisReady = false;

client.collectDefaultMetrics({ prefix: "realtime_service_" });
const wsClients = new client.Gauge({ name: "realtime_service_ws_clients", help: "Connected websocket clients" });
const pushedEvents = new client.Counter({ name: "realtime_service_pushed_events_total", help: "Events pushed to websocket clients", labelNames: ["type"] });

app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

app.get("/health", (req, res) => res.json({ service: "realtime-service", status: "ok" }));
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});
app.get("/realtime", (req, res) => res.json({ message: "Connect websocket to ws://localhost/ws?token=YOUR_JWT" }));

const server = app.listen(PORT, () => console.log(`realtime-service listening on ${PORT}`));
const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Map();

wss.on("connection", (socket, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  try {
    const user = jwt.verify(token, JWT_SECRET);
    clients.set(socket, user);
    wsClients.set(clients.size);
    socket.send(JSON.stringify({ type: "connected", user }));
  } catch {
    socket.close(1008, "Invalid token");
  }
  socket.on("close", () => {
    clients.delete(socket);
    wsClients.set(clients.size);
  });
});

async function connectRedis() {
  try {
    await subscriber.ping();
    await subscriber.subscribe("task.events");
    redisReady = true;
    console.log("realtime-service connected to Redis");
  } catch (error) {
    redisReady = false;
    console.warn("Redis unavailable, websocket events are disabled:", error.message);
  }
}

connectRedis().then(() => {
  subscriber.on("message", (channel, raw) => {
    if (!redisReady) return;
    const event = JSON.parse(raw);
    pushedEvents.inc({ type: event.type });
    for (const [socket, user] of clients.entries()) {
      if (event.payload.user.sub === user.sub && socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(event));
      }
    }
  });
});
