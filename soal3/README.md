# UTS Akuntansi — Soal 3

Aplikasi pembelajaran voucher kas keluar untuk Soal 3.1a, 3.1b, dan 3.2. Frontend menggunakan HTML5, Tailwind CSS CDN, JavaScript murni, dan Supabase JS v2. Backend yang disiapkan menggunakan PostgreSQL/Supabase RPC, RLS, trigger audit, dan SHA-256 melalui `pgcrypto`.

## Status

- **3.1a:** Form voucher dinamis, validasi sisi browser, klasifikasi arus kas, autentikasi Supabase, pengambilan chart of accounts, RPC posting, riwayat, detail/audit, reversal, dan verifikasi hash tersedia dalam kode. Uji browser lokal dilakukan; transaksi Supabase belum diuji karena project credentials belum disediakan.
- **3.1b:** Analisis awal dan prompt NotebookLM tersedia di `3.1b_verifikasi_psak2.md`. NotebookLM belum digunakan; temuan NotebookLM berstatus **BELUM DIVERIFIKASI**.
- **3.2:** Implementasi SQL kanonis tersedia di `3.2_audit_trail.sql`; belum diterapkan atau diuji di project Supabase.
- **Deployment:** Frontend statis sudah dipublikasikan melalui GitHub Pages: https://budidarmadji03-bit.github.io/uts-akuntansi-soal3/. Halaman dan asset berhasil dimuat. Posting transaksi tetap belum tersedia sampai project dan konfigurasi Supabase disiapkan; GitHub Pages hanya melayani frontend.

## Struktur

```text
soal3/
├── 3.1a_prompt_gemini.md
├── 3.1b_verifikasi_psak2.md
├── 3.2_audit_trail.sql
├── voucher_kas_keluar.html
├── index.html                      # pintasan ke formulir
├── README.md
├── app.js
├── style.css
├── supabase-config.js              # URL/key publishable kosong; bukan tempat service_role key
├── supabase/
│   ├── seed_chart_of_accounts.sql  # COA contoh, tanpa transaksi
│   └── test_cases.sql              # panduan smoke-test manual
└── docs/
    ├── arsitektur.md
    ├── pengujian.md
    └── deployment.md
```

`3.2_audit_trail.sql` menggantikan placeholder `audit_trail.sql` yang lama dan menjadi satu-satunya sumber SQL schema/RPC/security. Tidak ada salinan migration lain.

## Menyiapkan Supabase

1. Buat project Supabase baru untuk tugas ini dan aktifkan autentikasi email/password. Implementasi SQL ini ditujukan untuk project bersih; bila tabel dengan nama sama sudah ada, audit struktur/constraint/policy aktual terlebih dahulu dan buat migration upgrade khusus—jangan menganggap `IF NOT EXISTS` menyelaraskan schema yang berbeda.
2. Jalankan `3.2_audit_trail.sql` melalui SQL Editor. Script menggunakan ekstensi PostgreSQL `pgcrypto` di schema `extensions` untuk `digest(..., 'sha256')`. Kegagalan menyiapkan ekstensi harus ditangani, tidak diganti dengan hash buatan.
3. Jalankan `supabase/seed_chart_of_accounts.sql` untuk menambahkan chart akun contoh. Script ini tidak menambahkan voucher/jurnal contoh. Ganti COA sesuai kebijakan entitas sebelum penggunaan nyata.
4. Salin Project URL dan anon/publishable key dari pengaturan Supabase ke `supabase-config.js`. Contoh format:

   ```js
   window.APP_CONFIG = {
     supabaseUrl: "https://PROJECT_REF.supabase.co",
     supabaseAnonKey: "SUPABASE_PUBLISHABLE_OR_ANON_KEY"
   };
   ```

   Publishable/anon key memang digunakan oleh klien browser dan bukan rahasia; keamanan harus berasal dari RLS/RPC. Jangan pernah memasukkan `service_role` key ke berkas frontend atau repository.
5. Buat/konfirmasi akun lewat formulir aplikasi. Jika konfirmasi email diaktifkan, ikuti tautan konfirmasi sebelum masuk.

Urutan SQL: **`3.2_audit_trail.sql` → `supabase/seed_chart_of_accounts.sql` → `supabase/test_cases.sql`** (test cases merupakan panduan dan memerlukan UUID pengguna yang sah; jangan jalankan di production).

## Menjalankan frontend

Buka folder `soal3` di VS Code, lalu buka `voucher_kas_keluar.html` dengan Live Server atau server statis lokal. `index.html` hanya pintasan ke formulir. Halaman memakai CDN sehingga memerlukan internet. `file://` dapat membatasi perilaku browser; gunakan `http://localhost` untuk pengujian autentikasi. Tanpa konfigurasi Supabase, halaman menjelaskan bahwa posting tidak tersedia dan tidak membuat transaksi palsu.

## API dan tabel

- `chart_of_accounts`, `journal_headers`, `journal_lines`, `audit_log`.
- `rpc_create_cash_voucher(p_transaction_date, p_voucher_no, p_description, p_cash_flow_activity, p_lines)`.
- `rpc_reverse_journal(p_journal_id, p_reversal_voucher_no, p_reversal_date, p_reason)`.
- `rpc_verify_journal_hash(p_journal_id)`.

Semua akun jurnal harus aktif. Setiap jurnal harus memiliki sekurangnya dua baris, seimbang, punya kredit akun bertanda `is_cash`, dan tidak mendebit akun `is_cash`. `created_by` diambil dari `auth.uid()` dan waktu berasal dari server. Aplikasi hanya menerima role `authenticated`; tabel tidak memberi hak tulis langsung kepada role browser. Hash merangkum header, metadata, baris terurut, urutan rantai, dan hash sebelumnya. Satu row state yang dikunci transaksi menserialisasi posting.

Audit log meliputi insert/post header dan baris serta perubahan chart akun. Jurnal POSTED tidak dapat diubah/dihapus melalui trigger; koreksi dibuat sebagai jurnal reversal baru. Hash/trigger bukan perlindungan terhadap administrator database yang dapat mengubah schema, menonaktifkan trigger, atau menulis ulang data dan rantai; backup/akses admin/prosedur audit independen tetap diperlukan.

## Validasi dan pengujian

Nominal frontend dihitung sebagai integer sen dan database memakai `numeric(18,2)` plus pemeriksaan desimal. Browser memvalidasi cepat untuk UX, sedangkan RPC mengulang aturan keuangan. Kasus manual dan status aktual dicatat di [`docs/pengujian.md`](docs/pengujian.md). Supabase integration/security ditandai **NOT RUN** hingga konfigurasi dan project uji tersedia.

## Dokumentasi jawaban

- 3.1a: [`3.1a_prompt_gemini.md`](3.1a_prompt_gemini.md) dan [`docs/pengujian.md`](docs/pengujian.md).
- 3.1b: [`3.1b_verifikasi_psak2.md`](3.1b_verifikasi_psak2.md).
- 3.2: [`3.2_audit_trail.sql`](3.2_audit_trail.sql), [`docs/arsitektur.md`](docs/arsitektur.md), dan [`docs/pengujian.md`](docs/pengujian.md).
- Langkah hosting: [`docs/deployment.md`](docs/deployment.md).
