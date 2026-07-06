# Desain Arsitektur Microservice

## Use Case

Smart To-Do List Management System membantu user mengelola pekerjaan berdasarkan kategori, prioritas, status, deadline, notifikasi perubahan task, dan ringkasan produktivitas.

## Diagram Keseluruhan

```mermaid
flowchart LR
    Client[Client / Postman / Browser] --> Traefik[Traefik API Gateway]

    Traefik --> Auth[auth-service]
    Traefik --> Task[task-service]
    Traefik --> Category[category-service]
    Traefik --> Notification[notification-service]
    Traefik --> Realtime[realtime-service WebSocket]
    Traefik --> Analytics[analytics-service]

    Auth --> AuthDB[(auth-db PostgreSQL)]
    Task --> TaskDB[(task-db PostgreSQL)]
    Category --> CategoryDB[(category-db PostgreSQL)]
    Notification --> NotificationDB[(notification-db PostgreSQL)]

    Task -->|REST validate category| Category
    Analytics -->|REST read tasks| Task
    Analytics -->|REST read notifications| Notification

    Task -->|publish task.events| Redis[(Redis Pub/Sub)]
    Redis -->|subscribe| Notification
    Redis -->|subscribe| Realtime
    Realtime -->|WebSocket push| Client

    Prometheus[Prometheus] --> Auth
    Prometheus --> Task
    Prometheus --> Category
    Prometheus --> Notification
    Prometheus --> Realtime
    Prometheus --> Analytics
    Prometheus --> NodeExporter[node-exporter host monitoring]
    Prometheus --> CAdvisor[cAdvisor container monitoring]
    Grafana[Grafana Dashboard] --> Prometheus
```

## Service Boundary

| Service | Tanggung Jawab | Database |
| --- | --- | --- |
| auth-service | Register, login, JWT token, profile user | auth-db |
| task-service | CRUD task, status, priority, due date, publish event | task-db |
| category-service | CRUD kategori per user | category-db |
| notification-service | Subscribe task event dan menyimpan notifikasi | notification-db |
| realtime-service | WebSocket gateway untuk update task realtime | - |
| analytics-service | Summary task, overdue, status, dan notifikasi terbaru | - |

## Skema Komunikasi

1. REST API
   - Client mengakses service melalui Traefik.
   - `task-service` memanggil `category-service` untuk validasi kategori.
   - `analytics-service` memanggil `task-service` dan `notification-service` untuk membuat summary.

2. WebSocket
   - Client membuka koneksi ke `ws://localhost/ws?token=JWT`.
   - `realtime-service` memvalidasi JWT lalu mengirim event task secara realtime.

3. Event internal
   - `task-service` publish event `task.created`, `task.updated`, dan `task.deleted` ke Redis Pub/Sub.
   - `notification-service` dan `realtime-service` subscribe channel `task.events`.

## API Gateway

Traefik melakukan routing berbasis path:

| Path | Tujuan |
| --- | --- |
| `/auth/*` | auth-service |
| `/tasks/*` | task-service |
| `/categories/*` | category-service |
| `/notifications/*` | notification-service |
| `/analytics/*` | analytics-service |
| `/realtime`, `/ws` | realtime-service |

## Autentikasi

JWT dibuat oleh `auth-service` saat register/login. Endpoint protected membaca header:

```text
Authorization: Bearer <token>
```

Middleware JWT ada pada service berikut:

- auth-service: `/auth/me`
- task-service: semua endpoint `/tasks`
- category-service: semua endpoint `/categories`
- notification-service: semua endpoint `/notifications`
- analytics-service: `/analytics/summary`
- realtime-service: koneksi `/ws?token=...`

## Monitoring

- Host monitoring: `node-exporter` expose CPU, memory, disk host ke Prometheus.
- Container monitoring: `cadvisor` expose CPU/memory/network per container.
- Application monitoring: semua Node.js service expose `/metrics` dengan `prom-client`.
- Grafana otomatis membaca datasource Prometheus dan dashboard `Smart Todo Microservices`.

## Alur Demo

1. Jalankan semua container dengan `docker compose up --build -d`.
2. Buka dashboard Traefik di `http://localhost:8080` dan tunjukkan router service aktif.
3. Jalankan `scripts/test-endpoints.ps1` untuk membuktikan endpoint bekerja.
4. Buka Prometheus `http://localhost:9090` dan cek target scrape.
5. Buka Grafana `http://localhost:3000`, dashboard `Smart Todo Microservices`.
6. Opsional: buka WebSocket client ke `ws://localhost/ws?token=TOKEN`, lalu buat/update task.
