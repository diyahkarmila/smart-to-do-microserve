import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import Redis from "ioredis";
import morgan from "morgan";
import pg from "pg";
import client from "prom-client";

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const subscriber = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");
const notifications = [];
let usingMemoryStore = false;
let redisReady = false;

client.collectDefaultMetrics({ prefix: "notification_service_" });
const consumedEvents = new client.Counter({ name: "notification_service_consumed_events_total", help: "Task events consumed by notification-service", labelNames: ["type"] });

app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Missing bearer token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

async function initDb() {
  try {
    await pool.query("SELECT 1");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(80) NOT NULL,
        type VARCHAR(80) NOT NULL,
        message TEXT NOT NULL,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("notification-service using PostgreSQL");
  } catch (error) {
    usingMemoryStore = true;
    console.warn("PostgreSQL unavailable, using in-memory notification store:", error.message);
  }
}

async function connectRedis() {
  try {
    await subscriber.ping();
    await subscriber.subscribe("task.events");
    redisReady = true;
    console.log("notification-service connected to Redis");
  } catch (error) {
    redisReady = false;
    console.warn("Redis unavailable, task event subscription is disabled:", error.message);
  }
}

function messageFor(event) {
  const task = event.payload.task;
  if (event.type === "task.created") return `Task '${task.title}' was created`;
  if (event.type === "task.updated") return `Task '${task.title}' was updated to ${task.status}`;
  if (event.type === "task.deleted") return `Task '${task.title}' was deleted`;
  return `Task event: ${event.type}`;
}

async function storeNotification(userId, type, message) {
  if (usingMemoryStore) {
    notifications.push({ id: notifications.length + 1, user_id: userId, type, message, read_at: null, created_at: new Date().toISOString() });
    return;
  }
  await pool.query("INSERT INTO notifications (user_id, type, message) VALUES ($1,$2,$3)", [userId, type, message]);
}

app.get("/health", (req, res) => res.json({ service: "notification-service", status: "ok" }));
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.get("/notifications", requireAuth, async (req, res) => {
  if (usingMemoryStore) {
    return res.json({ notifications: notifications.filter((entry) => entry.user_id === req.user.sub).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50) });
  }
  const result = await pool.query("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", [req.user.sub]);
  res.json({ notifications: result.rows });
});

app.patch("/notifications/:id/read", requireAuth, async (req, res) => {
  if (usingMemoryStore) {
    const notification = notifications.find((entry) => entry.id === Number(req.params.id) && entry.user_id === req.user.sub);
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    notification.read_at = new Date().toISOString();
    return res.json({ notification });
  }
  const result = await pool.query("UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *", [req.params.id, req.user.sub]);
  if (!result.rows[0]) return res.status(404).json({ message: "Notification not found" });
  res.json({ notification: result.rows[0] });
});

initDb().then(connectRedis).then(() => {
  subscriber.on("message", async (channel, raw) => {
    if (!redisReady) return;
    const event = JSON.parse(raw);
    consumedEvents.inc({ type: event.type });
    await storeNotification(event.payload.user.sub, event.type, messageFor(event));
  });
  app.listen(PORT, () => console.log(`notification-service listening on ${PORT}`));
});
