'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  calculateKPIs, 
  filterDataByDateRange, 
  getTransactionTrendData, 
  formatRupiah 
} from '@/utils/dataUtils';
import { yieldToMainThread } from '@/utils/performance';
import { 
  Package, 
  Boxes, 
  AlertTriangle, 
  TrendingUp, 
  PieChart, 
  Database,
  RefreshCw,
  BarChart,
  Activity,
  DollarSign,
  TrendingDown,
  Truck,
  Users,
  Layers,
  ArrowRightLeft
} from 'lucide-react';
import dynamic from 'next/dynamic';
import DateRangePicker from '@/components/DateRangePicker';
import styles from './dashboard.module.css';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory', 'flow', 'supply'
  const [data, setData] = useState({
    products: [],
    locations: [],
    barangMasuk: [],
    barangKeluar: [],
    stockLogs: []
  });

  // Filter dates state
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
      const { data: locations, error: locError } = await supabase.from('locations').select('*');
      if (locError) throw locError;

      const { data: products, error: prodError } = await supabase.from('products').select('*, categories(nama_kategori)');
      if (prodError) throw prodError;

      const { data: barangMasuk, error: bmError } = await supabase.from('barang_masuk').select('*');
      if (bmError) throw bmError;

      const { data: barangKeluar, error: bkError } = await supabase.from('barang_keluar').select('*');
      if (bkError) throw bkError;

      const { data: stockLogs, error: logError } = await supabase.from('stock_logs').select('*');
      if (logError) throw logError;

      setData({
        products: products || [],
        locations: locations || [],
        barangMasuk: barangMasuk || [],
        barangKeluar: barangKeluar || [],
        stockLogs: stockLogs || []
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
    const channel = supabase.channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // MEMOIZED COMPUTATIONS (Data Analyst Grade)
  const analytics = useMemo(() => {
    if (data.products.length === 0) {
      return {
        kpis: { totalProducts: 0, totalStock: 0, lowStockCount: 0, locationBreakdown: {}, stockByProductAndLocation: {} },
        trends: { dates: [], masuk: [], keluar: [] },
        totalAssetValue: 0,
        categoryStock: {},
        categoryAsset: {},
        locationAsset: {},
        productAssetList: [],
        incomingPeriodVolume: 0,
        outgoingPeriodVolume: 0,
        incomingPeriodValue: 0,
        outgoingPeriodValue: 0,
        salesChannelVolume: {},
        supplierVolume: {},
        incomingNoteTypes: {},
        velocityList: [],
        criticalStockList: []
      };
    }

    // 1. Calculate base KPIs & location stock breakdown
    const kpis = calculateKPIs(
      data.products, 
      data.barangMasuk, 
      data.barangKeluar, 
      data.locations,
      5 // fallback threshold
    );

    // Override low stock count with product-specific safety stocks
    let lowStockCount = 0;
    data.products.forEach(p => {
      let currentStock = 0;
      data.locations.forEach(loc => {
        currentStock += (kpis.stockByProductAndLocation[p.id]?.[loc.id] || 0);
      });
      const thresholdVal = p.stok_minimum !== undefined && p.stok_minimum !== null ? p.stok_minimum : 5;
      if (currentStock < thresholdVal) {
        lowStockCount++;
      }
    });
    kpis.lowStockCount = lowStockCount;

    // 2. Filter transaction arrays based on current date range
    const filteredBM = filterDataByDateRange(data.barangMasuk, startDate, endDate);
    const filteredBK = filterDataByDateRange(data.barangKeluar, startDate, endDate);
    const trends = getTransactionTrendData(data.stockLogs, startDate, endDate);

    // 3. Asset Valuation Calculations (Current state as of today)
    let totalAssetValue = 0;
    const categoryStock = {};
    const categoryAsset = {};
    const locationAsset = {};
    
    data.locations.forEach(loc => {
      locationAsset[loc.nama_lokasi] = 0;
    });

    const productAssetList = data.products.map(p => {
      let currentStock = 0;
      const breakdown = {};
      data.locations.forEach(loc => {
        const qty = kpis.stockByProductAndLocation[p.id]?.[loc.id] || 0;
        currentStock += qty;
        breakdown[loc.nama_lokasi] = qty;
        locationAsset[loc.nama_lokasi] += qty * p.harga_hpp;
      });

      const assetValue = currentStock * p.harga_hpp;
      totalAssetValue += assetValue;

      const catName = p.categories?.nama_kategori || 'General';
      categoryStock[catName] = (categoryStock[catName] || 0) + currentStock;
      categoryAsset[catName] = (categoryAsset[catName] || 0) + assetValue;

      return {
        id: p.id,
        sku: p.kode_barang,
        name: p.nama_barang,
        variasi: p.variasi_barang,
        satuan: p.satuan,
        category: catName,
        hpp: p.harga_hpp,
        stock: currentStock,
        assetValue,
        breakdown
      };
    }).sort((a, b) => b.assetValue - a.assetValue);

    // 4. Period Transaction Volumes & Values
    let incomingPeriodVolume = 0;
    let incomingPeriodValue = 0;
    const supplierVolume = {};

    filteredBM.forEach(bm => {
      incomingPeriodVolume += bm.qty_masuk;
      // Use transactional HPP or fallback to product HPP
      const hppVal = bm.hpp && bm.hpp > 0 ? bm.hpp : (data.products.find(p => p.id === bm.produk_id)?.harga_hpp || 0);
      incomingPeriodValue += bm.qty_masuk * hppVal;

      const supplier = bm.nama_supplier || 'Supplier Umum';
      supplierVolume[supplier] = (supplierVolume[supplier] || 0) + bm.qty_masuk;
    });

    let outgoingPeriodVolume = 0;
    let outgoingPeriodValue = 0;
    const salesChannelVolume = {};
    const incomingNoteTypes = {};

    filteredBK.forEach(bk => {
      outgoingPeriodVolume += bk.qty_keluar;
      const hppVal = bk.hpp && bk.hpp > 0 ? bk.hpp : (data.products.find(p => p.id === bk.produk_id)?.harga_hpp || 0);
      outgoingPeriodValue += bk.qty_keluar * hppVal;

      const channel = bk.sumber_penjualan || 'Manual/Kasir';
      salesChannelVolume[channel] = (salesChannelVolume[channel] || 0) + bk.qty_keluar;

      const noteType = bk.tipe_nota || 'Manual';
      incomingNoteTypes[noteType] = (incomingNoteTypes[noteType] || 0) + bk.qty_keluar;
    });

    // 5. Product Velocity Calculations (Top 10 Flow)
    const velocityList = data.products.map(p => {
      const pm = filteredBM.filter(x => x.produk_id === p.id);
      const pk = filteredBK.filter(x => x.produk_id === p.id);

      const totalMasuk = pm.reduce((sum, item) => sum + item.qty_masuk, 0);
      const totalKeluar = pk.reduce((sum, item) => sum + item.qty_keluar, 0);
      const netFlow = totalMasuk - totalKeluar;
      
      let currentStock = 0;
      data.locations.forEach(loc => {
        currentStock += (kpis.stockByProductAndLocation[p.id]?.[loc.id] || 0);
      });

      return {
        sku: p.kode_barang,
        name: p.nama_barang,
        variasi: p.variasi_barang,
        satuan: p.satuan,
        category: p.categories?.nama_kategori || 'General',
        totalMasuk,
        totalKeluar,
        netFlow,
        currentStock
      };
    })
    .filter(p => p.totalMasuk > 0 || p.totalKeluar > 0)
    .sort((a, b) => (b.totalMasuk + b.totalKeluar) - (a.totalMasuk + a.totalKeluar));

    // 6. Critical Stock List (Below specific safety stock)
    const criticalStockList = data.products.map(p => {
      let currentStock = 0;
      data.locations.forEach(loc => {
        currentStock += (kpis.stockByProductAndLocation[p.id]?.[loc.id] || 0);
      });
      const thresholdVal = p.stok_minimum !== undefined && p.stok_minimum !== null ? p.stok_minimum : 5;
      const defisit = thresholdVal - currentStock;

      return {
        sku: p.kode_barang,
        name: p.nama_barang,
        category: p.categories?.nama_kategori || 'General',
        variasi: p.variasi_barang,
        satuan: p.satuan,
        stokMinimum: thresholdVal,
        currentStock,
        defisit
      };
    })
    .filter(p => p.currentStock < p.stokMinimum)
    .sort((a, b) => b.defisit - a.defisit);

    return {
      kpis,
      trends,
      totalAssetValue,
      categoryStock,
      categoryAsset,
      locationAsset,
      productAssetList,
      incomingPeriodVolume,
      outgoingPeriodVolume,
      incomingPeriodValue,
      outgoingPeriodValue,
      salesChannelVolume,
      supplierVolume,
      incomingNoteTypes,
      velocityList,
      criticalStockList
    };
  }, [data, startDate, endDate]);

  if (loading) {
    return (
      <div className={styles.loadingWrapper}>
        <div className={styles.spinner}></div>
        <p style={{ color: 'var(--text-secondary)' }}>Menghubungkan ke Supabase dan memproses data analitik...</p>
      </div>
    );
  }

  if (dbError === 'TABLES_MISSING') {
    return (
      <div className={styles.errorWrapper}>
        <Database size={48} className={styles.spinner} style={{ animation: 'none', border: 'none', borderRadius: '0' }} />
        <h2 className={styles.errorTitle}>Skema Database Belum Siap</h2>
        <p className={styles.errorText}>
          Tabel-tabel database belum terbentuk di Supabase. Harap buka <strong>Supabase Dashboard &gt; SQL Editor</strong> pada project Anda, lalu jalankan script berikut untuk membuat tabel, trigger, dan fungsi perhitungan stok otomatis:
        </p>
        <div style={{ width: '100%', maxWidth: '650px', textAlign: 'left' }}>
          <pre className={styles.sqlPre}>
{`-- Salin kode SQL berikut dan jalankan di Supabase SQL Editor:
-- File setup lengkap ada di /supabase_setup.sql

CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_lokasi TEXT UNIQUE NOT NULL,
    tipe_lokasi TEXT NOT NULL DEFAULT 'retail' CHECK (tipe_lokasi IN ('retail', 'warehouse', 'other')),
    alamat TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);`}
          </pre>
        </div>
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

  // --- ECHARTS CONFIGURATIONS (Tableau Layout Styles) ---
  const sparklineGrid = { left: 5, right: 5, top: 5, bottom: 5 };
  const getSparklineOption = (dataArray, lineColor) => ({
    grid: sparklineGrid,
    xAxis: { type: 'category', show: false, data: dataArray.map((_, i) => i) },
    yAxis: { type: 'value', show: false },
    series: [{
      type: 'line',
      data: dataArray.length > 0 ? dataArray : [0],
      showSymbol: false,
      smooth: true,
      lineStyle: { width: 1.8, color: lineColor },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: lineColor + '33' },
            { offset: 1, color: lineColor + '00' }
          ]
        }
      },
    }]
  });

  // Category Stock Chart (Horizontal Bars)
  const categoryNames = Object.keys(analytics.categoryStock);
  const categoryStockValues = Object.values(analytics.categoryStock);
  const categoryAssetValues = categoryNames.map(name => analytics.categoryAsset[name] || 0);

  const categoryStockOption = {
    color: ['#854836'],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#111111',
      borderColor: '#333333',
      textStyle: { color: '#FFFFFF', fontSize: 12 },
      formatter: '{b}: <strong>{c} psg</strong>'
    },
    grid: { left: '3%', right: '10%', top: '5%', bottom: '5%', containLabel: true },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      axisLabel: { color: 'var(--text-secondary)' }
    },
    yAxis: {
      type: 'category',
      data: categoryNames.length > 0 ? categoryNames : ['N/A'],
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { color: 'var(--text-secondary)', fontWeight: '600' }
    },
    series: [{
      name: 'Volume Stok',
      type: 'bar',
      barWidth: '60%',
      itemStyle: { borderRadius: [0, 4, 4, 0] },
      data: categoryStockValues.length > 0 ? categoryStockValues : [0]
    }]
  };

  const categoryAssetOption = {
    color: ['#FFB22C'],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#111111',
      borderColor: '#333333',
      textStyle: { color: '#FFFFFF', fontSize: 12 },
      formatter: function(params) {
        return `${params[0].name}: <strong>${formatRupiah(params[0].value)}</strong>`;
      }
    },
    grid: { left: '3%', right: '10%', top: '5%', bottom: '5%', containLabel: true },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      axisLabel: { 
        color: 'var(--text-secondary)',
        formatter: (val) => val >= 1000000 ? `${(val / 1000000).toFixed(0)}Jt` : val
      }
    },
    yAxis: {
      type: 'category',
      data: categoryNames.length > 0 ? categoryNames : ['N/A'],
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { color: 'var(--text-secondary)', fontWeight: '600' }
    },
    series: [{
      name: 'Nilai Aset',
      type: 'bar',
      barWidth: '60%',
      itemStyle: { borderRadius: [0, 4, 4, 0] },
      data: categoryAssetValues.length > 0 ? categoryAssetValues : [0]
    }]
  };

  // Location Asset Doughnut Chart
  const locationAssetData = Object.keys(analytics.locationAsset).map(key => ({
    name: key,
    value: analytics.locationAsset[key]
  }));

  const locationAssetOption = {
    color: ['#000000', '#854836', '#FFB22C'],
    tooltip: {
      trigger: 'item',
      backgroundColor: '#111111',
      borderColor: '#333333',
      textStyle: { color: '#FFFFFF', fontSize: 12 },
      formatter: function(params) {
        return `${params.name}: <strong>${formatRupiah(params.value)}</strong> (${params.percent}%)`;
      }
    },
    legend: { bottom: 0, left: 'center', icon: 'circle', textStyle: { color: 'var(--text-secondary)' } },
    series: [{
      name: 'Nilai Aset',
      type: 'pie',
      radius: ['50%', '75%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 8, borderColor: 'var(--bg-primary)', borderWidth: 2 },
      label: { show: false, position: 'center' },
      emphasis: {
        label: {
          show: true,
          fontSize: 14,
          fontWeight: 'bold',
          formatter: (params) => `${params.name}\n${(params.percent).toFixed(1)}%`
        }
      },
      data: locationAssetData.length > 0 ? locationAssetData : [{ name: 'N/A', value: 0 }]
    }]
  };

  // Daily Transaction Trend Chart
  const trendChartOption = {
    color: ['#854836', '#FFB22C'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#111111',
      borderColor: '#333333',
      textStyle: { color: '#FFFFFF', fontSize: 12 },
      formatter: function (params) {
        let result = `<div style="padding: 4px 8px;"><strong>Tanggal: ${params[0].name}</strong><br/>`;
        params.forEach(item => {
          result += `<span style="color: ${item.color};">●</span> ${item.seriesName}: <strong>${item.value} psg</strong><br/>`;
        });
        result += '</div>';
        return result;
      }
    },
    legend: { data: ['Barang Masuk', 'Barang Keluar'], bottom: 0, icon: 'circle' },
    grid: { left: '3%', right: '4%', top: '10%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: analytics.trends.dates.length > 0 ? analytics.trends.dates : ['Tidak ada data'],
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { color: 'var(--text-secondary)' }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      axisLabel: { color: 'var(--text-secondary)' }
    },
    series: [
      {
        name: 'Barang Masuk',
        type: 'line',
        smooth: true,
        symbolSize: 6,
        data: analytics.trends.masuk.length > 0 ? analytics.trends.masuk : [0]
      },
      {
        name: 'Barang Keluar',
        type: 'line',
        smooth: true,
        symbolSize: 6,
        data: analytics.trends.keluar.length > 0 ? analytics.trends.keluar : [0]
      }
    ]
  };

  // Sales Channel Doughnut
  const salesChannelNames = Object.keys(analytics.salesChannelVolume);
  const salesChannelData = salesChannelNames.map(name => ({
    name,
    value: analytics.salesChannelVolume[name]
  }));

  const salesChannelOption = {
    color: ['#000000', '#FFB22C', '#854836', '#00A896', '#FF3B30'],
    tooltip: {
      trigger: 'item',
      backgroundColor: '#111111',
      borderColor: '#333333',
      textStyle: { color: '#FFFFFF', fontSize: 12 },
      formatter: '{b}: <strong>{c} psg</strong> ({d}%)'
    },
    legend: { bottom: 0, left: 'center', icon: 'circle', textStyle: { color: 'var(--text-secondary)' } },
    series: [{
      name: 'Saluran Penjualan',
      type: 'pie',
      radius: ['50%', '75%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 8, borderColor: 'var(--bg-primary)', borderWidth: 2 },
      label: { show: false, position: 'center' },
      emphasis: {
        label: {
          show: true,
          fontSize: 14,
          fontWeight: 'bold',
          formatter: (params) => `${params.name}\n${params.value} psg`
        }
      },
      data: salesChannelData.length > 0 ? salesChannelData : [{ name: 'Tidak ada penjualan', value: 0 }]
    }]
  };

  // Top Suppliers Horizontal Bar Chart
  const supplierNames = Object.keys(analytics.supplierVolume).sort((a,b) => analytics.supplierVolume[b] - analytics.supplierVolume[a]).slice(0, 5);
  const supplierValues = supplierNames.map(name => analytics.supplierVolume[name]);

  const supplierChartOption = {
    color: ['#854836'],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#111111',
      borderColor: '#333333',
      textStyle: { color: '#FFFFFF', fontSize: 12 }
    },
    grid: { left: '3%', right: '10%', top: '5%', bottom: '5%', containLabel: true },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } }
    },
    yAxis: {
      type: 'category',
      data: supplierNames.length > 0 ? supplierNames : ['N/A'],
      axisLine: { lineStyle: { color: 'var(--border-color)' } }
    },
    series: [{
      name: 'Volume Masuk',
      type: 'bar',
      barWidth: '50%',
      itemStyle: { borderRadius: [0, 4, 4, 0] },
      data: supplierValues.length > 0 ? supplierValues : [0]
    }]
  };

  // Outgoing Note Types Column Chart
  const noteTypeNames = Object.keys(analytics.incomingNoteTypes);
  const noteTypeValues = Object.values(analytics.incomingNoteTypes);

  const noteTypeOption = {
    color: ['#FFB22C'],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#111111',
      borderColor: '#333333',
      textStyle: { color: '#FFFFFF', fontSize: 12 }
    },
    grid: { left: '3%', right: '5%', top: '10%', bottom: '10%', containLabel: true },
    xAxis: {
      type: 'category',
      data: noteTypeNames.length > 0 ? noteTypeNames : ['N/A'],
      axisLine: { lineStyle: { color: 'var(--border-color)' } }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } }
    },
    series: [{
      name: 'Qty Keluar',
      type: 'bar',
      barWidth: '40%',
      itemStyle: { borderRadius: [4, 4, 0, 0] },
      data: noteTypeValues.length > 0 ? noteTypeValues : [0]
    }]
  };

  return (
    <div className={styles.container}>
      {/* Tableau-Style Dashboard Title Header */}
      <div className={styles.tableauHeader}>
        <div>
          <h1 className={styles.tableauTitle}>LAF PROJECT &bull; BUSINESS ANALYTICS</h1>
          <p className={styles.tableauSubtitle}>Visualisasi data inventori, valuasi aset, dan analisis arus barang terintegrasi.</p>
        </div>
        <div className={styles.datePickerContainer}>
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
      </div>

      {/* Tableau-Style Sheet Tab Selector */}
      <div className={styles.tabContainer}>
        <button 
          className={`${styles.tabButton} ${activeTab === 'inventory' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('inventory')}
        >
          <Layers size={16} />
          Analisis Nilai Aset
        </button>
        <button 
          className={`${styles.tabButton} ${activeTab === 'flow' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('flow')}
        >
          <ArrowRightLeft size={16} />
          Kinerja Arus & Saluran
        </button>
        <button 
          className={`${styles.tabButton} ${activeTab === 'supply' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('supply')}
        >
          <Truck size={16} />
          Suplai & Pengawasan Stok
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: INVENTORY VALUATION ANALYSIS */}
      {/* ========================================================================= */}
      {activeTab === 'inventory' && (
        <div className={styles.tabContentPanel}>
          {/* KPI Dashboard Cards */}
          <div className={styles.kpiGrid}>
            <div className={`${styles.kpiCard} ${styles.kpiCardAccent}`}>
              <div className={styles.kpiContent}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiTitle}>Ragam Produk</span>
                  <span className={styles.kpiIcon}><Package size={16} /></span>
                </div>
                <div className={styles.kpiValue}>{analytics.kpis.totalProducts}</div>
                <div className={styles.kpiDesc}>Model/SKU terdaftar di master</div>
              </div>
              <div className={styles.kpiSparkline}>
                <ReactECharts option={getSparklineOption(analytics.trends.masuk.map((v, i) => v + (analytics.trends.keluar[i]||0)), '#FFB22C')} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
              </div>
            </div>

            <div className={`${styles.kpiCard} ${styles.kpiCardBrown}`}>
              <div className={styles.kpiContent}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiTitle}>Total Fisik Stok</span>
                  <span className={styles.kpiIcon}><Boxes size={16} /></span>
                </div>
                <div className={styles.kpiValue}>{analytics.kpis.totalStock} <span className={styles.kpiUnit}>psg</span></div>
                <div className={styles.kpiDesc}>
                  {Object.keys(analytics.kpis.locationBreakdown).map((loc, idx) => (
                    <span key={loc}>
                      {loc}: <strong>{analytics.kpis.locationBreakdown[loc]}</strong>
                      {idx < Object.keys(analytics.kpis.locationBreakdown).length - 1 ? ' | ' : ''}
                    </span>
                  ))}
                </div>
              </div>
              <div className={styles.kpiSparkline}>
                <ReactECharts option={getSparklineOption(analytics.trends.masuk, '#854836')} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
              </div>
            </div>

            <div className={`${styles.kpiCard} ${styles.kpiCardSuccess}`}>
              <div className={styles.kpiContent}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiTitle}>Nilai Aset Stok (HPP)</span>
                  <span className={styles.kpiIcon}><DollarSign size={16} style={{ color: 'var(--success)' }} /></span>
                </div>
                <div className={styles.kpiValue} style={{ fontSize: '22px', paddingTop: '4px', color: 'var(--success)' }}>
                  {formatRupiah(analytics.totalAssetValue)}
                </div>
                <div className={styles.kpiDesc}>Total kapital terkunci dalam stok</div>
              </div>
              <div className={styles.kpiSparkline}>
                <ReactECharts option={getSparklineOption(analytics.trends.masuk.map(v => v * 150000), '#34C759')} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
              </div>
            </div>
          </div>

          {/* Tableau visual tiles */}
          <div className={styles.chartsGrid}>
            <div className={styles.chartCard}>
              <h2 className={styles.chartTitle}>
                <BarChart size={18} style={{ color: 'var(--accent-brown)' }} />
                Distribusi Volume vs Nilai Aset per Kategori
              </h2>
              <p className={styles.chartSubtitle}>Analisis porsi stok (fisik) dan nilai modal (Rupiah) berdasarkan kategori barang.</p>
              
              <div className={styles.splitChartsContainer}>
                <div className={styles.splitChartLeft}>
                  <h3 className={styles.subChartTitle}>Volume Stok (Pasang)</h3>
                  <div className={styles.chartContainer} style={{ height: '240px' }}>
                    <ReactECharts option={categoryStockOption} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
                  </div>
                </div>
                <div className={styles.splitChartRight}>
                  <h3 className={styles.subChartTitle}>Nilai Aset (Rupiah)</h3>
                  <div className={styles.chartContainer} style={{ height: '240px' }}>
                    <ReactECharts option={categoryAssetOption} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.chartCard}>
              <h2 className={styles.chartTitle}>
                <PieChart size={18} style={{ color: 'var(--accent-laf)' }} />
                Porsi Aset per Lokasi
              </h2>
              <p className={styles.chartSubtitle}>Nominal Rupiah aset di Toko vs Gudang.</p>
              <div className={styles.chartContainer} style={{ marginTop: '20px' }}>
                <ReactECharts option={locationAssetOption} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
              </div>
            </div>
          </div>

          {/* Cross-Tab: Top 10 Product Asset Valuations */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <Layers size={18} style={{ color: 'var(--accent-brown)' }} />
              Tabel Valuasi Aset Produk (Top 10 High Value SKUs)
            </h2>
            <p className={styles.panelSubtitle}>Daftar produk dengan akumulasi nilai aset modal terbesar di seluruh lokasi penyimpanan.</p>
            
            <div className="table-container">
              <table className="custom-table" style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th>Kode Barang</th>
                    <th>Nama Produk</th>
                    <th>Kategori</th>
                    <th>Variasi</th>
                    <th style={{ textAlign: 'right' }}>Harga HPP</th>
                    <th style={{ textAlign: 'right' }}>Total Stok</th>
                    {data.locations.map(loc => (
                      <th key={loc.id} style={{ textAlign: 'right' }}>{loc.nama_lokasi}</th>
                    ))}
                    <th style={{ textAlign: 'right', color: 'var(--text-primary)' }}>Nilai Aset</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.productAssetList.slice(0, 10).map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: '600' }}>{p.sku}</td>
                      <td>{p.name}</td>
                      <td>
                        <span className="badge badge-secondary">{p.category}</span>
                      </td>
                      <td>{p.variasi || '-'}</td>
                      <td style={{ textAlign: 'right' }}>{formatRupiah(p.hpp)}</td>
                      <td style={{ textAlign: 'right', fontWeight: '600' }}>{p.stock} {p.satuan}</td>
                      {data.locations.map(loc => (
                        <td key={loc.id} style={{ textAlign: 'right', color: 'var(--text-light)' }}>
                          {p.breakdown[loc.nama_lokasi] || 0}
                        </td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--success)' }}>
                        {formatRupiah(p.assetValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TRANSACTION FLOW & CHANNELS */}
      {/* ========================================================================= */}
      {activeTab === 'flow' && (
        <div className={styles.tabContentPanel}>
          {/* KPI Dashboard Cards */}
          <div className={styles.kpiGrid}>
            <div className={`${styles.kpiCard} ${styles.kpiCardAccent}`}>
              <div className={styles.kpiContent}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiTitle}>Total Barang Masuk</span>
                  <span className={styles.kpiIcon}><TrendingUp size={16} style={{ color: '#00A896' }} /></span>
                </div>
                <div className={styles.kpiValue} style={{ color: '#00A896' }}>
                  +{analytics.incomingPeriodVolume} <span className={styles.kpiUnit}>psg</span>
                </div>
                <div className={styles.kpiDesc}>Nilai: <strong>{formatRupiah(analytics.incomingPeriodValue)}</strong></div>
              </div>
              <div className={styles.kpiSparkline}>
                <ReactECharts option={getSparklineOption(analytics.trends.masuk, '#00A896')} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
              </div>
            </div>

            <div className={`${styles.kpiCard} ${styles.kpiCardDanger}`}>
              <div className={styles.kpiContent}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiTitle}>Total Barang Keluar</span>
                  <span className={styles.kpiIcon}><TrendingDown size={16} style={{ color: 'var(--danger)' }} /></span>
                </div>
                <div className={styles.kpiValue} style={{ color: 'var(--danger)' }}>
                  -{analytics.outgoingPeriodVolume} <span className={styles.kpiUnit}>psg</span>
                </div>
                <div className={styles.kpiDesc}>Nilai (HPP): <strong>{formatRupiah(analytics.outgoingPeriodValue)}</strong></div>
              </div>
              <div className={styles.kpiSparkline}>
                <ReactECharts option={getSparklineOption(analytics.trends.keluar, '#FF3B30')} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
              </div>
            </div>

            <div className={`${styles.kpiCard} ${styles.kpiCardBrown}`}>
              <div className={styles.kpiContent}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiTitle}>Rasio Arus Keluar/Masuk</span>
                  <span className={styles.kpiIcon}><ArrowRightLeft size={16} /></span>
                </div>
                <div className={styles.kpiValue}>
                  {analytics.incomingPeriodVolume > 0 
                    ? `${((analytics.outgoingPeriodVolume / analytics.incomingPeriodVolume) * 100).toFixed(0)}%`
                    : '0%'}
                </div>
                <div className={styles.kpiDesc}>Perbandingan volume transaksi keluar vs masuk</div>
              </div>
              <div className={styles.kpiSparkline}>
                <ReactECharts option={getSparklineOption(analytics.trends.masuk.map((v, i) => v > 0 ? (analytics.trends.keluar[i]||0)/v : 0), '#854836')} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
              </div>
            </div>
          </div>

          {/* Tableau Visual Tiles */}
          <div className={styles.chartsGrid}>
            <div className={styles.chartCard}>
              <h2 className={styles.chartTitle}>
                <TrendingUp size={18} style={{ color: 'var(--accent-laf)' }} />
                Tren Arus Barang Harian (Masuk vs Keluar)
              </h2>
              <p className={styles.chartSubtitle}>Visualisasi pergerakan logistik harian dalam satuan pasang.</p>
              <div className={styles.chartContainer}>
                <ReactECharts option={trendChartOption} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
              </div>
            </div>

            <div className={styles.chartCard}>
              <h2 className={styles.chartTitle}>
                <PieChart size={18} style={{ color: 'var(--accent-brown)' }} />
                Kontribusi Saluran Keluar
              </h2>
              <p className={styles.chartSubtitle}>Porsi pengiriman berdasarkan saluran penjualan e-commerce.</p>
              <div className={styles.chartContainer}>
                <ReactECharts option={salesChannelOption} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
              </div>
            </div>
          </div>

          {/* Cross-Tab: Top 10 Product Velocity */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <Activity size={18} style={{ color: 'var(--accent-laf)' }} />
              Kinerja Arus Produk Teraktif (Velocity Sheet)
            </h2>
            <p className={styles.panelSubtitle}>Analisis produk dengan volume transaksi masuk dan keluar terbesar selama rentang tanggal terpilih.</p>
            
            <div className="table-container">
              <table className="custom-table" style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th>Kode Barang</th>
                    <th>Nama Produk</th>
                    <th>Kategori</th>
                    <th>Variasi</th>
                    <th style={{ textAlign: 'right' }}>Total Transaksi</th>
                    <th style={{ textAlign: 'right', color: '#00A896' }}>Volume Masuk</th>
                    <th style={{ textAlign: 'right', color: 'var(--danger)' }}>Volume Keluar</th>
                    <th style={{ textAlign: 'right' }}>Perubahan Net</th>
                    <th style={{ textAlign: 'right', fontWeight: '600' }}>Stok Fisik Saat Ini</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.velocityList.slice(0, 10).map((p) => (
                    <tr key={p.sku}>
                      <td style={{ fontWeight: '600' }}>{p.sku}</td>
                      <td>{p.name}</td>
                      <td>
                        <span className="badge badge-secondary">{p.category}</span>
                      </td>
                      <td>{p.variasi || '-'}</td>
                      <td style={{ textAlign: 'right', fontWeight: '600' }}>
                        {p.totalMasuk + p.totalKeluar} {p.satuan}
                      </td>
                      <td style={{ textAlign: 'right', color: '#00A896', fontWeight: '500' }}>
                        +{p.totalMasuk}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: '500' }}>
                        -{p.totalKeluar}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '700', color: p.netFlow >= 0 ? '#00A896' : 'var(--danger)' }}>
                        {p.netFlow > 0 ? `+${p.netFlow}` : p.netFlow}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--text-primary)' }}>
                        {p.currentStock} {p.satuan}
                      </td>
                    </tr>
                  ))}
                  {analytics.velocityList.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-light)', padding: '24px 0' }}>
                        Tidak ada aktivitas transaksi produk dalam rentang tanggal terpilih.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SUPPLY & OPERATION AUDIT */}
      {/* ========================================================================= */}
      {activeTab === 'supply' && (
        <div className={styles.tabContentPanel}>
          {/* KPI Dashboard Cards */}
          <div className={styles.kpiGrid}>
            <div className={`${styles.kpiCard} ${styles.kpiCardDanger}`}>
              <div className={styles.kpiContent}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiTitle}>Produk Kritis (Di Bawah Min)</span>
                  <span className={styles.kpiIcon}><AlertTriangle size={16} style={{ color: 'var(--danger)' }} /></span>
                </div>
                <div className={styles.kpiValue} style={{ color: analytics.kpis.lowStockCount > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                  {analytics.kpis.lowStockCount}
                </div>
                <div className={styles.kpiDesc}>Produk membutuhkan restock segera</div>
              </div>
              <div className={styles.kpiSparkline}>
                <ReactECharts option={getSparklineOption(analytics.trends.keluar, '#FF3B30')} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
              </div>
            </div>

            <div className={`${styles.kpiCard} ${styles.kpiCardAccent}`}>
              <div className={styles.kpiContent}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiTitle}>Supplier Aktif</span>
                  <span className={styles.kpiIcon}><Users size={16} /></span>
                </div>
                <div className={styles.kpiValue}>
                  {Object.keys(analytics.supplierVolume).length}
                </div>
                <div className={styles.kpiDesc}>Supplier pengirim barang di periode ini</div>
              </div>
              <div className={styles.kpiSparkline}>
                <ReactECharts option={getSparklineOption(analytics.trends.masuk, '#FFB22C')} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
              </div>
            </div>

            <div className={`${styles.kpiCard} ${styles.kpiCardBrown}`}>
              <div className={styles.kpiContent}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiTitle}>Total Transaksi Unik</span>
                  <span className={styles.kpiIcon}><Layers size={16} /></span>
                </div>
                <div className={styles.kpiValue}>
                  {data.barangMasuk.filter(bm => {
                    const d = bm.tanggal || bm.created_at;
                    return d >= startDate && d <= endDate;
                  }).length + data.barangKeluar.filter(bk => {
                    const d = bk.tanggal || bk.created_at;
                    return d >= startDate && d <= endDate;
                  }).length}
                </div>
                <div className={styles.kpiDesc}>Total nota logistik (masuk + keluar)</div>
              </div>
              <div className={styles.kpiSparkline}>
                <ReactECharts option={getSparklineOption(analytics.trends.masuk.map((v, i) => v + (analytics.trends.keluar[i]||0)), '#854836')} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
              </div>
            </div>
          </div>

          {/* Tableau Visual Tiles */}
          <div className={styles.chartsGrid}>
            <div className={styles.chartCard}>
              <h2 className={styles.chartTitle}>
                <Users size={18} style={{ color: 'var(--accent-brown)' }} />
                Pemasok Teraktif (Top 5 Supplier)
              </h2>
              <p className={styles.chartSubtitle}>Daftar supplier dengan volume pengiriman barang terbanyak (Pasang).</p>
              <div className={styles.chartContainer}>
                <ReactECharts option={supplierChartOption} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
              </div>
            </div>

            <div className={styles.chartCard}>
              <h2 className={styles.chartTitle}>
                <Layers size={18} style={{ color: 'var(--accent-laf)' }} />
                Metode Transaksi Keluar (Tipe Nota)
              </h2>
              <p className={styles.chartSubtitle}>Distribusi tipe nota penjualan barang keluar.</p>
              <div className={styles.chartContainer}>
                <ReactECharts option={noteTypeOption} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
              </div>
            </div>
          </div>

          {/* Cross-Tab: Under Safety Stock Products */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
              Tabel Pengawasan Stok Kritis (Under Safety Stock)
            </h2>
            <p className={styles.panelSubtitle}>Daftar seluruh barang dengan stok kumulatif saat ini berada di bawah target minimum pengamanan.</p>
            
            <div className="table-container">
              <table className="custom-table" style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th>Kode Barang</th>
                    <th>Nama Produk</th>
                    <th>Kategori</th>
                    <th>Variasi</th>
                    <th style={{ textAlign: 'right' }}>Stok Minimum (Target)</th>
                    <th style={{ textAlign: 'right' }}>Stok Fisik Saat Ini</th>
                    <th style={{ textAlign: 'right', color: 'var(--danger)' }}>Defisit</th>
                    <th>Status Risiko</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.criticalStockList.map((p) => (
                    <tr key={p.sku}>
                      <td style={{ fontWeight: '600' }}>{p.sku}</td>
                      <td>{p.name}</td>
                      <td>
                        <span className="badge badge-secondary">{p.category}</span>
                      </td>
                      <td>{p.variasi || '-'}</td>
                      <td style={{ textAlign: 'right', fontWeight: '500' }}>{p.stokMinimum} {p.satuan}</td>
                      <td style={{ textAlign: 'right', fontWeight: '700', color: p.currentStock === 0 ? 'var(--danger)' : 'var(--warning)' }}>
                        {p.currentStock} {p.satuan}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--danger)' }}>
                        -{p.defisit} {p.satuan}
                      </td>
                      <td>
                        <span className={`badge ${p.currentStock === 0 ? 'badge-danger' : 'badge-warning'}`}>
                          {p.currentStock === 0 ? 'HABIS TOTAL' : 'KRITIS (RE-ORDER)'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {analytics.criticalStockList.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: 'var(--success)', padding: '24px 0', fontWeight: '600' }}>
                        ✓ Seluruh produk aman. Tidak ada produk di bawah safety stock.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

