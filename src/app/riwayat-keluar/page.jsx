'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { yieldToMainThread } from '@/utils/performance';
import { formatRupiah } from '@/utils/dataUtils';
import { Loader2, Search, Download, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import DateRangePicker from '@/components/DateRangePicker';
import styles from './riwayat-keluar.module.css';

export default function RiwayatKeluar() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [locations, setLocations] = useState([]);
  
  // Filter states
  const todayStr = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(thirtyDaysAgoStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('ALL'); // 'ALL' or location UUID

  const fetchData = async () => {
    setLoading(true);
    try {
      // Get locations
      const { data: locData } = await supabase.from('locations').select('*').order('nama_lokasi');
      setLocations(locData || []);

      // Get outgoing transactions with joined fields
      const { data: outgoingData } = await supabase
        .from('barang_keluar')
        .select('*, products(nama_barang, kode_barang, variasi_barang, satuan), locations:lokasi_pengambilan_id(nama_lokasi)')
        .order('tanggal', { ascending: false })
        .order('created_at', { ascending: false });
      setHistory(outgoingData || []);
    } catch (err) {
      console.error('Error fetching outgoing history data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const channel = supabase.channel('barang-keluar-history-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filter logic
  const filteredHistory = history.filter(item => {
    // 1. Date filter
    if (startDate && item.tanggal < startDate) return false;
    if (endDate && item.tanggal > endDate) return false;

    // 2. Location filter
    if (selectedLocationId !== 'ALL' && item.lokasi_pengambilan_id !== selectedLocationId) return false;

    // 3. Text search filter
    const pName = item.products?.nama_barang || '';
    const pSku = item.products?.kode_barang || '';
    const pVar = item.products?.variasi_barang || '';
    const customer = item.nama_pelanggan || '';
    const nota = item.nomor_nota || '';
    const note = item.keterangan || '';
    const operator = item.operator || '';
    const tipe = item.tipe_nota || '';

    const query = searchTerm.toLowerCase();
    const matchesSearch = 
      pName.toLowerCase().includes(query) ||
      pSku.toLowerCase().includes(query) ||
      pVar.toLowerCase().includes(query) ||
      customer.toLowerCase().includes(query) ||
      nota.toLowerCase().includes(query) ||
      note.toLowerCase().includes(query) ||
      operator.toLowerCase().includes(query) ||
      tipe.toLowerCase().includes(query);

    return matchesSearch;
  });

  // Calculate dynamic summary
  const totalQty = filteredHistory.reduce((sum, item) => sum + (item.qty_keluar || 0), 0);
  const totalHppValue = filteredHistory.reduce((sum, item) => sum + ((item.hpp || 0) * (item.qty_keluar || 0)), 0);

  // Double click handlers
  const handleDateDoubleClick = (date) => {
    yieldToMainThread(() => {
      setStartDate(date);
      setEndDate(date);
    });
  };

  const handleLocationDoubleClick = (locId) => {
    yieldToMainThread(() => {
      setSelectedLocationId(locId);
    });
  };

  // Export to Multi-sheet Excel
  const handleExportExcel = () => {
    // Format list function
    const formatRows = (list) => {
      return list.map((item, idx) => ({
        'No': idx + 1,
        'Tanggal': new Date(item.tanggal).toLocaleDateString('id-ID'),
        'Tipe Nota': item.tipe_nota || '',
        'Nama Langganan': item.nama_pelanggan || '',
        'No Nota': item.nomor_nota || '',
        'Keterangan Tambahan': item.keterangan || '',
        'Produk': `[${item.products?.kode_barang || '-'}] ${item.products?.nama_barang || ''} (${item.products?.variasi_barang || 'No Variant'})`,
        'QTY Keluar': item.qty_keluar || 0,
        'Satuan': item.satuan || 'psg',
        'Data dimasukkan oleh': item.operator || '',
        'Lokasi pengambilan': item.locations?.nama_lokasi || '',
        'HPP': item.hpp || 0,
        'Hpp x QTY': (item.hpp || 0) * (item.qty_keluar || 0)
      }));
    };

    const wb = XLSX.utils.book_new();

    // Sheet 1: ALL
    const allData = formatRows(filteredHistory);
    const wsAll = XLSX.utils.json_to_sheet(allData);
    XLSX.utils.book_append_sheet(wb, wsAll, 'SEMUA LOKASI');

    // Add sheets for each location
    locations.forEach(loc => {
      const locFiltered = filteredHistory.filter(item => item.lokasi_pengambilan_id === loc.id);
      const locData = formatRows(locFiltered);
      const wsLoc = XLSX.utils.json_to_sheet(locData);
      XLSX.utils.book_append_sheet(wb, wsLoc, loc.nama_lokasi.toUpperCase());
    });

    // Save workbook
    const dateRangeStr = `${startDate.replace(/-/g, '')}_to_${endDate.replace(/-/g, '')}`;
    XLSX.writeFile(wb, `LAF_Riwayat_Keluar_${dateRangeStr}.xlsx`);
  };

  return (
    <div className={styles.container}>
      {/* Header bar */}
      <div className={styles.headerBanner}>
        <Link href="/barang-keluar" className={styles.backBtn}>
          <ArrowLeft size={18} />
        </Link>
        <h1 className={styles.headerTitle}>Riwayat Keluar / Tanggal</h1>
      </div>

      {/* Dynamic Summary Cards */}
      <div className={styles.summaryContainer}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Total QTY Keluar</span>
          <span className={styles.summaryValue}>{totalQty.toLocaleString('id-ID')} psg</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Total Nilai HPP Keluar</span>
          <span className={styles.summaryValue} style={{ color: 'var(--danger)' }}>
            {formatRupiah(totalHppValue)}
          </span>
        </div>
      </div>

      {/* Filter and Action bar */}
      <div className={styles.filterBar}>
        {/* Location Pills Tabs */}
        <div className={styles.locationTabs}>
          <button 
            className={`${styles.tabBtn} ${selectedLocationId === 'ALL' ? styles.tabBtnActive : ''}`}
            onClick={() => setSelectedLocationId('ALL')}
          >
            Semua Lokasi
          </button>
          {locations.map(loc => (
            <button 
              key={loc.id} 
              className={`${styles.tabBtn} ${selectedLocationId === loc.id ? styles.tabBtnActive : ''}`}
              onClick={() => setSelectedLocationId(loc.id)}
            >
              {loc.nama_lokasi}
            </button>
          ))}
        </div>

        <div className={styles.searchAndDates}>
          <div className={styles.searchContainer}>
            <Search size={16} className={styles.searchIcon} />
            <input 
              type="text" 
              placeholder="Cari pelanggan, SKU, produk, operator, nota..."
              className={styles.searchInput}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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

          <button className="btn btn-secondary" onClick={handleExportExcel} style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
            <Download size={16} /> Ekspor Excel
          </button>
        </div>
      </div>

      {/* Main Table view */}
      {loading ? (
        <div className={styles.loadingState}>
          <Loader2 className="spinner" size={24} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ marginLeft: '12px', color: 'var(--text-secondary)' }}>Memuat riwayat transaksi...</span>
        </div>
      ) : (
        <div className="table-container" style={{ borderTop: '4px solid var(--danger)' }}>
          <table className="custom-table">
            <thead>
              <tr style={{ backgroundColor: 'rgba(211, 47, 47, 0.08)' }}>
                <th>Tanggal</th>
                <th>Tipe Nota</th>
                <th>Nama Langganan</th>
                <th>No Nota</th>
                <th>Keterangan Tambahan</th>
                <th>Produk</th>
                <th style={{ textAlign: 'right' }}>QTY Keluar</th>
                <th>Satuan</th>
                <th>Data di Masukan Oleh</th>
                <th>Lokasi pengambilan</th>
                <th style={{ textAlign: 'right' }}>HPP</th>
                <th style={{ textAlign: 'right' }}>Hpp x QTY</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', color: 'var(--text-light)', padding: '40px 10px' }}>
                    Tidak ada catatan riwayat keluar yang cocok dengan penyaringan ini.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => (
                  <tr key={item.id} className={styles.tableRow}>
                    <td 
                      onDoubleClick={() => handleDateDoubleClick(item.tanggal)}
                      className={styles.clickableCell}
                      title="Klik ganda untuk memfilter tanggal ini"
                      style={{ fontWeight: '500' }}
                    >
                      {new Date(item.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </td>
                    <td>
                      <span className="badge badge-secondary">{item.tipe_nota || 'Dari Penjualan'}</span>
                    </td>
                    <td style={{ fontWeight: '500' }}>{item.nama_pelanggan || 'Umum'}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: '600' }}>{item.nomor_nota || '-'}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-light)' }}>{item.keterangan || '-'}</td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                      <div style={{ fontWeight: '600' }}>{item.products?.nama_barang || 'Produk Terhapus'}</div>
                      <div className={styles.subText}>{item.products?.kode_barang} | {item.products?.variasi_barang || 'No Variant'}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--danger)' }}>
                      -{item.qty_keluar}
                    </td>
                    <td>{item.satuan || 'psg'}</td>
                    <td style={{ color: 'var(--text-light)', fontSize: '13px' }}>{item.operator || '-'}</td>
                    <td 
                      onDoubleClick={() => handleLocationDoubleClick(item.lokasi_pengambilan_id)}
                      className={styles.clickableCell}
                      title="Klik ganda untuk memfilter lokasi ini"
                    >
                      <span className="badge badge-primary">{item.locations?.nama_lokasi || 'N/A'}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatRupiah(item.hpp || 0)}</td>
                    <td style={{ textAlign: 'right', fontWeight: '600', fontFamily: 'monospace' }}>
                      {formatRupiah((item.hpp || 0) * (item.qty_keluar || 0))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
