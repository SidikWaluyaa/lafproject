import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

// Helper to convert Excel date representation (serial number or DD/MM/YYYY) to YYYY-MM-DD
export const parseExcelDate = (val) => {
  if (!val) return new Date().toISOString().split('T')[0];
  
  if (typeof val === 'number') {
    // Excel base date is 30 Dec 1899 due to leap year bug in Lotus 1-2-3
    const date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  
  if (typeof val === 'string') {
    const cleanStr = val.trim();
    // Parse DD/MM/YYYY or DD-MM-YYYY
    const parts = cleanStr.split(/[-/]/);
    if (parts.length === 3) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      return `${y}-${m}-${d}`;
    }
    return cleanStr;
  }
  
  return new Date().toISOString().split('T')[0];
};

// ==========================================
// 1. STOCK MASTER EXCEL UTILITIES
// ==========================================

export const PRODUCT_TEMPLATE_HEADERS = [
  'Nama Produk',
  'Kategori',
  'Nama Barang',
  'Variasi',
  'Satuan',
  'Lokasi',
  'Stok Minimum'
];

export function downloadExcelTemplate() {
  const sampleData = [
    {
      [PRODUCT_TEMPLATE_HEADERS[0]]: 'JACK V1 HITAM',
      [PRODUCT_TEMPLATE_HEADERS[1]]: 'Sepatu',
      [PRODUCT_TEMPLATE_HEADERS[2]]: 'JACK V1 HITAM 36',
      [PRODUCT_TEMPLATE_HEADERS[3]]: 'Hitam / 36',
      [PRODUCT_TEMPLATE_HEADERS[4]]: 'psg',
      [PRODUCT_TEMPLATE_HEADERS[5]]: 'GUDANG',
      [PRODUCT_TEMPLATE_HEADERS[6]]: 5
    },
    {
      [PRODUCT_TEMPLATE_HEADERS[0]]: 'JACK V1 HITAM',
      [PRODUCT_TEMPLATE_HEADERS[1]]: 'Sepatu',
      [PRODUCT_TEMPLATE_HEADERS[2]]: 'JACK V1 HITAM 37',
      [PRODUCT_TEMPLATE_HEADERS[3]]: 'Hitam / 37',
      [PRODUCT_TEMPLATE_HEADERS[4]]: 'psg',
      [PRODUCT_TEMPLATE_HEADERS[5]]: 'GUDANG',
      [PRODUCT_TEMPLATE_HEADERS[6]]: 5
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: PRODUCT_TEMPLATE_HEADERS });
  worksheet['!cols'] = PRODUCT_TEMPLATE_HEADERS.map(h => ({ wch: Math.max(h.length, 18) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Master Template');
  XLSX.writeFile(workbook, 'laf_stock_master_template.xlsx');
}

export async function importProductsFromExcel(file, existingLocations, existingCategories, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet);

        if (rows.length === 0) {
          throw new Error('File Excel kosong atau format tidak cocok.');
        }

        onProgress(`Menemukan ${rows.length} baris. Memulai import produk...`);
        let successCount = 0;
        let skipCount = 0;
        let categoryCache = [...existingCategories];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rawProdName = row['Nama Produk'] || row['#NAMA PRODUK#'];
          const rawCategory = row['Kategori'] || row['Kategori*'];
          const rawItemName = row['Nama Barang'] || row['Nama Barang*'];
          const rawVariant = row['Variasi'] || row['Variasi barang*'];
          const rawUnit = row['Satuan'] || row['satuan*'];
          const rawLocationDefaultName = row['Lokasi'] || row['Lokasi Default*'];
          const rawStokMinimum = row['Stok Minimum'] || row['Stok Minimum*'];

          if (!rawItemName || !rawCategory) {
            skipCount++;
            continue;
          }

          onProgress(`Memproses baris ${i + 1}/${rows.length}: ${rawItemName}...`);

          // 1. Resolve Category ID
          const cleanCatName = String(rawCategory).trim();
          let category = categoryCache.find(
            c => c.nama_kategori.toLowerCase() === cleanCatName.toLowerCase()
          );

          if (!category) {
            let prefix = cleanCatName.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase();
            if (prefix.length < 2) prefix = 'CAT';
            
            let prefixSuffix = 1;
            const basePrefix = prefix;
            while (categoryCache.some(c => c.kode_prefix === prefix)) {
              prefix = basePrefix.slice(0, 3) + prefixSuffix;
              prefixSuffix++;
            }

            const { data: newCat, error: catErr } = await supabase
              .from('categories')
              .insert([{ nama_kategori: cleanCatName, kode_prefix: prefix }])
              .select()
              .single();

            if (catErr) {
              console.error(catErr);
              skipCount++;
              continue;
            }

            category = newCat;
            categoryCache.push(newCat);
          }

          // 2. Resolve default location ID
          let locationId = null;
          if (rawLocationDefaultName) {
            const cleanLocName = String(rawLocationDefaultName).trim().toLowerCase();
            const location = existingLocations.find(l => l.nama_lokasi.toLowerCase() === cleanLocName);
            locationId = location ? location.id : existingLocations[0]?.id || null;
          } else {
            locationId = existingLocations[0]?.id || null;
          }

          // 3. Create Product (HPP is initialized to 0; SKU auto-generated by DB trigger)
          const productPayload = {
            nama_produk: rawProdName ? String(rawProdName).trim() : String(rawItemName).replace(/\s\d+$/, '').trim(),
            nama_barang: String(rawItemName).trim(),
            category_id: category.id,
            variasi_barang: rawVariant ? String(rawVariant).trim() : null,
            satuan: rawUnit ? String(rawUnit).trim() : 'psg',
            harga_hpp: 0,
            lokasi_default_id: locationId,
            stok_minimum: isNaN(parseInt(rawStokMinimum)) ? 5 : parseInt(rawStokMinimum)
          };

          const { error: prodErr } = await supabase
            .from('products')
            .insert([productPayload]);

          if (prodErr) {
            console.error(`Gagal insert produk pada baris ${i+1}:`, prodErr);
            skipCount++;
          } else {
            successCount++;
          }
        }

        resolve({ success: successCount, skipped: skipCount });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

// ==========================================
// 2. BARANG MASUK EXCEL UTILITIES
// ==========================================

export const BARANG_MASUK_TEMPLATE_HEADERS = [
  'Tanggal (DD/MM/YYYY)*',
  'Tipe Nota*',
  'Nama Supplier*',
  'No Nota',
  'Keterangan',
  'SKU Barang*',
  'QTY Masuk*',
  'Satuan*',
  'Operator*',
  'Lokasi Simpan*',
  'HPP Pokok*'
];

export function downloadBarangMasukTemplate() {
  const sampleData = [
    {
      [BARANG_MASUK_TEMPLATE_HEADERS[0]]: '31/01/2026',
      [BARANG_MASUK_TEMPLATE_HEADERS[1]]: 'Dari Supplier/Pembelian',
      [BARANG_MASUK_TEMPLATE_HEADERS[2]]: 'BUDI',
      [BARANG_MASUK_TEMPLATE_HEADERS[3]]: 'PO-JAN-01',
      [BARANG_MASUK_TEMPLATE_HEADERS[4]]: 'PO JANUARI',
      [BARANG_MASUK_TEMPLATE_HEADERS[5]]: 'LAF-SHOE-0001',
      [BARANG_MASUK_TEMPLATE_HEADERS[6]]: 93,
      [BARANG_MASUK_TEMPLATE_HEADERS[7]]: 'psg',
      [BARANG_MASUK_TEMPLATE_HEADERS[8]]: 'GITTA - BUSDEV',
      [BARANG_MASUK_TEMPLATE_HEADERS[9]]: 'GUDANG',
      [BARANG_MASUK_TEMPLATE_HEADERS[10]]: 73450
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: BARANG_MASUK_TEMPLATE_HEADERS });
  worksheet['!cols'] = BARANG_MASUK_TEMPLATE_HEADERS.map(h => ({ wch: Math.max(h.length, 18) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Barang Masuk Template');
  XLSX.writeFile(workbook, 'laf_barang_masuk_import_template.xlsx');
}

export async function importBarangMasukFromExcel(file, existingProducts, existingLocations, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet);

        if (rows.length === 0) {
          throw new Error('File Excel kosong atau format tidak cocok.');
        }

        onProgress(`Menemukan ${rows.length} baris transaksi masuk. Memproses...`);
        let successCount = 0;
        let failCount = 0;
        let errorDetails = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rawDate = row[BARANG_MASUK_TEMPLATE_HEADERS[0]];
          const rawTipe = row[BARANG_MASUK_TEMPLATE_HEADERS[1]];
          const rawSupplier = row[BARANG_MASUK_TEMPLATE_HEADERS[2]];
          const rawNota = row[BARANG_MASUK_TEMPLATE_HEADERS[3]];
          const rawNote = row[BARANG_MASUK_TEMPLATE_HEADERS[4]];
          const rawSku = row[BARANG_MASUK_TEMPLATE_HEADERS[5]];
          const rawQty = row[BARANG_MASUK_TEMPLATE_HEADERS[6]];
          const rawUnit = row[BARANG_MASUK_TEMPLATE_HEADERS[7]];
          const rawOperator = row[BARANG_MASUK_TEMPLATE_HEADERS[8]];
          const rawLocationName = row[BARANG_MASUK_TEMPLATE_HEADERS[9]];
          const rawHpp = row[BARANG_MASUK_TEMPLATE_HEADERS[10]];

          // Validation
          if (!rawSku || !rawQty || !rawLocationName || !rawSupplier) {
            failCount++;
            errorDetails.push(`Baris ${i + 2}: Kolom wajib (SKU, QTY, Lokasi, Supplier) tidak boleh kosong.`);
            continue;
          }

          onProgress(`Memproses transaksi ${i + 1}/${rows.length}: SKU ${rawSku}...`);

          // Find product
          const product = existingProducts.find(p => p.kode_barang && p.kode_barang.toLowerCase() === String(rawSku).trim().toLowerCase());
          if (!product) {
            failCount++;
            errorDetails.push(`Baris ${i + 2}: SKU "${rawSku}" tidak ditemukan di master barang.`);
            continue;
          }

          // Find location
          const location = existingLocations.find(l => l.nama_lokasi.toLowerCase() === String(rawLocationName).trim().toLowerCase());
          if (!location) {
            failCount++;
            errorDetails.push(`Baris ${i + 2}: Lokasi "${rawLocationName}" tidak ditemukan.`);
            continue;
          }

          const parsedDate = parseExcelDate(rawDate);
          
          const payload = {
            tanggal: parsedDate,
            tipe_nota: rawTipe ? String(rawTipe).trim() : 'Dari Supplier/Pembelian',
            nama_supplier: String(rawSupplier).trim(),
            nomor_nota: rawNota ? String(rawNota).trim() : '',
            keterangan: rawNote ? String(rawNote).trim() : '',
            produk_id: product.id,
            qty_masuk: parseInt(rawQty) || 0,
            satuan: rawUnit ? String(rawUnit).trim() : product.satuan || 'psg',
            operator: rawOperator ? String(rawOperator).trim() : '',
            lokasi_id: location.id,
            hpp: parseFloat(rawHpp) || product.harga_hpp || 0
          };

          const { error } = await supabase.from('barang_masuk').insert([payload]);
          if (error) {
            failCount++;
            errorDetails.push(`Baris ${i + 2} (${product.nama_barang}): ${error.message}`);
          } else {
            successCount++;
          }
        }

        resolve({ success: successCount, failed: failCount, errors: errorDetails });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

// ==========================================
// 3. BARANG KELUAR EXCEL UTILITIES
// ==========================================

export const BARANG_KELUAR_TEMPLATE_HEADERS = [
  'Tanggal (DD/MM/YYYY)*',
  'Tipe Nota*',
  'Nama Langganan',
  'No Nota',
  'Keterangan',
  'SKU Barang*',
  'QTY Keluar*',
  'Satuan*',
  'Operator*',
  'Lokasi Pengambilan*',
  'HPP Pokok*',
  'Sumber Penjualan*'
];

export function downloadBarangKeluarTemplate() {
  const sampleData = [
    {
      [BARANG_KELUAR_TEMPLATE_HEADERS[0]]: '31/01/2026',
      [BARANG_KELUAR_TEMPLATE_HEADERS[1]]: 'Dari Penjualan',
      [BARANG_KELUAR_TEMPLATE_HEADERS[2]]: 'PENJUALAN MARKET PLACE',
      [BARANG_KELUAR_TEMPLATE_HEADERS[3]]: 'LAF-OUT-20260131-0001',
      [BARANG_KELUAR_TEMPLATE_HEADERS[4]]: '-',
      [BARANG_KELUAR_TEMPLATE_HEADERS[5]]: 'LAF-SHOE-0001',
      [BARANG_KELUAR_TEMPLATE_HEADERS[6]]: 1,
      [BARANG_KELUAR_TEMPLATE_HEADERS[7]]: 'psg',
      [BARANG_KELUAR_TEMPLATE_HEADERS[8]]: 'TYA - BUSDEV',
      [BARANG_KELUAR_TEMPLATE_HEADERS[9]]: 'TOKO',
      [BARANG_KELUAR_TEMPLATE_HEADERS[10]]: 63240,
      [BARANG_KELUAR_TEMPLATE_HEADERS[11]]: 'Website'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: BARANG_KELUAR_TEMPLATE_HEADERS });
  worksheet['!cols'] = BARANG_KELUAR_TEMPLATE_HEADERS.map(h => ({ wch: Math.max(h.length, 18) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Barang Keluar Template');
  XLSX.writeFile(workbook, 'laf_barang_keluar_import_template.xlsx');
}

export async function importBarangKeluarFromExcel(file, existingProducts, existingLocations, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet);

        if (rows.length === 0) {
          throw new Error('File Excel kosong atau format tidak cocok.');
        }

        onProgress(`Menemukan ${rows.length} baris transaksi keluar. Memproses...`);
        let successCount = 0;
        let failCount = 0;
        let errorDetails = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rawDate = row[BARANG_KELUAR_TEMPLATE_HEADERS[0]];
          const rawTipe = row[BARANG_KELUAR_TEMPLATE_HEADERS[1]];
          const rawCustomer = row[BARANG_KELUAR_TEMPLATE_HEADERS[2]];
          const rawNota = row[BARANG_KELUAR_TEMPLATE_HEADERS[3]];
          const rawNote = row[BARANG_KELUAR_TEMPLATE_HEADERS[4]];
          const rawSku = row[BARANG_KELUAR_TEMPLATE_HEADERS[5]];
          const rawQty = row[BARANG_KELUAR_TEMPLATE_HEADERS[6]];
          const rawUnit = row[BARANG_KELUAR_TEMPLATE_HEADERS[7]];
          const rawOperator = row[BARANG_KELUAR_TEMPLATE_HEADERS[8]];
          const rawLocationName = row[BARANG_KELUAR_TEMPLATE_HEADERS[9]];
          const rawHpp = row[BARANG_KELUAR_TEMPLATE_HEADERS[10]];
          const rawSource = row[BARANG_KELUAR_TEMPLATE_HEADERS[11]];

          // Validation
          if (!rawSku || !rawQty || !rawLocationName) {
            failCount++;
            errorDetails.push(`Baris ${i + 2}: Kolom wajib (SKU, QTY, Lokasi) tidak boleh kosong.`);
            continue;
          }

          onProgress(`Memproses transaksi ${i + 1}/${rows.length}: SKU ${rawSku}...`);

          // Find product
          const product = existingProducts.find(p => p.kode_barang && p.kode_barang.toLowerCase() === String(rawSku).trim().toLowerCase());
          if (!product) {
            failCount++;
            errorDetails.push(`Baris ${i + 2}: SKU "${rawSku}" tidak ditemukan di master barang.`);
            continue;
          }

          // Find location
          const location = existingLocations.find(l => l.nama_lokasi.toLowerCase() === String(rawLocationName).trim().toLowerCase());
          if (!location) {
            failCount++;
            errorDetails.push(`Baris ${i + 2}: Lokasi "${rawLocationName}" tidak ditemukan.`);
            continue;
          }

          const parsedDate = parseExcelDate(rawDate);
          
          const payload = {
            tanggal: parsedDate,
            tipe_nota: rawTipe ? String(rawTipe).trim() : 'Dari Penjualan',
            nama_pelanggan: rawCustomer ? String(rawCustomer).trim() : 'Umum',
            nomor_nota: rawNota ? String(rawNota).trim() : '',
            keterangan: rawNote ? String(rawNote).trim() : '',
            produk_id: product.id,
            qty_keluar: parseInt(rawQty) || 0,
            satuan: rawUnit ? String(rawUnit).trim() : product.satuan || 'psg',
            operator: rawOperator ? String(rawOperator).trim() : '',
            lokasi_pengambilan_id: location.id,
            hpp: parseFloat(rawHpp) || product.harga_hpp || 0,
            sumber_penjualan: rawSource ? String(rawSource).trim() : 'Website'
          };

          const { error } = await supabase.from('barang_keluar').insert([payload]);
          if (error) {
            failCount++;
            errorDetails.push(`Baris ${i + 2} (${product.nama_barang}): ${error.message}`);
          } else {
            successCount++;
          }
        }

        resolve({ success: successCount, failed: failCount, errors: errorDetails });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}
