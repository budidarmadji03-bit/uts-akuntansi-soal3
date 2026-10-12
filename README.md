# UTS Coding Akuntansi

Repository tugas UTS Pemrograman/Coding Akuntansi FEB UNDIP.

## Struktur

```text
.
├── soal1/
├── soal2/
├── soal3/
│   ├── 3.1a_prompt_gemini.md
│   ├── 3.1b_verifikasi_psak2.md
│   ├── 3.2_audit_trail.sql
│   ├── voucher_kas_keluar.html
│   └── README.md
└── README.md
```

Folder Soal 3 mencakup formulir voucher kas keluar, dokumentasi Gemini Canvas, verifikasi akuntansi, SQL audit trail, dokumentasi teknis, dan skrip pendukung Supabase. Buka [README Soal 3](./soal3/README.md) untuk panduan, status integrasi, dan pengujian.

## Menjalankan Soal 3

Buka `soal3/voucher_kas_keluar.html` dengan Live Server di VS Code. Tailwind CSS dan Supabase JS dimuat melalui CDN sehingga koneksi internet diperlukan. Supabase belum aktif sampai project dan konfigurasi client-side disiapkan; tanpa konfigurasi, aplikasi tidak menyimpan transaksi.
