# Catatan Implementasi Smart Todo Microservices

## Ringkasan
Proyek ini telah disesuaikan agar menampilkan arsitektur microservice, endpoint layanan, monitoring, dan alur demo yang sesuai dengan tugas.

## Cara menjalankan

### Opsi 1: Jalankan semua layanan lokal
PowerShell:
```powershell
cd D:\smart-todo-microservices
.\scripts\run-local.ps1
```

### Opsi 2: Jalankan satu layanan
```powershell
cd D:\smart-todo-microservices\services\auth-service
$env:PORT = "3001"
$env:JWT_SECRET = "smart-todo-super-secret"
npm start
```

## Endpoint utama
- Auth: http://127.0.0.1:3001/auth/register
- Category: http://127.0.0.1:3002/categories
- Task: http://127.0.0.1:3003/tasks
- Notification: http://127.0.0.1:3004/notifications
- Analytics: http://127.0.0.1:3006/analytics/summary

## Catatan lingkungan
Docker Compose pada lingkungan ini gagal karena filesystem container daemon bersifat read-only. Karena itu, jalankan versi lokal untuk verifikasi fungsionalitas.
