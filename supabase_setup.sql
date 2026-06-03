-- ==========================================
-- LAF Stock Management System - Supabase DDL Setup
-- ==========================================
-- Jalankan seluruh script ini di Supabase SQL Editor
-- (Dashboard > SQL Editor > New Query)

-- 1. DROP EXISTING TRIGGERS IF TABLES EXIST (Untuk Keamanan/Re-runs tanpa menghapus data)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'barang_keluar') THEN
        DROP TRIGGER IF EXISTS trg_check_stock_before_insert ON barang_keluar;
        DROP TRIGGER IF EXISTS trg_stock_log_keluar ON barang_keluar;
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'barang_masuk') THEN
        DROP TRIGGER IF EXISTS trg_stock_log_masuk ON barang_masuk;
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'products') THEN
        DROP TRIGGER IF EXISTS trg_generate_sku ON products;
    END IF;
END
$$;

-- 2. CREATE LOKASI TABLE (Dinamis)
CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_lokasi TEXT UNIQUE NOT NULL, -- E.g., 'TOKO', 'GUDANG'
    tipe_lokasi TEXT NOT NULL DEFAULT 'retail' CHECK (tipe_lokasi IN ('retail', 'warehouse', 'other')),
    alamat TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Inisialisasi Lokasi Default
INSERT INTO locations (nama_lokasi, tipe_lokasi) VALUES 
('TOKO', 'retail'),
('GUDANG', 'warehouse')
ON CONFLICT (nama_lokasi) DO NOTHING;

-- 3. CREATE CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_kategori TEXT UNIQUE NOT NULL, -- E.g., 'Sepatu', 'Sandal', 'Apparel'
    kode_prefix TEXT UNIQUE NOT NULL CHECK (char_length(kode_prefix) >= 2), -- E.g., 'SHOE', 'SNDL'
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Inisialisasi Kategori Default
INSERT INTO categories (nama_kategori, kode_prefix) VALUES
('Sepatu', 'SHOE'),
('Sandal', 'SNDL'),
('Apparel', 'APRL'),
('Accessories', 'ACC')
ON CONFLICT (nama_kategori) DO NOTHING;

-- 4. CREATE PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_produk TEXT NOT NULL,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    kode_barang TEXT UNIQUE, -- Generated otomatis jika dikosongkan
    nama_barang TEXT NOT NULL,
    variasi_barang TEXT, -- Warna/Size (misal: "Black / 42")
    satuan TEXT NOT NULL DEFAULT 'psg', -- Default: psg (pasang)
    harga_hpp NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (harga_hpp >= 0),
    lokasi_default_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    stok_minimum INTEGER NOT NULL DEFAULT 5 CHECK (stok_minimum >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. CREATE BARANG MASUK TABLE
CREATE TABLE IF NOT EXISTS barang_masuk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    produk_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    qty_masuk INTEGER NOT NULL CHECK (qty_masuk > 0),
    satuan TEXT NOT NULL DEFAULT 'psg',
    lokasi_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    keterangan TEXT,
    tipe_nota TEXT DEFAULT 'Dari Supplier/Pembelian',
    nama_supplier TEXT,
    nomor_nota TEXT,
    operator TEXT,
    hpp NUMERIC(15, 2) DEFAULT 0 CHECK (hpp >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. CREATE BARANG KELUAR TABLE
CREATE TABLE IF NOT EXISTS barang_keluar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    tipe_nota TEXT NOT NULL, -- E-Commerce, Manual, Retur, dll.
    nama_pelanggan TEXT,
    nomor_nota TEXT,
    keterangan TEXT,
    produk_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    qty_keluar INTEGER NOT NULL CHECK (qty_keluar > 0),
    satuan TEXT NOT NULL DEFAULT 'psg',
    lokasi_pengambilan_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    hpp NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (hpp >= 0),
    sumber_penjualan TEXT, -- Shopee, Tokopedia, Website, dll.
    operator TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. CREATE STOCK LOGS TABLE (Untuk Audit Trail & Kecepatan Query Histori)
CREATE TABLE IF NOT EXISTS stock_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produk_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tipe TEXT NOT NULL CHECK (tipe IN ('MASUK', 'KELUAR')),
    qty INTEGER NOT NULL CHECK (qty > 0),
    lokasi_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    ref_id UUID NOT NULL, -- Menunjuk ke id barang_masuk / barang_keluar
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes untuk optimasi query pembacaan data
CREATE INDEX IF NOT EXISTS idx_products_kode ON products(kode_barang);
CREATE INDEX IF NOT EXISTS idx_barang_masuk_produk ON barang_masuk(produk_id);
CREATE INDEX IF NOT EXISTS idx_barang_keluar_produk ON barang_keluar(produk_id);
CREATE INDEX IF NOT EXISTS idx_stock_logs_lookup ON stock_logs(produk_id, lokasi_id);

-- 8. AUTOMATIC SKU GENERATOR FUNCTION & TRIGGER
CREATE OR REPLACE FUNCTION generate_sku()
RETURNS TRIGGER AS $$
DECLARE
    prefix TEXT;
    next_seq INTEGER;
BEGIN
    -- Ambil prefix dari tabel categories
    SELECT kode_prefix INTO prefix FROM categories WHERE id = NEW.category_id;
    
    IF prefix IS NULL THEN
        prefix := 'GEN';
    END IF;
    
    -- Hitung total produk dalam kategori ini untuk generate urutan berikutnya
    SELECT COALESCE(COUNT(*), 0) + 1 INTO next_seq 
    FROM products 
    WHERE category_id = NEW.category_id;
    
    -- Format SKU: LAF-[PREFIX]-[SEQUENCE_4_DIGIT] (E.g. LAF-SHOE-0001)
    NEW.kode_barang := 'LAF-' || prefix || '-' || LPAD(next_seq::text, 4, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_sku
BEFORE INSERT ON products
FOR EACH ROW
WHEN (NEW.kode_barang IS NULL OR NEW.kode_barang = '')
EXECUTE FUNCTION generate_sku();

-- 9. STOCK CALCULATION FUNCTION
-- Menghitung stok saat ini untuk produk tertentu di lokasi tertentu
CREATE OR REPLACE FUNCTION get_stock_qty(p_id UUID, loc_id UUID)
RETURNS INTEGER AS $$
DECLARE
    masuk INTEGER;
    keluar INTEGER;
BEGIN
    SELECT COALESCE(SUM(qty_masuk), 0) INTO masuk FROM barang_masuk WHERE produk_id = p_id AND lokasi_id = loc_id;
    SELECT COALESCE(SUM(qty_keluar), 0) INTO keluar FROM barang_keluar WHERE produk_id = p_id AND lokasi_pengambilan_id = loc_id;
    RETURN masuk - keluar;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. TRIGGER: CEK STOK NEGATIF (Race condition prevention di server-side)
CREATE OR REPLACE FUNCTION check_stock_before_insert()
RETURNS TRIGGER AS $$
DECLARE
    current_stock INTEGER;
BEGIN
    current_stock := get_stock_qty(NEW.produk_id, NEW.lokasi_pengambilan_id);
    
    -- Jika operasi adalah UPDATE dan lokasi/produk sama, tambahkan kembali qty_keluar lama
    -- agar tidak terjadi double subtraction saat validasi stok.
    IF TG_OP = 'UPDATE' AND OLD.produk_id = NEW.produk_id AND OLD.lokasi_pengambilan_id = NEW.lokasi_pengambilan_id THEN
        current_stock := current_stock + OLD.qty_keluar;
    END IF;

    IF (current_stock - NEW.qty_keluar) < 0 THEN
        RAISE EXCEPTION 'Stok tidak mencukupi di lokasi tersebut! (Stok saat ini: %, Anda mencoba mengambil: %)', 
            current_stock, NEW.qty_keluar;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_stock_before_insert
BEFORE INSERT OR UPDATE ON barang_keluar
FOR EACH ROW
EXECUTE FUNCTION check_stock_before_insert();

-- 11. TRIGGERS: AUTOMATIC STOCK LOGGING
-- Secara otomatis menulis log ke tabel stock_logs ketika ada barang masuk/keluar
CREATE OR REPLACE FUNCTION process_stock_log_masuk()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO stock_logs (produk_id, tipe, qty, lokasi_id, ref_id, created_at)
    VALUES (NEW.produk_id, 'MASUK', NEW.qty_masuk, NEW.lokasi_id, NEW.id, NEW.created_at);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_log_masuk
AFTER INSERT ON barang_masuk
FOR EACH ROW
EXECUTE FUNCTION process_stock_log_masuk();

CREATE OR REPLACE FUNCTION process_stock_log_keluar()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO stock_logs (produk_id, tipe, qty, lokasi_id, ref_id, created_at)
    VALUES (NEW.produk_id, 'KELUAR', NEW.qty_keluar, NEW.lokasi_pengambilan_id, NEW.id, NEW.created_at);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_log_keluar
AFTER INSERT ON barang_keluar
FOR EACH ROW
EXECUTE FUNCTION process_stock_log_keluar();

-- ==========================================
-- 12. ROW LEVEL SECURITY (RLS) POLICIES SETUP
-- ==========================================
-- Mengaktifkan RLS dan memberikan akses publik penuh (read/write) 
-- agar browser dapat melakukan kueri langsung via Anon Key.

-- Hapus policy lama jika ada (agar kueri re-runnable)
DROP POLICY IF EXISTS "Allow public read/write access" ON locations;
DROP POLICY IF EXISTS "Allow public read/write access" ON categories;
DROP POLICY IF EXISTS "Allow public read/write access" ON products;
DROP POLICY IF EXISTS "Allow public read/write access" ON barang_masuk;
DROP POLICY IF EXISTS "Allow public read/write access" ON barang_keluar;
DROP POLICY IF EXISTS "Allow public read/write access" ON stock_logs;

-- Aktifkan RLS pada masing-masing tabel
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE barang_masuk ENABLE ROW LEVEL SECURITY;
ALTER TABLE barang_keluar ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_logs ENABLE ROW LEVEL SECURITY;

-- Buat policy bebas akses untuk publik
CREATE POLICY "Allow public read/write access" ON locations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write access" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write access" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write access" ON barang_masuk FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write access" ON barang_keluar FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write access" ON stock_logs FOR ALL USING (true) WITH CHECK (true);
