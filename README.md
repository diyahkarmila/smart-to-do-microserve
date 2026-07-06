# Smart To-Do List Management System using Microservice Architecture

Proyek ini adalah implementasi microservice untuk sistem Smart To-Do List. Aplikasi memisahkan autentikasi, task, kategori, notifikasi, realtime update, dan analytics ke beberapa service yang berjalan terpisah.

## Fitur utama
- Auth service dengan JWT
- Task service dengan CRUD dan validasi kategori
- Category service untuk pengelolaan kategori
- Notification service untuk notifikasi event task
- Realtime service dengan WebSocket
- Analytics service untuk ringkasan data

## Jalankan lokal
```powershell
cd D:\smart-todo-microservices
.\scripts\run-local.ps1
```

## Jalankan dengan Docker
```powershell
cd D:\smart-todo-microservices
Copy-Item .env.example .env
docker compose up --build -d
```

## Dokumentasi
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/IMPLEMENTATION_NOTES.md](docs/IMPLEMENTATION_NOTES.md)
