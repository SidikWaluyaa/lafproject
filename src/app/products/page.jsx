'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calculateKPIs, formatRupiah } from '@/utils/dataUtils';
import { yieldToMainThread } from '@/utils/performance';
import { downloadExcelTemplate, importProductsFromExcel } from '@/utils/excelImport';
import { Plus, Search, Edit2, Trash2, ShieldAlert, Loader2 } from 'lucide-react';
import Modal from '@/components/Modal';
import styles from './products.module.css';

export default function Products() {
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [barangMasuk, setBarangMasuk] = useState([]);
  const [barangKeluar, setBarangKeluar] = useState([]);
  
  // Excel import state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  // Form states
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [formValues, setFormValues] = useState({
    nama_produk: '',
    nama_barang: '',
    category_id: '',
    kode_barang: '',
    variasi_barang: '',
    satuan: 'psg',
    harga_hpp: 0,
    lokasi_default_id: '',
    stok_minimum: 5
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: catData } = await supabase.from('categories').select('*').order('nama_kategori');
      setCategories(catData || []);

      const { data: locData } = await supabase.from('locations').select('*').order('nama_lokasi');
      setLocations(locData || []);

      const { data: prodData } = await supabase.from('products').select('*, categories(nama_kategori)');
      setProducts(prodData || []);

      const { data: bmData } = await supabase.from('barang_masuk').select('*');
      setBarangMasuk(bmData || []);

      const { data: bkData } = await supabase.from('barang_keluar').select('*');
      setBarangKeluar(bkData || []);
    } catch (err) {
      console.error('Error loading products page data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExcelImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    e.target.value = ''; // Reset file input

    setImporting(true);
    setImportProgress('Membaca file Excel...');
    
    try {
      const result = await importProductsFromExcel(
        file, 
        locations, 
        categories, 
        (progress) => setImportProgress(progress)
      );
      
      alert(`Import Selesai!\nBerhasil diimpor: ${result.success} produk\nBaris dilewati: ${result.skipped} (karena nama kosong/error)`);
      
      fetchData();
    } catch (err) {
      alert('Gagal mengimpor file Excel: ' + err.message);
    } finally {
      setImporting(false);
      setImportProgress('');
    }
  };

  useEffect(() => {
    fetchData();

    // Subscribe to public changes to reload
    const channel = supabase.channel('products-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Set default category and location on modal open if blank
  useEffect(() => {
    if (isAddModalOpen) {
      setFormValues({
        nama_produk: '',
        nama_barang: '',
        category_id: categories[0]?.id || '',
        kode_barang: '',
        variasi_barang: '',
        satuan: 'psg',
        harga_hpp: 0,
        lokasi_default_id: locations[0]?.id || '',
        stok_minimum: 5
      });
    }
  }, [isAddModalOpen, categories, locations]);

  // Compute stock levels
  const kpis = calculateKPIs(products, barangMasuk, barangKeluar, locations);

  // Filtered Products
  const filteredProducts = products.filter(p => {
    const matchesSearch = 
      p.nama_barang.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.nama_produk.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.kode_barang && p.kode_barang.toLowerCase().includes(searchTerm.toLowerCase()));
      
    const matchesCategory = selectedCategory === '' || p.category_id === selectedCategory;
    
    let productTotalStock = 0;
    locations.forEach(loc => {
      productTotalStock += kpis.stockByProductAndLocation[p.id]?.[loc.id] || 0;
    });

    const minLimit = p.stok_minimum !== undefined ? p.stok_minimum : 5;
    const matchesLowStock = !filterLowStockOnly || productTotalStock < minLimit;
    
    return matchesSearch && matchesCategory && matchesLowStock;
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormValues(prev => ({
      ...prev,
      [name]: name === 'harga_hpp' ? parseFloat(value) || 0 : name === 'stok_minimum' ? parseInt(value) || 0 : value
    }));
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setSubmitLoading(true);
    try {
      const payload = { ...formValues };
      // If code barang is empty, remove it to let trigger auto-generate
      if (!payload.kode_barang) {
        delete payload.kode_barang;
      }

      const { error } = await supabase.from('products').insert([payload]);
      if (error) throw error;
      
      setIsAddModalOpen(false);
      fetchData();
    } catch (err) {
      alert('Error menambahkan produk: ' + err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleEditClick = (p) => {
    setSelectedProduct(p);
    setFormValues({
      nama_produk: p.nama_produk,
      nama_barang: p.nama_barang,
      category_id: p.category_id,
      kode_barang: p.kode_barang || '',
      variasi_barang: p.variasi_barang || '',
      satuan: p.satuan,
      harga_hpp: p.harga_hpp,
      lokasi_default_id: p.lokasi_default_id || '',
      stok_minimum: p.stok_minimum !== undefined ? p.stok_minimum : 5
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setSubmitLoading(true);
    try {
      const { error } = await supabase
        .from('products')
        .update(formValues)
        .eq('id', selectedProduct.id);
        
      if (error) throw error;
      
      setIsEditModalOpen(false);
      fetchData();
    } catch (err) {
      alert('Error mengedit produk: ' + err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteClick = (p) => {
    setSelectedProduct(p);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setSubmitLoading(true);
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', selectedProduct.id);
        
      if (error) throw error;
      
      setIsDeleteModalOpen(false);
      fetchData();
    } catch (err) {
      alert('Error menghapus produk: ' + err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* KPI Cards Summary */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Total SKU Produk</span>
          <span className={styles.kpiValue}>{products.length}</span>
        </div>
        <div 
          className={`${styles.kpiCard} ${styles.kpiCardAlert} ${filterLowStockOnly ? styles.kpiCardActive : ''}`}
          onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
          style={{ cursor: 'pointer' }}
          title="Klik untuk menyaring produk yang menipis"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div>
              <span className={styles.kpiLabel}>Produk Butuh Restock</span>
              <span className={styles.kpiValue} style={{ color: 'var(--danger)', display: 'block', marginTop: '4px' }}>
                {products.filter(p => {
                  let totalStock = 0;
                  locations.forEach(loc => {
                    totalStock += kpis.stockByProductAndLocation[p.id]?.[loc.id] || 0;
                  });
                  return totalStock < (p.stok_minimum !== undefined ? p.stok_minimum : 5);
                }).length}
              </span>
            </div>
            {filterLowStockOnly && (
              <span className="badge badge-danger" style={{ fontSize: '11px', alignSelf: 'flex-start' }}>Filter Aktif</span>
            )}
          </div>
        </div>
      </div>

      {/* Top Search & Filter Bar */}
      <div className={styles.topActions}>
        <div className={styles.searchFilters}>
          <div style={{ position: 'relative', flexGrow: 2, display: 'flex', alignItems: 'center' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-light)' }} />
            <input 
              type="text" 
              placeholder="Cari produk berdasarkan nama atau SKU..."
              className={styles.searchInput}
              style={{ paddingLeft: '36px' }}
              value={searchTerm}
              onChange={(e) => {
                const val = e.target.value;
                yieldToMainThread(() => setSearchTerm(val));
              }}
            />
          </div>
          <select 
            className={styles.filterSelect}
            value={selectedCategory}
            onChange={(e) => {
              const val = e.target.value;
              yieldToMainThread(() => setSelectedCategory(val));
            }}
          >
            <option value="">Semua Kategori</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.nama_kategori}</option>
            ))}
          </select>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => yieldToMainThread(downloadExcelTemplate)}
            title="Download Template Excel"
          >
            Template Excel
          </button>
          
          <button 
            className="btn btn-secondary" 
            style={{ backgroundColor: 'var(--accent-brown)', color: '#FFFFFF', border: 'none' }}
            onClick={() => document.getElementById('excelFileInput').click()}
            title="Import Excel"
          >
            Import Excel
          </button>
          <input 
            type="file" 
            id="excelFileInput"
            accept=".xlsx, .xls, .csv"
            style={{ display: 'none' }}
            onChange={handleExcelImport}
          />
          
          <button className="btn btn-primary" onClick={() => yieldToMainThread(() => setIsAddModalOpen(true))}>
            <Plus size={16} /> Tambah Produk
          </button>
        </div>
      </div>

      {/* Main Stock Grid Table */}
      {loading ? (
        <div className={styles.loadingState}>
          <Loader2 className="spinner" size={24} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ marginLeft: '12px', color: 'var(--text-secondary)' }}>Memuat master barang...</span>
        </div>
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>SKU / Kode</th>
                <th>Nama Produk (Group)</th>
                <th>Nama Barang</th>
                <th>Kategori</th>
                <th>Variasi</th>
                <th>Harga HPP</th>
                {locations.map(loc => (
                  <th key={loc.id}>Stok {loc.nama_lokasi}</th>
                ))}
                <th>Total Stok</th>
                <th>Stok Minimum</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={9 + locations.length} style={{ textAlign: 'center', color: 'var(--text-light)', padding: '30px' }}>
                    Tidak ada produk ditemukan.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  let productTotalStock = 0;
                  const locStocks = locations.map(loc => {
                    const stock = kpis.stockByProductAndLocation[p.id]?.[loc.id] || 0;
                    productTotalStock += stock;
                    return { id: loc.id, stock };
                  });

                  const isLowStock = productTotalStock < (p.stok_minimum !== undefined ? p.stok_minimum : 5);

                  return (
                    <tr key={p.id} className={isLowStock ? styles.lowStockRow : ''}>
                      <td>
                        <span className={styles.skuText}>
                          {p.kode_barang || 'AUTO-GEN'}
                        </span>
                      </td>
                      <td style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{p.nama_produk}</td>
                      <td>{p.nama_barang}</td>
                      <td>
                        <span className="badge badge-primary">
                          {p.categories?.nama_kategori || 'General'}
                        </span>
                      </td>
                      <td>{p.variasi_barang || '-'}</td>
                      <td>{formatRupiah(p.harga_hpp)}</td>
                      {locStocks.map(ls => (
                        <td key={ls.id} style={{ fontWeight: '600' }}>
                          {ls.stock} {p.satuan}
                        </td>
                      ))}
                      <td>
                        {isLowStock ? (
                          <span className={styles.lowStockBadge} title="Stok berada di bawah batas minimum">
                            ⚠️ {productTotalStock} {p.satuan}
                          </span>
                        ) : (
                          <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                            {productTotalStock} {p.satuan}
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: '600', color: isLowStock ? 'var(--danger)' : 'var(--text-secondary)' }}>
                        {p.stok_minimum !== undefined ? p.stok_minimum : 5} {p.satuan}
                      </td>
                      <td>
                        <div className={styles.actionsCell}>
                          <button 
                            className={`${styles.iconBtn} ${styles.editBtn}`}
                            onClick={() => yieldToMainThread(() => handleEditClick(p))}
                            title="Edit Produk"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            className={`${styles.iconBtn} ${styles.deleteBtn}`}
                            onClick={() => yieldToMainThread(() => handleDeleteClick(p))}
                            title="Hapus Produk"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Tambah Produk */}
      <Modal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        title="Tambah Produk Baru"
      >
        <form onSubmit={handleAddSubmit}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Nama Produk (Group)*</label>
              <input 
                type="text" 
                name="nama_produk"
                placeholder="E.g., Supernova Shoes"
                className="input-field" 
                required
                value={formValues.nama_produk}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Nama Barang (Spesifik)*</label>
              <input 
                type="text" 
                name="nama_barang"
                placeholder="E.g., Sepatu Supernova Classic"
                className="input-field" 
                required
                value={formValues.nama_barang}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Kategori*</label>
              <select 
                name="category_id"
                className="input-field" 
                required
                value={formValues.category_id}
                onChange={handleInputChange}
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.nama_kategori}</option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Kode Barang / SKU (Opsional)</label>
              <input 
                type="text" 
                name="kode_barang"
                placeholder="Biarkan kosong untuk auto-gen"
                className="input-field" 
                value={formValues.kode_barang}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Variasi (Size/Warna)</label>
              <input 
                type="text" 
                name="variasi_barang"
                placeholder="E.g., Black / 42"
                className="input-field" 
                value={formValues.variasi_barang}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Satuan*</label>
              <input 
                type="text" 
                name="satuan"
                className="input-field" 
                required
                value={formValues.satuan}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Harga HPP (Rp)*</label>
              <input 
                type="number" 
                name="harga_hpp"
                className="input-field" 
                required
                min="0"
                value={formValues.harga_hpp}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Lokasi Default</label>
              <select 
                name="lokasi_default_id"
                className="input-field" 
                value={formValues.lokasi_default_id}
                onChange={handleInputChange}
              >
                <option value="">Pilih Lokasi</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.nama_lokasi}</option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Stok Minimum*</label>
              <input 
                type="number" 
                name="stok_minimum"
                className="input-field" 
                required
                min="0"
                value={formValues.stok_minimum}
                onChange={handleInputChange}
              />
            </div>
          </div>
          <div className={styles.formActions}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)}>
              Batal
            </button>
            <button type="submit" className="btn btn-accent" disabled={submitLoading}>
              {submitLoading ? 'Menyimpan...' : 'Simpan Produk'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Edit Produk */}
      <Modal 
        isOpen={isEditModalOpen} 
        onClose={() => setIsEditModalOpen(false)} 
        title="Edit Detail Produk"
      >
        <form onSubmit={handleEditSubmit}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Nama Produk (Group)*</label>
              <input 
                type="text" 
                name="nama_produk"
                className="input-field" 
                required
                value={formValues.nama_produk}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Nama Barang (Spesifik)*</label>
              <input 
                type="text" 
                name="nama_barang"
                className="input-field" 
                required
                value={formValues.nama_barang}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Kategori*</label>
              <select 
                name="category_id"
                className="input-field" 
                required
                value={formValues.category_id}
                onChange={handleInputChange}
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.nama_kategori}</option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Kode Barang / SKU*</label>
              <input 
                type="text" 
                name="kode_barang"
                className="input-field" 
                required
                disabled
                value={formValues.kode_barang}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Variasi (Size/Warna)</label>
              <input 
                type="text" 
                name="variasi_barang"
                className="input-field" 
                value={formValues.variasi_barang}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Satuan*</label>
              <input 
                type="text" 
                name="satuan"
                className="input-field" 
                required
                value={formValues.satuan}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Harga HPP (Rp)*</label>
              <input 
                type="number" 
                name="harga_hpp"
                className="input-field" 
                required
                min="0"
                value={formValues.harga_hpp}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Lokasi Default</label>
              <select 
                name="lokasi_default_id"
                className="input-field" 
                value={formValues.lokasi_default_id}
                onChange={handleInputChange}
              >
                <option value="">Pilih Lokasi</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.nama_lokasi}</option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Stok Minimum*</label>
              <input 
                type="number" 
                name="stok_minimum"
                className="input-field" 
                required
                min="0"
                value={formValues.stok_minimum}
                onChange={handleInputChange}
              />
            </div>
          </div>
          <div className={styles.formActions}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsEditModalOpen(false)}>
              Batal
            </button>
            <button type="submit" className="btn btn-accent" disabled={submitLoading}>
              {submitLoading ? 'Memperbarui...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Hapus Produk */}
      <Modal 
        isOpen={isDeleteModalOpen} 
        onClose={() => setIsDeleteModalOpen(false)} 
        title="Hapus Produk"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            <ShieldAlert size={36} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <div>
              <p style={{ fontWeight: '600', fontSize: '15px', color: 'var(--text-primary)', marginBottom: '6px' }}>
                Apakah Anda yakin ingin menghapus produk ini?
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Menghapus produk <strong>{selectedProduct?.nama_barang}</strong> ({selectedProduct?.kode_barang}) akan menghapus seluruh data histori barang masuk & keluar yang terkait secara permanen.
              </p>
            </div>
          </div>
          
          <div className={styles.formActions}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsDeleteModalOpen(false)}>
              Batal
            </button>
            <button type="button" className="btn btn-danger" onClick={handleDeleteConfirm} disabled={submitLoading}>
              {submitLoading ? 'Menghapus...' : 'Ya, Hapus Permanen'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Excel Import Loading Overlay */}
      {importing && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyItems: 'center',
          justifyContent: 'center', alignContent: 'center',
          zIndex: 9999
        }}>
          <div className="card-glass" style={{ 
            padding: '32px', maxWidth: '420px', width: '90%', textAlign: 'center', 
            backgroundColor: 'var(--bg-primary)', display: 'flex', flexDirection: 'column',
            alignItems: 'center'
          }}>
            <Loader2 className="spinner" size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: '16px', color: 'var(--accent-laf)' }} />
            <h3 style={{ fontFamily: 'Outfit', fontSize: '18px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-primary)' }}>Mengimpor Data Excel</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>{importProgress}</p>
          </div>
        </div>
      )}
    </div>
  );
}
