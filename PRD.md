# 📄 Product Requirements Document (PRD)

## Stock Management System (Next.js + Vue.js + Supabase)

---

## 1. 📌 Overview

### Nama Produk:

Stock Management System

### Deskripsi:

Aplikasi berbasis web untuk mengelola data stok barang yang mencakup:

* Master Data Barang
* Input Barang Masuk
* Input Barang Keluar (Penjualan)
* Perhitungan stok otomatis
* Multi lokasi (TOKO & GUDANG)

---

## 2. 🎯 Tujuan

* Mempermudah pencatatan stok barang secara digital
* Menghindari kesalahan perhitungan stok
* Menyediakan data real-time untuk pengambilan keputusan
* Menyederhanakan proses input barang masuk & keluar

---

## 3. 🧩 Scope Fitur

### 3.1 Modul Utama

#### 1. Stock Master

* CRUD data barang
* Menyimpan informasi detail produk

#### 2. Barang Masuk

* Input barang masuk
* Tracking histori

#### 3. Barang Keluar

* Input penjualan / barang keluar
* Tracking histori

#### 4. Stok Otomatis

* Perhitungan stok berdasarkan transaksi

#### 5. Multi Lokasi

* TOKO
* GUDANG

---

## 4. 🗄️ Database Design

### 4.1 Tabel: products

| Field          | Type      | Description          |
| -------------- | --------- | -------------------- |
| id             | uuid (PK) | ID produk            |
| nama_produk    | text      | Nama produk          |
| kategori       | text      | Kategori             |
| kode_barang    | text      | Kode unik            |
| nama_barang    | text      | Nama barang          |
| variasi_barang | text      | Variasi (warna/size) |
| satuan         | text      | pcs / psg            |
| harga_hpp      | numeric   | Harga pokok          |
| lokasi_default | text      | TOKO / GUDANG        |
| created_at     | timestamp | Timestamp            |
| updated_at     | timestamp | Timestamp            |

---

### 4.2 Tabel: barang_masuk

| Field      | Type      | Description |
| ---------- | --------- | ----------- |
| id         | uuid (PK) |             |
| tanggal    | date      |             |
| produk_id  | uuid (FK) |             |
| qty_masuk  | integer   |             |
| satuan     | text      |             |
| lokasi     | text      |             |
| keterangan | text      |             |
| created_at | timestamp |             |

---

### 4.3 Tabel: barang_keluar

| Field              | Type      | Description |
| ------------------ | --------- | ----------- |
| id                 | uuid (PK) |             |
| tanggal            | date      |             |
| tipe_nota          | text      |             |
| nama_pelanggan     | text      |             |
| nomor_nota         | text      |             |
| keterangan         | text      |             |
| produk_id          | uuid (FK) |             |
| qty_keluar         | integer   |             |
| satuan             | text      |             |
| lokasi_pengambilan | text      |             |
| hpp                | numeric   |             |
| sumber_penjualan   | text      |             |
| created_at         | timestamp |             |

---

### 4.4 Tabel: stock_logs (Optional)

| Field      | Type                | Description |
| ---------- | ------------------- | ----------- |
| id         | uuid                |             |
| produk_id  | uuid                |             |
| tipe       | text (MASUK/KELUAR) |             |
| qty        | integer             |             |
| lokasi     | text                |             |
| ref_id     | uuid                |             |
| created_at | timestamp           |             |

---

## 5. 🧠 Logic Perhitungan Stok

Stok dihitung otomatis dengan rumus:

STOK = SUM(qty_masuk) - SUM(qty_keluar)

---

## 6. 🖥️ UI/UX Structure

### 6.1 Dashboard

* Total Produk
* Total Stok
* Barang Hampir Habis
* Grafik transaksi

---

### 6.2 Halaman Stock Master

* Table data barang
* Tambah / Edit / Hapus
* Search & filter

---

### 6.3 Halaman Barang Masuk

* Form input barang masuk
* Tabel histori

---

### 6.4 Halaman Barang Keluar

* Form input penjualan
* Tabel histori

---

## 7. ⚙️ Arsitektur Sistem

### Frontend:

* Next.js (Main Dashboard)
* Vue.js (Optional Micro Frontend)

### Backend:

* Supabase (PostgreSQL + Auth + Realtime)

---

## 8. 🔄 Flow Sistem

### Barang Masuk:

User input → barang_masuk → stock_logs → update stok

### Barang Keluar:

User input → barang_keluar → stock_logs → update stok

---

## 9. 🚨 Validasi Sistem

* Stok tidak boleh minus
* Produk harus tersedia di master
* Qty harus > 0
* Lokasi wajib diisi

---

## 10. 🚀 Future Development

* Import / Export Excel
* Multi gudang lanjutan
* AI prediksi stok
* Barcode system
* Role management

---

## 11. 📁 Struktur Project

### Next.js

/app
/dashboard
/products
/barang-masuk
/barang-keluar

/components
/lib
/services

---

### Vue.js (Optional)

/modules/pos
/modules/realtime-table

---

## 12. 🔌 Integrasi Supabase

* supabase.from('products')
* supabase.from('barang_masuk')
* supabase.from('barang_keluar')

Gunakan:

* Realtime subscription
* Row Level Security (RLS)

---

## 13. 📊 KPI

* Input cepat (< 3 detik)
* Error stok = 0
* Real-time update aktif
* UI responsif

---

## 14. 📌 Kesimpulan

Sistem ini dirancang untuk menjadi:

* Scalable
* Real-time
* Siap dikembangkan menjadi SaaS

---
