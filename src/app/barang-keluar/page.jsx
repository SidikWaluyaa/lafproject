'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { filterDataByDateRange, calculateKPIs, formatRupiah } from '@/utils/dataUtils';
import { yieldToMainThread } from '@/utils/performance';
import { downloadBarangKeluarTemplate, importBarangKeluarFromExcel } from '@/utils/excelImport';
import { Plus, Search, Loader2, AlertCircle, ShoppingBag, Edit2, Trash2, ShieldAlert } from 'lucide-react';
import Modal from '@/components/Modal';
import DateRangePicker from '@/components/DateRangePicker';
import styles from './barang-keluar.module.css';

export default function BarangKeluar() {
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [barangMasuk, setBarangMasuk] = useState([]);
  const [barangKeluarRaw, setBarangKeluarRaw] = useState([]);

  // Date filter states
  const todayStr = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(thirtyDaysAgoStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  // Excel import state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');

  const handleExcelImportBK = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    e.target.value = ''; // Reset input

    setImporting(true);
    setImportProgress('Membaca file Excel...');
    
    try {
      const result = await importBarangKeluarFromExcel(
        file, 
        products, 
        locations, 
        (progress) => setImportProgress(progress)
      );
      
      let msg = `Import Selesai!\nBerhasil: ${result.success} transaksi\nGagal: ${result.failed}`;
      if (result.errors.length > 0) {
        msg += `\n\nDetail Error:\n` + result.errors.slice(0, 5).join('\n') + (result.errors.length > 5 ? '\n...dan lainnya' : '');
      }
      alert(msg);
      
      fetchData();
    } catch (err) {
      alert('Gagal mengimpor file Excel: ' + err.message);
    } finally {
      setImporting(false);
      setImportProgress('');
    }
  };
  
  // Autocomplete states
  const [productQuery, setProductQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const comboboxRef = useRef(null);
  
  // Form states
  const [formValues, setFormValues] = useState({
    tanggal: todayStr,
    tipe_nota: 'Dari Penjualan',
    nama_pelanggan: '',
    nomor_nota: '',
    sumber_penjualan: 'Website',
    operator: '',
    produk_id: '',
    qty_keluar: 1,
    satuan: '',
    lokasi_pengambilan_id: '',
    hpp: 0,
    keterangan: ''
  });

  const [availableStock, setAvailableStock] = useState(0);
  const [stockWarning, setStockWarning] = useState(false);
  const [isInvoiceManuallyEdited, setIsInvoiceManuallyEdited] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Get products
      const { data: prodData } = await supabase.from('products').select('*').order('nama_barang');
      setProducts(prodData || []);

      // Get locations
      const { data: locData } = await supabase.from('locations').select('*').order('nama_lokasi');
      setLocations(locData || []);

      // Get stock data for in-memory validation
      const { data: bmData } = await supabase.from('barang_masuk').select('*');
      setBarangMasuk(bmData || []);

      const { data: bkRaw } = await supabase.from('barang_keluar').select('*');
      setBarangKeluarRaw(bkRaw || []);

      // Get outgoing logs with details
      const { data: outgoingData } = await supabase
        .from('barang_keluar')
        .select('*, products(nama_barang, kode_barang, satuan), locations(nama_lokasi)')
        .order('tanggal', { ascending: false })
        .order('created_at', { ascending: false });
      setHistory(outgoingData || []);
    } catch (err) {
      console.error('Error fetching outgoing transaction data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const channel = supabase.channel('barang-keluar-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        fetchData();
      })
      .subscribe();

    // Click outside suggestions box logic
    const handleClickOutside = (e) => {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target)) {
        setShowSuggestions(false);
        setFocusedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Compute stock levels
  const kpis = calculateKPIs(products, barangMasuk, barangKeluarRaw, locations);

  // Monitor stock availability for current product, location and quantity
  useEffect(() => {
    if (formValues.produk_id && formValues.lokasi_pengambilan_id) {
      let stock = kpis.stockByProductAndLocation[formValues.produk_id]?.[formValues.lokasi_pengambilan_id] || 0;
      
      // Jika sedang mengedit transaksi, tambahkan kembali qty transaksi ini agar tidak salah hitung (double subtraction)
      if (selectedTransaction && 
          formValues.produk_id === selectedTransaction.produk_id && 
          formValues.lokasi_pengambilan_id === selectedTransaction.lokasi_pengambilan_id) {
        stock += selectedTransaction.qty_keluar;
      }
      
      setAvailableStock(stock);
      setStockWarning(formValues.qty_keluar > stock);
    } else {
      setAvailableStock(0);
      setStockWarning(false);
    }
  }, [formValues.produk_id, formValues.lokasi_pengambilan_id, formValues.qty_keluar, kpis.stockByProductAndLocation, selectedTransaction]);

  // Invoice number generator
  const generateInvoiceNumber = (date, currentHistory) => {
    if (!date) return '';
    const cleanDate = date.replace(/-/g, '');
    const todayTransactions = currentHistory.filter(item => item.tanggal === date);
    const count = todayTransactions.length;
    const sequence = String(count + 1).padStart(4, '0');
    return `LAF-OUT-${cleanDate}-${sequence}`;
  };

  // Set default form values on modal open
  useEffect(() => {
    if (isAddModalOpen) {
      const autoInvoice = generateInvoiceNumber(todayStr, history);
      setIsInvoiceManuallyEdited(false);
      const savedOperator = localStorage.getItem('laf_operator') || '';
      setFormValues({
        tanggal: todayStr,
        tipe_nota: 'Dari Penjualan',
        nama_pelanggan: '',
        nomor_nota: autoInvoice,
        sumber_penjualan: 'Website',
        operator: savedOperator,
        produk_id: '',
        qty_keluar: 1,
        satuan: '',
        lokasi_pengambilan_id: locations[0]?.id || '',
        hpp: 0,
        keterangan: ''
      });
      setProductQuery('');
      setShowSuggestions(false);
      setFocusedIndex(-1);
    }
  }, [isAddModalOpen, locations, history]);

  const handleDateChange = (date) => {
    setFormValues(prev => {
      const updated = { ...prev, tanggal: date };
      if (!isInvoiceManuallyEdited) {
        updated.nomor_nota = generateInvoiceNumber(date, history);
      }
      return updated;
    });
  };

  const handleSelectProduct = (p) => {
    setProductQuery(`[${p.kode_barang || 'AUTO-GEN'}] ${p.nama_barang} (${p.variasi_barang || 'No Variant'})`);
    setFormValues(prev => ({
      ...prev,
      produk_id: p.id,
      satuan: p.satuan || 'psg',
      hpp: p.harga_hpp || 0,
      lokasi_pengambilan_id: p.lokasi_default_id || locations[0]?.id || ''
    }));
    setShowSuggestions(false);
    setFocusedIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setShowSuggestions(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => 
        prev < productSuggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => 
        prev > 0 ? prev - 1 : productSuggestions.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < productSuggestions.length) {
        handleSelectProduct(productSuggestions[focusedIndex]);
      } else if (productSuggestions.length > 0) {
        handleSelectProduct(productSuggestions[0]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setFocusedIndex(-1);
    }
  };

  const productSuggestions = products.filter(p => {
    const query = productQuery.toLowerCase();
    return (
      p.nama_barang.toLowerCase().includes(query) ||
      (p.kode_barang && p.kode_barang.toLowerCase().includes(query)) ||
      (p.variasi_barang && p.variasi_barang.toLowerCase().includes(query))
    );
  });

  const handleProductChange = (productId) => {
    const selectedProd = products.find(p => p.id === productId);
    if (selectedProd) {
      setFormValues(prev => ({
        ...prev,
        produk_id: productId,
        satuan: selectedProd.satuan || 'psg',
        hpp: selectedProd.harga_hpp || 0,
        lokasi_pengambilan_id: selectedProd.lokasi_default_id || locations[0]?.id || ''
      }));
    } else {
      setFormValues(prev => ({
        ...prev,
        produk_id: productId
      }));
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'nomor_nota') {
      setIsInvoiceManuallyEdited(value !== '');
    }
    setFormValues(prev => ({
      ...prev,
      [name]: name === 'qty_keluar' ? parseInt(value) || 0 : name === 'hpp' ? parseFloat(value) || 0 : value
    }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (formValues.qty_keluar <= 0) {
      alert('Kuantitas keluar harus lebih besar dari 0.');
      return;
    }

    if (stockWarning) {
      alert('Transaksi ditolak: Stok produk tidak mencukupi di lokasi tersebut.');
      return;
    }

    setSubmitLoading(true);
    try {
      if (formValues.operator) {
        localStorage.setItem('laf_operator', formValues.operator);
      }

      const { error } = await supabase.from('barang_keluar').insert([formValues]);
      if (error) throw error;

      setIsAddModalOpen(false);
      fetchData();
    } catch (err) {
      alert('Error memasukkan barang keluar: ' + err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleEditClick = (item) => {
    setSelectedTransaction(item);
    setFormValues({
      tanggal: item.tanggal,
      tipe_nota: item.tipe_nota || 'Dari Penjualan',
      nama_pelanggan: item.nama_pelanggan || '',
      nomor_nota: item.nomor_nota || '',
      sumber_penjualan: item.sumber_penjualan || 'Website',
      operator: item.operator || '',
      produk_id: item.produk_id,
      qty_keluar: item.qty_keluar,
      satuan: item.satuan,
      lokasi_pengambilan_id: item.lokasi_pengambilan_id,
      hpp: item.hpp || 0,
      keterangan: item.keterangan || ''
    });
    setProductQuery(item.products ? `[${item.products.kode_barang || 'AUTO-GEN'}] ${item.products.nama_barang} (${item.products.variasi_barang || 'No Variant'})` : '');
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (formValues.qty_keluar <= 0) {
      alert('Kuantitas keluar harus lebih besar dari 0.');
      return;
    }

    if (stockWarning) {
      alert('Transaksi ditolak: Stok produk tidak mencukupi di lokasi tersebut.');
      return;
    }

    setSubmitLoading(true);
    try {
      // 1. Update barang_keluar
      const { error } = await supabase
        .from('barang_keluar')
        .update(formValues)
        .eq('id', selectedTransaction.id);
      if (error) throw error;

      // 2. Update stock_logs
      await supabase
        .from('stock_logs')
        .update({
          produk_id: formValues.produk_id,
          qty: formValues.qty_keluar,
          lokasi_id: formValues.lokasi_pengambilan_id
        })
        .eq('ref_id', selectedTransaction.id);

      setIsEditModalOpen(false);
      fetchData();
    } catch (err) {
      alert('Error memperbarui transaksi: ' + err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteClick = (item) => {
    setSelectedTransaction(item);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setSubmitLoading(true);
    try {
      // 1. Delete from stock_logs
      await supabase
        .from('stock_logs')
        .delete()
        .eq('ref_id', selectedTransaction.id);

      // 2. Delete from barang_keluar
      const { error } = await supabase
        .from('barang_keluar')
        .delete()
        .eq('id', selectedTransaction.id);
      if (error) throw error;

      setIsDeleteModalOpen(false);
      fetchData();
    } catch (err) {
      alert('Error menghapus transaksi: ' + err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  // Filter history
  const filteredHistory = filterDataByDateRange(history, startDate, endDate).filter(item => {
    const pName = item.products?.nama_barang || '';
    const pSku = item.products?.kode_barang || '';
    const matchesSearch = 
      pName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pSku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.nama_pelanggan && item.nama_pelanggan.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.nomor_nota && item.nomor_nota.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.keterangan && item.keterangan.toLowerCase().includes(searchTerm.toLowerCase()));
    
    return matchesSearch;
  });

  return (
    <div className={styles.container}>
      {/* Top Filter actions bar */}
      <div className={styles.topActions}>
        <div className={styles.filters}>
          <div style={{ position: 'relative', flexGrow: 1, display: 'flex', alignItems: 'center' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-light)' }} />
            <input 
              type="text" 
              placeholder="Cari transaksi berdasarkan nama produk, SKU, pelanggan, nota..."
              className={styles.searchInput}
              style={{ paddingLeft: '36px' }}
              value={searchTerm}
              onChange={(e) => {
                const val = e.target.value;
                yieldToMainThread(() => setSearchTerm(val));
              }}
            />
          </div>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChange={(start, end) => {
              yieldToMainThread(() => {
                setStartDate(start);
                setEndDate(end);
              });
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => yieldToMainThread(downloadBarangKeluarTemplate)}
            title="Download Template Excel"
          >
            Template Excel
          </button>
          
          <button 
            className="btn btn-secondary" 
            style={{ backgroundColor: 'var(--accent-brown)', color: '#FFFFFF', border: 'none' }}
            onClick={() => document.getElementById('excelFileInputBK').click()}
            title="Import Excel"
          >
            Import Excel
          </button>
          <input 
            type="file" 
            id="excelFileInputBK"
            accept=".xlsx, .xls, .csv"
            style={{ display: 'none' }}
            onChange={handleExcelImportBK}
          />
          
          <button className="btn btn-primary" onClick={() => yieldToMainThread(() => setIsAddModalOpen(true))}>
            <Plus size={16} /> Input Barang Keluar
          </button>
        </div>
      </div>

      {/* History Table */}
      {loading ? (
        <div className={styles.loadingState}>
          <Loader2 className="spinner" size={24} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ marginLeft: '12px', color: 'var(--text-secondary)' }}>Memuat riwayat transaksi...</span>
        </div>
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>SKU</th>
                <th>Nama Barang</th>
                <th>Qty Keluar</th>
                <th>Lokasi Pengambilan</th>
                <th>Sumber / Tipe</th>
                <th>Nota / Pelanggan</th>
                <th>Harga HPP</th>
                <th>Total HPP</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-light)', padding: '30px' }}>
                    Tidak ada catatan transaksi keluar pada periode ini.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: '500' }}>
                      {new Date(item.tanggal).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td>
                      <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>
                        {item.products?.kode_barang || '-'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                      {item.products?.nama_barang || 'Produk Terhapus'}
                    </td>
                    <td style={{ color: 'var(--danger)', fontWeight: '700' }}>
                      -{item.qty_keluar} {item.satuan}
                    </td>
                    <td>
                      <span className="badge badge-secondary">
                        {item.locations?.nama_lokasi || 'N/A'}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-primary" style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                        <ShoppingBag size={10} />
                        {item.sumber_penjualan || 'Website'}
                      </span>
                      <div className={styles.infoBadge} style={{ margin: '4px 0 0 0' }}>{item.tipe_nota}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{item.nomor_nota || '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-light)' }}>{item.nama_pelanggan || 'Umum'}</div>
                    </td>
                    <td>{formatRupiah(item.hpp)}</td>
                    <td style={{ fontWeight: '600' }}>{formatRupiah(item.hpp * item.qty_keluar)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '6px 8px', minWidth: 'auto' }}
                          onClick={() => handleEditClick(item)}
                          title="Edit Transaksi"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '6px 8px', minWidth: 'auto', color: 'var(--danger)' }}
                          onClick={() => handleDeleteClick(item)}
                          title="Hapus Transaksi"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Input Barang Keluar */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Input Penjualan / Barang Keluar"
      >
        <form onSubmit={handleFormSubmit}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Tanggal Transaksi*</label>
              <input 
                type="date" 
                name="tanggal"
                className="input-field" 
                required
                value={formValues.tanggal}
                onChange={(e) => handleDateChange(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Sumber Penjualan*</label>
              <select
                name="sumber_penjualan"
                className="input-field"
                required
                value={formValues.sumber_penjualan}
                onChange={handleInputChange}
              >
                <option value="Website">Website</option>
                <option value="Shopee">Shopee</option>
                <option value="Tokopedia">Tokopedia</option>
                <option value="TikTok Shop">TikTok Shop</option>
                <option value="Offline Store">Offline Store</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Tipe Nota*</label>
              <select
                name="tipe_nota"
                className="input-field"
                required
                value={formValues.tipe_nota}
                onChange={handleInputChange}
              >
                <option value="Dari Penjualan">Dari Penjualan</option>
                <option value="Manual">Manual</option>
                <option value="Retur">Retur</option>
                <option value="Gift / Event">Gift / Event</option>
                <option value="Stock Adjustment">Penyesuaian Stok (Koreksi)</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Nomor Nota / Order ID</label>
              <input 
                type="text" 
                name="nomor_nota"
                placeholder="E.g., INV/2026/001"
                className="input-field"
                value={formValues.nomor_nota}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Nama Pelanggan</label>
              <input 
                type="text" 
                name="nama_pelanggan"
                placeholder="Nama Pembeli (opsional)"
                className="input-field"
                value={formValues.nama_pelanggan}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Data dimasukkan oleh*</label>
              <input 
                type="text" 
                name="operator"
                placeholder="Nama Operator (e.g. TYA - BUSDEV)"
                className="input-field"
                required
                value={formValues.operator}
                onChange={handleInputChange}
              />
            </div>

            <div className={styles.formGroupFull} ref={comboboxRef} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
              <label className={styles.label}>Pilih Produk*</label>
              <div className={styles.comboboxContainer}>
                <input 
                  type="text"
                  placeholder="Ketik untuk mencari produk (SKU / nama / variasi)..."
                  className="input-field"
                  style={{ paddingRight: '36px' }}
                  value={productQuery}
                  onFocus={(e) => {
                    e.target.select();
                    setShowSuggestions(true);
                  }}
                  onChange={(e) => {
                    setProductQuery(e.target.value);
                    setFormValues(prev => ({ ...prev, produk_id: '' })); // Reset until selected
                    setShowSuggestions(true);
                    setFocusedIndex(-1);
                  }}
                  onKeyDown={handleKeyDown}
                  required={!formValues.produk_id}
                />
                {formValues.produk_id && (
                  <button 
                    type="button" 
                    className={styles.selectionResetBtn}
                    onClick={() => {
                      setProductQuery('');
                      setFormValues(prev => ({ ...prev, produk_id: '' }));
                    }}
                  >
                    ✕
                  </button>
                )}
                
                {showSuggestions && productSuggestions.length > 0 && (
                  <div className={styles.suggestionsList}>
                    {productSuggestions.map((p, index) => {
                      const stock = kpis.stockByProductAndLocation[p.id]?.[formValues.lokasi_pengambilan_id] || 0;
                      return (
                        <div 
                          key={p.id}
                          className={`${styles.suggestionItem} ${index === focusedIndex ? styles.suggestionItemActive : ''}`}
                          onClick={() => handleSelectProduct(p)}
                        >
                          <div className={styles.suggestionLeft}>
                            <span className={styles.suggestionName}>{p.nama_barang}</span>
                            <span className={styles.suggestionSku}>{p.kode_barang || 'AUTO-GEN'} | {p.variasi_barang || 'No Variant'}</span>
                          </div>
                          <span 
                            className={styles.suggestionStock} 
                            style={{ color: stock === 0 ? 'var(--danger)' : stock < 5 ? 'var(--warning)' : 'var(--success)' }}
                          >
                            Stok: {stock} {p.satuan}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Lokasi Pengambilan*</label>
              <select
                name="lokasi_pengambilan_id"
                className="input-field"
                required
                value={formValues.lokasi_pengambilan_id}
                onChange={handleInputChange}
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.nama_lokasi}</option>
                ))}
              </select>
              {formValues.produk_id && formValues.lokasi_pengambilan_id && (
                <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px' }}>
                  Stok Tersedia: <strong style={{ color: availableStock === 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{availableStock} psg</strong>
                </div>
              )}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Qty Keluar*</label>
              <input 
                type="number" 
                name="qty_keluar"
                className="input-field"
                required
                min="1"
                value={formValues.qty_keluar}
                onChange={handleInputChange}
              />
            </div>

            {stockWarning && (
              <div className={styles.stockAlert}>
                <AlertCircle size={16} />
                <span>
                  <strong>Stok tidak mencukupi!</strong> Maksimal stok di lokasi ini adalah {availableStock} psg.
                </span>
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.label}>Harga HPP Pokok (Rp)*</label>
              <input 
                type="number" 
                name="hpp"
                className="input-field"
                required
                min="0"
                value={formValues.hpp}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Satuan</label>
              <input 
                type="text" 
                name="satuan"
                className="input-field"
                disabled
                value={formValues.satuan}
              />
            </div>

            <div className={styles.formGroupFull}>
              <label className={styles.label}>Keterangan / Notes</label>
              <textarea
                name="keterangan"
                placeholder="Tambahkan catatan jika diperlukan (misal: pengiriman kurir Sicepat, retur dll)"
                className="input-field"
                style={{ minHeight: '60px', resize: 'vertical' }}
                value={formValues.keterangan}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className={styles.formActions}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)}>
              Batal
            </button>
            <button 
              type="submit" 
              className="btn btn-accent" 
              disabled={submitLoading || stockWarning || !formValues.produk_id}
            >
              {submitLoading ? 'Menyimpan...' : 'Simpan Transaksi'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Edit Barang Keluar */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Catatan Barang Keluar"
      >
        <form onSubmit={handleEditSubmit}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Tanggal Transaksi*</label>
              <input 
                type="date" 
                name="tanggal"
                className="input-field" 
                required
                value={formValues.tanggal}
                onChange={(e) => handleDateChange(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Sumber Penjualan*</label>
              <select
                name="sumber_penjualan"
                className="input-field"
                required
                value={formValues.sumber_penjualan}
                onChange={handleInputChange}
              >
                <option value="Website">Website</option>
                <option value="Shopee">Shopee</option>
                <option value="Tokopedia">Tokopedia</option>
                <option value="TikTok Shop">TikTok Shop</option>
                <option value="Offline Store">Offline Store</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Tipe Nota*</label>
              <select
                name="tipe_nota"
                className="input-field"
                required
                value={formValues.tipe_nota}
                onChange={handleInputChange}
              >
                <option value="Dari Penjualan">Dari Penjualan</option>
                <option value="Manual">Manual</option>
                <option value="Retur">Retur</option>
                <option value="Gift / Event">Gift / Event</option>
                <option value="Stock Adjustment">Penyesuaian Stok (Koreksi)</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Nomor Nota / Order ID</label>
              <input 
                type="text" 
                name="nomor_nota"
                className="input-field"
                value={formValues.nomor_nota}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Nama Pelanggan</label>
              <input 
                type="text" 
                name="nama_pelanggan"
                className="input-field"
                value={formValues.nama_pelanggan}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Data dimasukkan oleh*</label>
              <input 
                type="text" 
                name="operator"
                className="input-field"
                required
                value={formValues.operator}
                onChange={handleInputChange}
              />
            </div>

            <div className={styles.formGroupFull} ref={comboboxRef} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
              <label className={styles.label}>Pilih Produk*</label>
              <div className={styles.comboboxContainer}>
                <input 
                  type="text"
                  placeholder="Ketik untuk mencari produk (SKU / nama / variasi)..."
                  className="input-field"
                  style={{ paddingRight: '36px' }}
                  value={productQuery}
                  onFocus={(e) => {
                    e.target.select();
                    setShowSuggestions(true);
                  }}
                  onChange={(e) => {
                    setProductQuery(e.target.value);
                    setFormValues(prev => ({ ...prev, produk_id: '' }));
                    setShowSuggestions(true);
                    setFocusedIndex(-1);
                  }}
                  onKeyDown={handleKeyDown}
                  required={!formValues.produk_id}
                />
                {formValues.produk_id && (
                  <button 
                    type="button" 
                    className={styles.selectionResetBtn}
                    onClick={() => {
                      setProductQuery('');
                      setFormValues(prev => ({ ...prev, produk_id: '' }));
                    }}
                  >
                    ✕
                  </button>
                )}
                
                {showSuggestions && productSuggestions.length > 0 && (
                  <div className={styles.suggestionsList}>
                    {productSuggestions.map((p, index) => {
                      const stock = kpis.stockByProductAndLocation[p.id]?.[formValues.lokasi_pengambilan_id] || 0;
                      return (
                        <div 
                          key={p.id}
                          className={`${styles.suggestionItem} ${index === focusedIndex ? styles.suggestionItemActive : ''}`}
                          onClick={() => handleSelectProduct(p)}
                        >
                          <div className={styles.suggestionLeft}>
                            <span className={styles.suggestionName}>{p.nama_barang}</span>
                            <span className={styles.suggestionSku}>{p.kode_barang || 'AUTO-GEN'} | {p.variasi_barang || 'No Variant'}</span>
                          </div>
                          <span className="badge badge-primary">{p.satuan}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Lokasi Pengambilan*</label>
              <select
                name="lokasi_pengambilan_id"
                className="input-field"
                required
                value={formValues.lokasi_pengambilan_id}
                onChange={handleInputChange}
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.nama_lokasi}</option>
                ))}
              </select>
              {formValues.produk_id && formValues.lokasi_pengambilan_id && (
                <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px' }}>
                  Stok Tersedia: <strong style={{ color: availableStock === 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{availableStock} psg</strong>
                </div>
              )}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Qty Keluar*</label>
              <input 
                type="number" 
                name="qty_keluar"
                className="input-field"
                required
                min="1"
                value={formValues.qty_keluar}
                onChange={handleInputChange}
              />
            </div>

            {stockWarning && (
              <div className={styles.stockAlert}>
                <AlertCircle size={16} />
                <span>
                  <strong>Stok tidak mencukupi!</strong> Maksimal stok di lokasi ini adalah {availableStock} psg.
                </span>
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.label}>Harga HPP Pokok (Rp)*</label>
              <input 
                type="number" 
                name="hpp"
                className="input-field"
                required
                min="0"
                value={formValues.hpp}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Satuan</label>
              <input 
                type="text" 
                name="satuan"
                className="input-field"
                disabled
                value={formValues.satuan}
              />
            </div>

            <div className={styles.formGroupFull}>
              <label className={styles.label}>Keterangan / Notes</label>
              <textarea
                name="keterangan"
                className="input-field"
                style={{ minHeight: '60px', resize: 'vertical' }}
                value={formValues.keterangan}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className={styles.formActions}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsEditModalOpen(false)}>
              Batal
            </button>
            <button 
              type="submit" 
              className="btn btn-accent" 
              disabled={submitLoading || stockWarning || !formValues.produk_id}
            >
              {submitLoading ? 'Memperbarui...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Hapus Barang Keluar */}
      <Modal 
        isOpen={isDeleteModalOpen} 
        onClose={() => setIsDeleteModalOpen(false)} 
        title="Hapus Transaksi Barang Keluar"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            <ShieldAlert size={36} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <div>
              <p style={{ fontWeight: '600', fontSize: '15px', color: 'var(--text-primary)', marginBottom: '6px' }}>
                Apakah Anda yakin ingin menghapus catatan transaksi ini?
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Menghapus pengeluaran barang keluar untuk <strong>{selectedTransaction?.products?.nama_barang}</strong> secara permanen akan memulihkan saldo stok di lokasi tersebut. Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
          </div>
          
          <div className={styles.formActions}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsDeleteModalOpen(false)}>
              Batal
            </button>
            <button type="button" className="btn btn-danger" onClick={handleDeleteConfirm} disabled={submitLoading}>
              {submitLoading ? 'Menghapus...' : 'Ya, Hapus Transaksi'}
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
