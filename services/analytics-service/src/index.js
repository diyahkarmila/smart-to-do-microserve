import axios from "axios";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import morgan from "morgan";
import client from "prom-client";

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const TASK_SERVICE_URL = process.env.TASK_SERVICE_URL || "http://task-service:3000";
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || "http://notification-service:3000";

client.collectDefaultMetrics({ prefix: "analytics_service_" });

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

app.get("/health", (req, res) => res.json({ service: "analytics-service", status: "ok" }));
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.get("/analytics/summary", requireAuth, async (req, res) => {
  const headers = { Authorization: req.headers.authorization };
  const [tasksResponse, statsResponse, notificationsResponse] = await Promise.all([
    axios.get(`${TASK_SERVICE_URL}/tasks`, { headers }),
    axios.get(`${TASK_SERVICE_URL}/tasks/stats`, { headers }),
    axios.get(`${NOTIFICATION_SERVICE_URL}/notifications`, { headers })
  ]);
  const tasks = tasksResponse.data.tasks;
  const overdue = tasks.filter((task) => task.due_date && new Date(task.due_date) < new Date() && task.status !== "done").length;
  res.json({
    user: req.user,
    totalTasks: tasks.length,
    overdueTasks: overdue,
    byStatus: statsResponse.data.stats,
    latestNotifications: notificationsResponse.data.notifications.slice(0, 5)
  });
});

app.use((err, req, res, next) => {
  if (err.response) return res.status(err.response.status).json(err.response.data);
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(PORT, () => console.log(`analytics-service listening on ${PORT}`));
