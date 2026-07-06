import axios from "axios";
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
const CATEGORY_SERVICE_URL = process.env.CATEGORY_SERVICE_URL || "http://category-service:3000";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");
const tasks = [];
let usingMemoryStore = false;
let redisReady = false;

client.collectDefaultMetrics({ prefix: "task_service_" });
const taskEvents = new client.Counter({ name: "task_service_events_total", help: "Task domain events published", labelNames: ["type"] });

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

function normalizeTask(task) {
  return {
    ...task,
    category_id: task.category_id ?? task.categoryId,
    due_date: task.due_date ?? task.dueDate,
    created_at: task.created_at ?? task.createdAt,
    updated_at: task.updated_at ?? task.updatedAt
  };
}

async function initDb() {
  try {
    await pool.query("SELECT 1");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(80) NOT NULL,
        category_id INTEGER,
        title VARCHAR(180) NOT NULL,
        description TEXT DEFAULT '',
        priority VARCHAR(20) DEFAULT 'medium',
        status VARCHAR(20) DEFAULT 'todo',
        due_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("task-service using PostgreSQL");
  } catch (error) {
    usingMemoryStore = true;
    console.warn("PostgreSQL unavailable, using in-memory task store:", error.message);
  }
}

async function connectRedis() {
  try {
    await redis.ping();
    redisReady = true;
    console.log("task-service connected to Redis");
  } catch (error) {
    redisReady = false;
    console.warn("Redis unavailable, event publishing is disabled:", error.message);
  }
}

async function publish(type, payload) {
  taskEvents.inc({ type });
  if (!redisReady) return;
  try {
    await redis.publish("task.events", JSON.stringify({ type, payload, emittedAt: new Date().toISOString() }));
  } catch (error) {
    redisReady = false;
    console.warn("Failed to publish task event:", error.message);
  }
}

async function listTasksForUser(userId) {
  if (usingMemoryStore) {
    return tasks.filter((task) => task.user_id === userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  const result = await pool.query("SELECT * FROM tasks WHERE user_id = $1 ORDER BY due_date NULLS LAST, created_at DESC", [userId]);
  return result.rows;
}

async function getTaskStats(userId) {
  if (usingMemoryStore) {
    const stats = [];
    const statuses = [...new Set(tasks.filter((task) => task.user_id === userId).map((task) => task.status))];
    for (const status of statuses) {
      stats.push({ status, total: tasks.filter((task) => task.user_id === userId && task.status === status).length });
    }
    return stats;
  }
  const result = await pool.query("SELECT status, COUNT(*)::int AS total FROM tasks WHERE user_id = $1 GROUP BY status", [userId]);
  return result.rows;
}

async function createTask(taskData) {
  if (usingMemoryStore) {
    const task = {
      id: tasks.length + 1,
      user_id: taskData.userId,
      category_id: taskData.categoryId,
      title: taskData.title,
      description: taskData.description,
      priority: taskData.priority,
      status: taskData.status,
      due_date: taskData.dueDate,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    tasks.push(task);
    return task;
  }
  const result = await pool.query(
    "INSERT INTO tasks (user_id, category_id, title, description, priority, status, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
    [taskData.userId, taskData.categoryId, taskData.title, taskData.description, taskData.priority, taskData.status, taskData.dueDate]
  );
  return result.rows[0];
}

async function updateTask(taskId, userId, patch) {
  if (usingMemoryStore) {
    const index = tasks.findIndex((task) => task.id === Number(taskId) && task.user_id === userId);
    if (index === -1) return null;
    const current = tasks[index];
    const next = { ...current, ...patch, updated_at: new Date().toISOString() };
    tasks[index] = next;
    return next;
  }
  const result = await pool.query(
    "UPDATE tasks SET category_id=$1, title=$2, description=$3, priority=$4, status=$5, due_date=$6, updated_at=NOW() WHERE id=$7 AND user_id=$8 RETURNING *",
    [patch.categoryId ?? patch.category_id, patch.title, patch.description, patch.priority, patch.status, patch.dueDate ?? patch.due_date, taskId, userId]
  );
  return result.rows[0] || null;
}

async function deleteTask(taskId, userId) {
  if (usingMemoryStore) {
    const index = tasks.findIndex((task) => task.id === Number(taskId) && task.user_id === userId);
    if (index === -1) return null;
    const [removed] = tasks.splice(index, 1);
    return removed;
  }
  const result = await pool.query("DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING *", [taskId, userId]);
  return result.rows[0] || null;
}

app.get("/health", (req, res) => res.json({ service: "task-service", status: "ok" }));
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.get("/tasks", requireAuth, async (req, res) => {
  const taskRows = await listTasksForUser(req.user.sub);
  res.json({ tasks: taskRows.map(normalizeTask) });
});

app.get("/tasks/stats", requireAuth, async (req, res) => {
  const stats = await getTaskStats(req.user.sub);
  res.json({ stats });
});

app.post("/tasks", requireAuth, async (req, res) => {
  const { title, description = "", priority = "medium", status = "todo", dueDate = null, categoryId = null } = req.body;
  if (!title) return res.status(400).json({ message: "title is required" });
  if (categoryId) {
    await axios.get(`${CATEGORY_SERVICE_URL}/categories/${categoryId}`, { headers: { Authorization: req.headers.authorization } });
  }
  const task = await createTask({ userId: req.user.sub, categoryId, title, description, priority, status, dueDate });
  await publish("task.created", { task: normalizeTask(task), user: req.user });
  res.status(201).json({ task: normalizeTask(task) });
});

app.patch("/tasks/:id", requireAuth, async (req, res) => {
  const task = await updateTask(req.params.id, req.user.sub, req.body);
  if (!task) return res.status(404).json({ message: "Task not found" });
  await publish("task.updated", { task: normalizeTask(task), user: req.user });
  res.json({ task: normalizeTask(task) });
});

app.delete("/tasks/:id", requireAuth, async (req, res) => {
  const task = await deleteTask(req.params.id, req.user.sub);
  if (!task) return res.status(404).json({ message: "Task not found" });
  await publish("task.deleted", { task: normalizeTask(task), user: req.user });
  res.json({ deleted: true, task: normalizeTask(task) });
});

app.use((err, req, res, next) => {
  if (err.response) return res.status(err.response.status).json(err.response.data);
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

initDb().then(connectRedis).then(() => app.listen(PORT, () => console.log(`task-service listening on ${PORT}`)));
