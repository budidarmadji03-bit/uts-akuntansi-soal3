# Menjalankan dan deployment

## VS Code / lokal

1. Buka direktori `soal3` di VS Code.
2. Lengkapi `supabase-config.js` dengan Project URL dan anon/publishable key, atau biarkan kosong untuk memastikan posting terkunci.
3. Jalankan `voucher_kas_keluar.html` menggunakan Live Server atau server statis lokal (`http://localhost` disarankan untuk auth). `index.html` hanya pintasan.
4. Login menggunakan akun Supabase, lalu uji COA, posting, riwayat, detail, reversal, audit trail, dan verifikasi hash.

## GitHub Pages

Frontend telah diterbitkan dari branch `main` dan folder `/(root)`.

- URL: https://budidarmadji03-bit.github.io/uts-akuntansi-soal3/
- Halaman utama repository meneruskan pengunjung ke `soal3/voucher_kas_keluar.html`.
- Workflow build dan deploy GitHub Pages berhasil.
- URL, halaman HTML, `app.js`, dan `style.css` telah dibuka dan diperiksa melalui browser.
- Karena `supabase-config.js` belum diisi, halaman menjelaskan bahwa posting transaksi belum tersedia. Jangan menganggap Supabase telah terhubung.

GitHub Pages hanya hosting frontend statis. Gunakan relative path seperti `./app.js`, `./style.css`, `./supabase-config.js` (sudah dipakai pada HTML), sedangkan Supabase URL harus absolute project URL.

File `supabase-config.js` memuat anon/publishable key yang memang client-side. Jangan pernah commit `service_role` key, password, access token, atau file `.env` rahasia. Sebelum repository dipublikasikan, isi key hanya setelah memastikan key yang dipakai adalah publishable/anon dan RLS sudah aktif.

## Belum selesai / manual

- Buat dan konfigurasi project Supabase.
- Jalankan dan validasi migration/seed.
- Tambahkan redirect URL localhost dan GitHub Pages pada Supabase Auth.
- Isi konfigurasi frontend dengan URL dan key client-side.
- Jalankan matriks `docs/pengujian.md`; periksa khusus privilege/RLS sebelum dipakai.
- Setelah perubahan frontend berikutnya, periksa kembali workflow Pages dan URL publik.
- Ambil screenshot/bukti Gemini Canvas dan NotebookLM hanya dari sesi aktual yang benar-benar dilakukan.
