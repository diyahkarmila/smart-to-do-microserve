import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import morgan from "morgan";
import pg from "pg";
import client from "prom-client";

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const users = [];
let usingMemoryStore = false;

client.collectDefaultMetrics({ prefix: "auth_service_" });
const httpRequests = new client.Counter({
  name: "auth_service_http_requests_total",
  help: "Total HTTP requests handled by auth-service",
  labelNames: ["method", "route", "status"]
});

app.use(cors());
app.use(express.json());
app.use(morgan("combined"));
app.use((req, res, next) => {
  res.on("finish", () => httpRequests.inc({ method: req.method, route: req.route?.path || req.path, status: res.statusCode }));
  next();
});

async function initDb() {
  try {
    await pool.query("SELECT 1");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(80) UNIQUE NOT NULL,
        display_name VARCHAR(120) NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("auth-service using PostgreSQL");
  } catch (error) {
    usingMemoryStore = true;
    console.warn("PostgreSQL unavailable, using in-memory user store:", error.message);
  }
}

function signToken(user) {
  const displayName = user.display_name || user.displayName || user.username;
  return jwt.sign({ sub: String(user.id), username: user.username, displayName }, JWT_SECRET, { expiresIn: "8h" });
}

async function createUser({ username, displayName, passwordHash }) {
  if (usingMemoryStore) {
    const existing = users.find((user) => user.username === username);
    if (existing) {
      const error = new Error("Username already exists");
      error.code = "23505";
      throw error;
    }
    const user = {
      id: users.length + 1,
      username,
      display_name: displayName,
      password_hash: passwordHash,
      created_at: new Date().toISOString()
    };
    users.push(user);
    return user;
  }
  const result = await pool.query(
    "INSERT INTO users (username, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id, username, display_name, created_at",
    [username, displayName, passwordHash]
  );
  return result.rows[0];
}

async function findUserByUsername(username) {
  if (usingMemoryStore) {
    return users.find((user) => user.username === username) || null;
  }
  const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
  return result.rows[0] || null;
}

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

app.get("/health", (req, res) => res.json({ service: "auth-service", status: "ok" }));
app.get("/health-auth", (req, res) => res.json({ service: "auth-service", status: "ok" }));
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.post("/auth/register", async (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password || !displayName) return res.status(400).json({ message: "username, password, and displayName are required" });
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await createUser({ username, displayName, passwordHash });
    res.status(201).json({ user, token: signToken(user) });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "Username already exists" });
    throw error;
  }
});

app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await findUserByUsername(username);
  if (!user || !(await bcrypt.compare(password || "", user.password_hash))) {
    return res.status(401).json({ message: "Invalid username or password" });
  }
  res.json({ user: { id: user.id, username: user.username, display_name: user.display_name }, token: signToken(user) });
});

app.get("/auth/me", requireAuth, (req, res) => res.json({ user: req.user }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

initDb().then(() => app.listen(PORT, () => console.log(`auth-service listening on ${PORT}`)));
