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
const categories = [];
let usingMemoryStore = false;

client.collectDefaultMetrics({ prefix: "category_service_" });

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
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(80) NOT NULL,
        name VARCHAR(100) NOT NULL,
        color VARCHAR(20) DEFAULT '#4f46e5',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, name)
      );
    `);
    console.log("category-service using PostgreSQL");
  } catch (error) {
    usingMemoryStore = true;
    console.warn("PostgreSQL unavailable, using in-memory category store:", error.message);
  }
}

app.get("/health", (req, res) => res.json({ service: "category-service", status: "ok" }));
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.get("/categories", requireAuth, async (req, res) => {
  if (usingMemoryStore) {
    return res.json({ categories: categories.filter((category) => category.user_id === req.user.sub).sort((a, b) => a.name.localeCompare(b.name)) });
  }
  const result = await pool.query("SELECT * FROM categories WHERE user_id = $1 ORDER BY name", [req.user.sub]);
  res.json({ categories: result.rows });
});

app.get("/categories/:id", requireAuth, async (req, res) => {
  if (usingMemoryStore) {
    const category = categories.find((entry) => entry.id === Number(req.params.id) && entry.user_id === req.user.sub);
    if (!category) return res.status(404).json({ message: "Category not found" });
    return res.json({ category });
  }
  const result = await pool.query("SELECT * FROM categories WHERE id = $1 AND user_id = $2", [req.params.id, req.user.sub]);
  if (!result.rows[0]) return res.status(404).json({ message: "Category not found" });
  res.json({ category: result.rows[0] });
});

app.post("/categories", requireAuth, async (req, res) => {
  const { name, color = "#4f46e5" } = req.body;
  if (!name) return res.status(400).json({ message: "name is required" });
  if (usingMemoryStore) {
    const category = { id: categories.length + 1, user_id: req.user.sub, name, color, created_at: new Date().toISOString() };
    categories.push(category);
    return res.status(201).json({ category });
  }
  const result = await pool.query("INSERT INTO categories (user_id, name, color) VALUES ($1,$2,$3) RETURNING *", [req.user.sub, name, color]);
  res.status(201).json({ category: result.rows[0] });
});

app.delete("/categories/:id", requireAuth, async (req, res) => {
  if (usingMemoryStore) {
    const index = categories.findIndex((entry) => entry.id === Number(req.params.id) && entry.user_id === req.user.sub);
    if (index === -1) return res.status(404).json({ message: "Category not found" });
    const [removed] = categories.splice(index, 1);
    return res.json({ deleted: true, category: removed });
  }
  const result = await pool.query("DELETE FROM categories WHERE id = $1 AND user_id = $2 RETURNING *", [req.params.id, req.user.sub]);
  if (!result.rows[0]) return res.status(404).json({ message: "Category not found" });
  res.json({ deleted: true, category: result.rows[0] });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

initDb().then(() => app.listen(PORT, () => console.log(`category-service listening on ${PORT}`)));
