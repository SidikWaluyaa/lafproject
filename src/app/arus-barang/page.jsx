'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  calculateKPIs, 
  getProductFlowData 
} from '@/utils/dataUtils';
import { yieldToMainThread } from '@/utils/performance';
import { 
  ArrowLeftRight,
  AlertTriangle,
  RefreshCw,
  Database,
  Calendar
} from 'lucide-react';
import DateRangePicker from '@/components/DateRangePicker';
import styles from './arus-barang.module.css';

export default function ArusBarangPage() {
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [data, setData] = useState({
    products: [],
    locations: [],
    barangMasuk: [],
    barangKeluar: [],
  });

  // Date range state (defaults to last 30 days)
  const todayStr = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(thirtyDaysAgoStr);
  const [endDate, setEndDate] = useState(todayStr);

  const fetchData = async () => {
    setLoading(true);
    setDbError(null);
    try {
      // Fetch locations
      const { data: locations, error: locError } = await supabase.from('locations').select('*');
      if (locError) throw locError;

      // Fetch products
      const { data: products, error: prodError } = await supabase.from('products').select('*');
      if (prodError) throw prodError;

      // Fetch barang_masuk
      const { data: barangMasuk, error: bmError } = await supabase.from('barang_masuk').select('*');
      if (bmError) throw bmError;

      // Fetch barang_keluar
      const { data: barangKeluar, error: bkError } = await supabase.from('barang_keluar').select('*');
      if (bkError) throw bkError;

      setData({
        products: products || [],
        locations: locations || [],
        barangMasuk: barangMasuk || [],
        barangKeluar: barangKeluar || [],
      });
    } catch (err) {
      console.error('Error loading database:', err);
      if (err.message?.includes('does not exist') || err.code === '42P01') {
        setDbError('TABLES_MISSING');
      } else {
        setDbError(err.message || 'Gagal memuat data dari Supabase.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Setup realtime subscription
    const channel = supabase.channel('arus-barang-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className={styles.loadingWrapper}>
        <div className={styles.spinner}></div>
        <p style={{ color: 'var(--text-secondary)' }}>Menghubungkan ke Supabase dan memproses data...</p>
      </div>
    );
  }

  if (dbError === 'TABLES_MISSING') {
    return (
      <div className={styles.errorWrapper}>
        <Database size={48} className={styles.spinner} style={{ animation: 'none', border: 'none', borderRadius: '0' }} />
        <h2 className={styles.errorTitle}>Skema Database Belum Siap</h2>
        <p className={styles.errorText}>
          Tabel-tabel database belum terbentuk di Supabase. Silakan jalankan script migrasi di SQL Editor.
        </p>
        <button className="btn btn-primary" onClick={() => yieldToMainThread(fetchData)}>
          <RefreshCw size={16} /> Hubungkan Ulang
        </button>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className={styles.errorWrapper}>
        <AlertTriangle size={48} style={{ color: 'var(--danger)', marginBottom: '20px' }} />
        <h2 className={styles.errorTitle}>Koneksi Gagal</h2>
        <p className={styles.errorText}>{dbError}</p>
        <button className="btn btn-primary" onClick={() => yieldToMainThread(fetchData)}>
          <RefreshCw size={16} /> Coba Lagi
        </button>
      </div>
    );
  }

  // Pre-calculate stock map using total data
  const kpis = calculateKPIs(
    data.products, 
    data.barangMasuk, 
    data.barangKeluar, 
    data.locations,
    5
  );

  // Compute top restocked and top sold lists
  const { mostRestocked, mostSold } = getProductFlowData(
    data.products,
    data.barangMasuk,
    data.barangKeluar,
    data.locations,
    startDate,
    endDate,
    kpis.stockByProductAndLocation
  );

  return (
    <div className={styles.container}>
      {/* Date Filter Bar */}
      <div className={styles.filterBar}>
        <div className={styles.filterLeft}>
          <span className={styles.filterTitle}>
            <Calendar size={18} style={{ color: 'var(--accent-laf)', marginRight: '8px' }} />
            Filter Arus Barang
          </span>
          <span className={styles.filterSubtitle}>Tentukan periode analisis untuk melacak volume barang masuk & keluar</span>
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

      {/* Main Flow Grid Layout */}
      <div className={styles.flowGrid}>
        {/* Panel 1: Barang paling banyak di Re-Stok (Masuk) */}
        <div className={styles.flowPanel}>
          <div className={`${styles.flowHeader} ${styles.headerCyan}`}>
            <h2 className={styles.flowPanelTitle}>
              Barang paling banyak di Re-Stok
            </h2>
            <p className={styles.flowPanelSubtitle}>
              Melihat arus barang diurutkan dari paling banyak Masuk
            </p>
          </div>
          
          <div className="table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
            {mostRestocked.length === 0 ? (
              <div className={styles.emptyState}>
                <p>Tidak ada transaksi masuk dalam rentang tanggal ini.</p>
              </div>
            ) : (
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Nama Barang</th>
                    <th style={{ textAlign: 'right' }}>Stok Paling Banyak Masuk</th>
                    <th style={{ textAlign: 'right' }}>Stok-nya terkini</th>
                  </tr>
                </thead>
                <tbody>
                  {mostRestocked.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{item.nama_barang}</td>
                      <td style={{ textAlign: 'right', fontWeight: '700', color: '#00A896' }}>
                        +{item.totalMasuk} {item.satuan}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '500' }}>
                        {item.currentStock} {item.satuan}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Panel 2: Barang Paling Laris / paling banyak Keluar */}
        <div className={styles.flowPanel}>
          <div className={`${styles.flowHeader} ${styles.headerRed}`}>
            <h2 className={styles.flowPanelTitle}>
              Barang Paling Laris / paling banyak Keluar
            </h2>
            <p className={styles.flowPanelSubtitle}>
              Melihat arus barang diurutkan dari paling banyak Keluar
            </p>
          </div>
          
          <div className="table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
            {mostSold.length === 0 ? (
              <div className={styles.emptyState}>
                <p>Tidak ada transaksi keluar dalam rentang tanggal ini.</p>
              </div>
            ) : (
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Nama Barang</th>
                    <th style={{ textAlign: 'right' }}>Stok Paling Banyak Keluar</th>
                    <th style={{ textAlign: 'right' }}>Stok-nya terkini</th>
                  </tr>
                </thead>
                <tbody>
                  {mostSold.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{item.nama_barang}</td>
                      <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--danger)' }}>
                        -{item.totalKeluar} {item.satuan}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '500' }}>
                        {item.currentStock} {item.satuan}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
