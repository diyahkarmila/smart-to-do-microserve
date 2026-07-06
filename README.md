# Smart To-Do List Management System using Microservice Architecture

Proyek ini adalah implementasi AFL-3 Microservice Development dengan use case Smart To-Do List Management System. Sistem memisahkan autentikasi, task, kategori, notifikasi, realtime update, dan analytics ke beberapa service yang berjalan sebagai container terpisah.

## Ringkasan Rubrik

| Requirement | Implementasi |
| --- | --- |
| Desain arsitektur microservice | `docs/ARCHITECTURE.md` berisi diagram dan penjelasan service |
| Lebih dari 10 container | 16 container di `docker-compose.yml` |
| Satu skema komunikasi | REST API melalui Traefik |
| Dua skema komunikasi | REST API + WebSocket, dengan Redis Pub/Sub untuk event internal |
| Monitoring host | `node-exporter` + Prometheus + Grafana |
| Monitoring container | `cadvisor` + Prometheus + Grafana |
| Traefik API Gateway | Container `traefik` routing path ke service |
| Middleware autentikasi | JWT middleware di auth, task, category, notification, analytics, realtime WS |
| Deployment otomatis | `docker compose up --build -d` |
| Endpoint diuji | `scripts/test-endpoints.ps1` |

## Container

1. traefik
2. auth-service
3. task-service
4. category-service
5. notification-service
6. realtime-service
7. analytics-service
8. auth-db
9. task-db
10. category-db
11. notification-db
12. redis
13. prometheus
14. grafana
15. node-exporter
16. cadvisor

## Cara Menjalankan

```powershell
cd D:\smart-todo-microservices
Copy-Item .env.example .env
docker compose up --build -d
```

Akses dashboard:

- API via Traefik: `http://localhost`
- Traefik dashboard: `http://localhost:8080`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000` dengan user `admin` dan password `admin`

## Uji Endpoint

```powershell
cd D:\smart-todo-microservices
.\scripts\test-endpoints.ps1
```

Script akan register/login user, membuat kategori, membuat task, update task, membaca notifikasi, dan mengambil analytics summary.

## Contoh Curl

```bash
curl -X POST http://localhost/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"password123","displayName":"Demo User"}'
```

Gunakan token dari respons:

```bash
curl http://localhost/tasks -H "Authorization: Bearer YOUR_TOKEN"
```

WebSocket realtime:

```text
ws://localhost/ws?token=YOUR_TOKEN
```

Saat task dibuat, diupdate, atau dihapus, `task-service` publish event ke Redis. `notification-service` menyimpan notifikasi, dan `realtime-service` mengirim event ke client WebSocket.
