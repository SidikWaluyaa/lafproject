'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { filterDataByDateRange } from '@/utils/dataUtils';
import { yieldToMainThread } from '@/utils/performance';
import { downloadBarangMasukTemplate, importBarangMasukFromExcel } from '@/utils/excelImport';
import { Plus, Search, FileText, Loader2, Edit2, Trash2, ShieldAlert } from 'lucide-react';
import Modal from '@/components/Modal';
import DateRangePicker from '@/components/DateRangePicker';
import styles from './barang-masuk.module.css';

export default function BarangMasuk() {
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);

  // Date filter states
  const todayStr = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(thirtyDaysAgoStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [searchTerm, setSearchTerm] = useState('');
  const [isInvoiceManuallyEdited, setIsInvoiceManuallyEdited] = useState(false);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  
  // Excel import state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');

  const handleExcelImportBM = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    e.target.value = ''; // Reset input

    setImporting(true);
    setImportProgress('Membaca file Excel...');
    
    try {
      const result = await importBarangMasukFromExcel(
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
    tipe_nota: 'Dari Supplier/Pembelian',
    nama_supplier: '',
    nomor_nota: '',
    operator: '',
    produk_id: '',
    qty_masuk: 1,
    satuan: '',
    lokasi_id: '',
    hpp: 0,
    keterangan: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      // Get products
      const { data: prodData } = await supabase.from('products').select('*').order('nama_barang');
      setProducts(prodData || []);

      // Get locations
      const { data: locData } = await supabase.from('locations').select('*').order('nama_lokasi');
      setLocations(locData || []);

      // Get incoming logs
      const { data: incomingData } = await supabase
        .from('barang_masuk')
        .select('*, products(nama_barang, kode_barang, satuan), locations(nama_lokasi)')
        .order('tanggal', { ascending: false })
        .order('created_at', { ascending: false });
      setHistory(incomingData || []);
    } catch (err) {
      console.error('Error fetching incoming transaction data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const channel = supabase.channel('barang-masuk-realtime')
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

  // When adding, autofill fields when product is selected
  const handleProductChange = (productId) => {
    const selectedProd = products.find(p => p.id === productId);
    if (selectedProd) {
      setFormValues(prev => ({
        ...prev,
        produk_id: productId,
        satuan: selectedProd.satuan || 'psg',
        lokasi_id: selectedProd.lokasi_default_id || locations[0]?.id || ''
      }));
    } else {
      setFormValues(prev => ({
        ...prev,
        produk_id: productId
      }));
    }
  };

  // Invoice number generator
  const generateInvoiceNumber = (date, currentHistory) => {
    if (!date) return '';
    const cleanDate = date.replace(/-/g, '');
    const todayTransactions = currentHistory.filter(item => item.tanggal === date);
    const count = todayTransactions.length;
    const sequence = String(count + 1).padStart(4, '0');
    return `LAF-IN-${cleanDate}-${sequence}`;
  };

  const handleDateChange = (date) => {
    setFormValues(prev => {
      const updated = { ...prev, tanggal: date };
      if (!isInvoiceManuallyEdited) {
        updated.nomor_nota = generateInvoiceNumber(date, history);
      }
      return updated;
    });
  };

  useEffect(() => {
    if (isAddModalOpen) {
      const autoInvoice = generateInvoiceNumber(todayStr, history);
      setIsInvoiceManuallyEdited(false);
      const savedOperator = localStorage.getItem('laf_operator') || '';
      setFormValues({
        tanggal: todayStr,
        tipe_nota: 'Dari Supplier/Pembelian',
        nama_supplier: '',
        nomor_nota: autoInvoice,
        operator: savedOperator,
        produk_id: '',
        qty_masuk: 1,
        satuan: '',
        lokasi_id: locations[0]?.id || '',
        hpp: 0,
        keterangan: ''
      });
      setProductQuery('');
      setShowSuggestions(false);
      setFocusedIndex(-1);
    }
  }, [isAddModalOpen, locations, history]);

  const handleSelectProduct = (p) => {
    setProductQuery(`[${p.kode_barang || 'AUTO-GEN'}] ${p.nama_barang} (${p.variasi_barang || 'No Variant'})`);
    setFormValues(prev => ({
      ...prev,
      produk_id: p.id,
      satuan: p.satuan || 'psg',
      hpp: p.harga_hpp || 0,
      lokasi_id: p.lokasi_default_id || locations[0]?.id || ''
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

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'nomor_nota') {
      setIsInvoiceManuallyEdited(value !== '');
    }
    setFormValues(prev => ({
      ...prev,
      [name]: name === 'qty_masuk' ? parseInt(value) || 0 : name === 'hpp' ? parseFloat(value) || 0 : value
    }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (formValues.qty_masuk <= 0) {
      alert('Kuantitas masuk harus lebih besar dari 0.');
      return;
    }

    setSubmitLoading(true);
    try {
      if (formValues.operator) {
        localStorage.setItem('laf_operator', formValues.operator);
      }
      
      const { error } = await supabase.from('barang_masuk').insert([formValues]);
      if (error) throw error;

      // Update HPP di tabel products (Stock Master) dengan HPP transaksi terbaru
      if (formValues.produk_id && formValues.hpp > 0) {
        await supabase
          .from('products')
          .update({ harga_hpp: formValues.hpp })
          .eq('id', formValues.produk_id);
      }

      setIsAddModalOpen(false);
      fetchData();
    } catch (err) {
      alert('Error memasukkan barang masuk: ' + err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleEditClick = (item) => {
    setSelectedTransaction(item);
    setFormValues({
      tanggal: item.tanggal,
      tipe_nota: item.tipe_nota || 'Dari Supplier/Pembelian',
      nama_supplier: item.nama_supplier || '',
      nomor_nota: item.nomor_nota || '',
      operator: item.operator || '',
      produk_id: item.produk_id,
      qty_masuk: item.qty_masuk,
      satuan: item.satuan,
      lokasi_id: item.lokasi_id,
      hpp: item.hpp || 0,
      keterangan: item.keterangan || ''
    });
    setProductQuery(item.products ? `[${item.products.kode_barang || 'AUTO-GEN'}] ${item.products.nama_barang} (${item.products.variasi_barang || 'No Variant'})` : '');
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (formValues.qty_masuk <= 0) {
      alert('Kuantitas masuk harus lebih besar dari 0.');
      return;
    }

    setSubmitLoading(true);
    try {
      // 1. Update barang_masuk
      const { error } = await supabase
        .from('barang_masuk')
        .update(formValues)
        .eq('id', selectedTransaction.id);
      if (error) throw error;

      // 2. Update stock_logs
      await supabase
        .from('stock_logs')
        .update({
          produk_id: formValues.produk_id,
          qty: formValues.qty_masuk,
          lokasi_id: formValues.lokasi_id
        })
        .eq('ref_id', selectedTransaction.id);

      // Update HPP di tabel products (Stock Master) dengan HPP transaksi terbaru
      if (formValues.produk_id && formValues.hpp > 0) {
        await supabase
          .from('products')
          .update({ harga_hpp: formValues.hpp })
          .eq('id', formValues.produk_id);
      }

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

      // 2. Delete from barang_masuk
      const { error } = await supabase
        .from('barang_masuk')
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
      (item.keterangan && item.keterangan.toLowerCase().includes(searchTerm.toLowerCase()));
    
    return matchesSearch;
  });

  return (
    <div className={styles.container}>
      {/* Top filter Actions */}
      <div className={styles.topActions}>
        <div className={styles.filters}>
          <div style={{ position: 'relative', flexGrow: 1, display: 'flex', alignItems: 'center' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-light)' }} />
            <input 
              type="text" 
              placeholder="Cari transaksi berdasarkan nama produk, SKU, atau keterangan..."
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
            onClick={() => yieldToMainThread(downloadBarangMasukTemplate)}
            title="Download Template Excel"
          >
            Template Excel
          </button>
          
          <button 
            className="btn btn-secondary" 
            style={{ backgroundColor: 'var(--accent-brown)', color: '#FFFFFF', border: 'none' }}
            onClick={() => document.getElementById('excelFileInputBM').click()}
            title="Import Excel"
          >
            Import Excel
          </button>
          <input 
            type="file" 
            id="excelFileInputBM"
            accept=".xlsx, .xls, .csv"
            style={{ display: 'none' }}
            onChange={handleExcelImportBM}
          />
          
          <button className="btn btn-primary" onClick={() => yieldToMainThread(() => setIsAddModalOpen(true))}>
            <Plus size={16} /> Input Barang Masuk
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
              <tr style={{ backgroundColor: 'rgba(255, 178, 44, 0.08)' }}>
                <th>Tanggal</th>
                <th>Tipe Nota</th>
                <th>Nama Supplier / Pengirim</th>
                <th>No Nota</th>
                <th>Keterangan</th>
                <th>Produk</th>
                <th style={{ textAlign: 'right' }}>Qty Masuk</th>
                <th>Satuan</th>
                <th>Data dimasukkan oleh</th>
                <th>Lokasi Penyimpanan</th>
                <th style={{ textAlign: 'right' }}>HPP</th>
                <th style={{ textAlign: 'right' }}>Total HPP</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', color: 'var(--text-light)', padding: '30px' }}>
                    Tidak ada catatan transaksi masuk pada periode ini.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: '500' }}>
                      {new Date(item.tanggal).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td>
                      <span className="badge badge-secondary">{item.tipe_nota || 'Dari Supplier/Pembelian'}</span>
                    </td>
                    <td style={{ fontWeight: '500' }}>{item.nama_supplier || '-'}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: '600' }}>{item.nomor_nota || '-'}</td>
                    <td style={{ fontSize: '13px', color: 'var(--text-light)' }}>{item.keterangan || '-'}</td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                      <div style={{ fontWeight: '600' }}>{item.products?.nama_barang || 'Produk Terhapus'}</div>
                      <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-light)' }}>
                        {item.products?.kode_barang} | {item.products?.variasi_barang || 'No Variant'}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--success)', fontWeight: '700' }}>
                      +{item.qty_masuk}
                    </td>
                    <td>{item.satuan || 'psg'}</td>
                    <td style={{ color: 'var(--text-light)', fontSize: '13px' }}>{item.operator || '-'}</td>
                    <td>
                      <span className="badge badge-primary">
                        {item.locations?.nama_lokasi || 'N/A'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(item.hpp || 0)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: '600', fontFamily: 'monospace' }}>
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format((item.hpp || 0) * (item.qty_masuk || 0))}
                    </td>
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

      {/* Modal Input Barang Masuk */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Input Barang Masuk (Restock)"
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
              <label className={styles.label}>Data dimasukkan oleh*</label>
              <input 
                type="text" 
                name="operator"
                placeholder="Nama Operator (e.g. GITTA - BUSDEV)"
                className="input-field"
                required
                value={formValues.operator}
                onChange={handleInputChange}
              />
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
                <option value="Dari Supplier/Pembelian">Dari Supplier/Pembelian</option>
                <option value="Manual">Manual</option>
                <option value="Retur">Retur</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Nomor Nota / PO</label>
              <input 
                type="text" 
                name="nomor_nota"
                placeholder="E.g., PO/2026/001"
                className="input-field"
                value={formValues.nomor_nota}
                onChange={handleInputChange}
              />
            </div>

            <div className={styles.formGroupFull}>
              <label className={styles.label}>Nama Supplier / Pengirim*</label>
              <input 
                type="text" 
                name="nama_supplier"
                placeholder="Nama Supplier / Pengirim (e.g. BUDI)"
                className="input-field"
                required
                value={formValues.nama_supplier}
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
                    {productSuggestions.map((p, index) => (
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
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Kuantitas Masuk*</label>
              <input 
                type="number" 
                name="qty_masuk"
                className="input-field"
                required
                min="1"
                value={formValues.qty_masuk}
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

            <div className={styles.formGroup}>
              <label className={styles.label}>Harga HPP Pokok Masuk (Rp)*</label>
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
              <label className={styles.label}>Lokasi Penyimpanan*</label>
              <select
                name="lokasi_id"
                className="input-field"
                required
                value={formValues.lokasi_id}
                onChange={handleInputChange}
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.nama_lokasi}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroupFull}>
              <label className={styles.label}>Keterangan / Notes</label>
              <textarea
                name="keterangan"
                placeholder="Tambahkan catatan jika diperlukan (misal: pengiriman dari vendor XYZ, retur, dll)"
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
            <button type="submit" className="btn btn-accent" disabled={submitLoading || !formValues.produk_id}>
              {submitLoading ? 'Menyimpan...' : 'Simpan Transaksi'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Edit Barang Masuk */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Catatan Barang Masuk"
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

            <div className={styles.formGroup}>
              <label className={styles.label}>Tipe Nota*</label>
              <select
                name="tipe_nota"
                className="input-field"
                required
                value={formValues.tipe_nota}
                onChange={handleInputChange}
              >
                <option value="Dari Supplier/Pembelian">Dari Supplier/Pembelian</option>
                <option value="Manual">Manual</option>
                <option value="Retur">Retur</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Nomor Nota / PO</label>
              <input 
                type="text" 
                name="nomor_nota"
                className="input-field"
                value={formValues.nomor_nota}
                onChange={handleInputChange}
              />
            </div>

            <div className={styles.formGroupFull}>
              <label className={styles.label}>Nama Supplier / Pengirim*</label>
              <input 
                type="text" 
                name="nama_supplier"
                className="input-field"
                required
                value={formValues.nama_supplier}
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
                    {productSuggestions.map((p, index) => (
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
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Kuantitas Masuk*</label>
              <input 
                type="number" 
                name="qty_masuk"
                className="input-field"
                required
                min="1"
                value={formValues.qty_masuk}
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

            <div className={styles.formGroup}>
              <label className={styles.label}>Harga HPP Pokok Masuk (Rp)*</label>
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
              <label className={styles.label}>Lokasi Penyimpanan*</label>
              <select
                name="lokasi_id"
                className="input-field"
                required
                value={formValues.lokasi_id}
                onChange={handleInputChange}
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.nama_lokasi}</option>
                ))}
              </select>
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
            <button type="submit" className="btn btn-accent" disabled={submitLoading || !formValues.produk_id}>
              {submitLoading ? 'Memperbarui...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Hapus Barang Masuk */}
      <Modal 
        isOpen={isDeleteModalOpen} 
        onClose={() => setIsDeleteModalOpen(false)} 
        title="Hapus Transaksi Barang Masuk"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            <ShieldAlert size={36} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <div>
              <p style={{ fontWeight: '600', fontSize: '15px', color: 'var(--text-primary)', marginBottom: '6px' }}>
                Apakah Anda yakin ingin menghapus catatan transaksi ini?
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Menghapus penerimaan barang masuk untuk <strong>{selectedTransaction?.products?.nama_barang}</strong> sejumlah {selectedTransaction?.qty_masuk} {selectedTransaction?.satuan} secara permanen akan mengurangi saldo stok dan memperbarui riwayat stok. Tindakan ini tidak dapat dibatalkan.
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
