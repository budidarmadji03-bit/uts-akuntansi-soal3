# Menjalankan dan deployment

## VS Code / lokal

1. Buka direktori `soal3` di VS Code.
2. Lengkapi `supabase-config.js` dengan Project URL dan anon/publishable key, atau biarkan kosong untuk memastikan posting terkunci.
3. Jalankan `index.html` menggunakan Live Server atau server statis lokal (`http://localhost` disarankan untuk auth).
4. Login menggunakan akun Supabase, lalu uji COA, posting, riwayat, detail, reversal, audit trail, dan verifikasi hash.

## GitHub Pages

GitHub Pages hanya menjadi hosting frontend statis. Gunakan relative path seperti `./app.js`, `./style.css`, `./supabase-config.js` (sudah dipakai pada HTML), sedangkan Supabase URL harus absolute project URL. Aktifkan Pages dari branch `main` dan folder `/(root)` pada repository Soal 3 ini, lalu uji URL GitHub Pages sebelum menyatakan deployment aktif.

File `supabase-config.js` memuat anon/publishable key yang memang client-side. Jangan pernah commit `service_role` key, password, access token, atau file `.env` rahasia. Sebelum repository dipublikasikan, isi key hanya setelah memastikan key yang dipakai adalah publishable/anon dan RLS sudah aktif.

## Belum selesai / manual

- Buat dan konfigurasi project Supabase.
- Jalankan dan validasi migration/seed.
- Tambahkan redirect URL localhost dan GitHub Pages pada Supabase Auth.
- Isi konfigurasi frontend dengan URL dan key client-side.
- Jalankan matriks `docs/pengujian.md`; periksa khusus privilege/RLS sebelum dipakai.
- Aktifkan Pages dan verifikasi URL publik.
- Ambil screenshot/bukti Gemini Canvas dan NotebookLM hanya dari sesi aktual yang benar-benar dilakukan.
