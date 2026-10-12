# Rencana dan hasil pengujian

## Lingkungan yang tersedia

- Pemeriksaan awal purwarupa lama di browser file: perhitungan rupiah, keseimbangan, tanggal masa depan, aturan Kas, tambah/hapus, submit lokal tanpa penyimpanan — **PASS saat versi frontend sebelumnya diuji**.
- Versi terbaru setelah integrasi Supabase: harus diuji lagi dengan konfigurasi kosong dan browser setelah membuka halaman.
- Pemeriksaan Problems editor: sebelumnya tidak menemukan error untuk frontend 3.1a sebelum integrasi; belum setara dengan uji build lengkap.
- Node.js dan `psql` tidak tersedia di environment ini.
- Tidak ada Supabase project URL, key, maupun koneksi database yang disediakan. Semua pengujian backend, integrasi, concurrency, dan RLS **NOT RUN**.
- Gemini Canvas dan NotebookLM **belum digunakan**; tidak ada bukti/screenshot eksternal yang dibuat.

## Matriks 3.1a dan frontend

| ID | Langkah | Hasil yang diharapkan | Hasil aktual | Status |
|---|---|---|---|---|
| FE-01 | Buka `index.html` pada browser | Form tampil responsif tanpa error JS | Versi awal tampil; versi integrasi harus diuji ulang | NOT RUN (final) |
| FE-02 | Tambah lalu hapus baris jurnal | Baris dan total diperbarui | Berhasil pada versi awal | PASS (versi awal) |
| FE-03 | Debit Rp0,10 + Rp0,20, kredit Rp0,30 | Total sen tepat Rp0,30 dan SEIMBANG | Berhasil pada versi awal | PASS (versi awal) |
| FE-04 | Ubah kredit agar berbeda | TIDAK SEIMBANG dan selisih terlihat | Berhasil pada versi awal | PASS (versi awal) |
| FE-05 | Isi tanggal besok Asia/Jakarta | Submit dikunci dengan alasan tanggal | Berhasil pada versi awal | PASS (versi awal) |
| FE-06 | Isi kredit non-kas atau debit akun Kas | Aturan kas keluar gagal | Berhasil pada versi awal | PASS (versi awal) |
| FE-07 | Masukkan lebih dari 2 desimal/nominal negatif/baris nol | Nominal dinyatakan invalid dan submit dikunci | Presisi desimal diuji di versi awal; negative/zero ditelaah secara kode | PARTIAL |
| FE-08 | Checklist review tidak dicentang | Submit terkunci; alasan tampil | Berhasil pada versi awal | PASS (versi awal) |
| FE-09 | Submit tanpa konfigurasi Supabase | Tidak ada transaksi palsu; konfigurasi/login diwajibkan | Belum menjalankan versi integrasi final | NOT RUN |
| FE-10 | Submit dengan konfigurasi dan sesi nyata | RPC merespons id/hash atau error eksplisit | Tidak ada project/key | NOT RUN |

## Matriks Soal 3.2 (integrasi Supabase)

Semua test memerlukan project Supabase test dan UUID pengguna Auth. Lihat skrip/manual case di `../supabase/test_cases.sql`.

| ID | Pengujian | Ekspektasi | Aktual | Status |
|---|---|---|---|---|
| DB-01 | Jalankan migration pada project bersih | Semua schema, trigger, function, extension terbuat | Belum ada project | NOT RUN |
| DB-02 | Seed COA contoh | Akun aktif, akun kas dikenali | Belum dijalankan | NOT RUN |
| DB-03 | Posting jurnal seimbang dengan kredit Kas | Atomic POSTED, `created_by`, server timestamp, sequence, SHA-256 | Belum dijalankan | NOT RUN |
| DB-04 | Jurnal tak seimbang/nol/kurang dua baris | Ditolak server | Belum dijalankan | NOT RUN |
| DB-05 | Negative, >2 desimal, kedua sisi, akun invalid/nonaktif | Ditolak server | Belum dijalankan | NOT RUN |
| DB-06 | Tanpa kredit kas atau debit kas | Ditolak server | Belum dijalankan | NOT RUN |
| DB-07 | Tanggal masa depan WIB | Ditolak server | Belum dijalankan | NOT RUN |
| DB-08 | Voucher duplikat | Ditolak UNIQUE | Belum dijalankan | NOT RUN |
| DB-09 | RPC anonymous/direct DML/TRUNCATE | Denied sesuai grant/RLS | Belum diuji; butuh project | NOT RUN |
| DB-10 | UPDATE/DELETE header POSTED | Trigger menolak | Belum diuji | NOT RUN |
| DB-11 | INSERT/UPDATE/DELETE line POSTED | Trigger menolak | Belum diuji | NOT RUN |
| DB-12 | Reversal | Header asal tetap; nilai debit/kredit ditukar; hash baru | Belum diuji | NOT RUN |
| DB-13 | Reversal kedua dan dua request bersamaan | Satu reversal; constraint/lock mencegah duplikasi | Belum diuji | NOT RUN |
| DB-14 | Audit log | Aktor/waktu/action/object/old-new tercatat | Belum diuji | NOT RUN |
| DB-15 | Ubah data controlled lalu verifikasi hash | Checksum mismatch ditemukan | Belum diuji (hanya disposable DB) | NOT RUN |
| DB-16 | Dua posting paralel | Sequence/hash berurutan tanpa cabang | Belum diuji | NOT RUN |
| DB-17 | Role/privilege/RLS | anon tak akses; authenticated select dan RPC sesuai hak | Belum diuji | NOT RUN |
| UI-01 | Layar desktop dan ponsel versi final | Kontrol terlihat dan dapat digunakan | Belum diuji setelah integrasi | NOT RUN |

Tandai PASS hanya setelah langkah dilakukan pada project target dan simpan bukti/log aktual. Jangan jalankan test hash tampering, privilege, atau parallel pada database produksi.
