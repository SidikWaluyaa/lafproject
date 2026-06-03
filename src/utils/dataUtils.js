import { isWithinInterval, startOfDay, endOfDay, parseISO, format } from 'date-fns';

/**
 * Filter data array by date range.
 * @param {Array} data - List of objects containing created_at or tanggal
 * @param {String} start - Start date string (YYYY-MM-DD)
 * @param {String} end - End date string (YYYY-MM-DD)
 * @returns {Array} Filtered list
 */
export function filterDataByDateRange(data, start, end) {
  if (!start || !end || !data) return data || [];
  
  const startDate = startOfDay(new Date(start));
  const endDate = endOfDay(new Date(end));
  
  return data.filter(item => {
    const dateStr = item.tanggal || item.created_at;
    if (!dateStr) return true;
    
    const dateObj = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr);
    return isWithinInterval(dateObj, { start: startDate, end: endDate });
  });
}

/**
 * Calculate KPI summary values.
 * @param {Array} products - List of products
 * @param {Array} barangMasuk - List of incoming item logs
 * @param {Array} barangKeluar - List of outgoing item logs
 * @param {Array} locations - List of active locations
 * @param {Number} threshold - Stock warning threshold (default 5)
 * @returns {Object} Calculated KPIs
 */
export function calculateKPIs(products, barangMasuk, barangKeluar, locations, threshold = 5) {
  const totalProducts = products.length;
  
  // Calculate stock per product per location in-memory
  const stockByProductAndLocation = {};
  
  products.forEach(p => {
    stockByProductAndLocation[p.id] = {};
    locations.forEach(loc => {
      stockByProductAndLocation[p.id][loc.id] = 0;
    });
  });
  
  // Add incoming qty
  barangMasuk.forEach(bm => {
    if (stockByProductAndLocation[bm.produk_id] && stockByProductAndLocation[bm.produk_id][bm.lokasi_id] !== undefined) {
      stockByProductAndLocation[bm.produk_id][bm.lokasi_id] += bm.qty_masuk;
    }
  });
  
  // Subtract outgoing qty
  barangKeluar.forEach(bk => {
    if (stockByProductAndLocation[bk.produk_id] && stockByProductAndLocation[bk.produk_id][bk.lokasi_pengambilan_id] !== undefined) {
      stockByProductAndLocation[bk.produk_id][bk.lokasi_pengambilan_id] -= bk.qty_keluar;
    }
  });
  
  let totalStock = 0;
  let lowStockCount = 0;
  const locationBreakdown = {};
  
  locations.forEach(loc => {
    locationBreakdown[loc.nama_lokasi] = 0;
  });
  
  products.forEach(p => {
    let productTotalStock = 0;
    locations.forEach(loc => {
      const stock = stockByProductAndLocation[p.id][loc.id] || 0;
      productTotalStock += stock;
      locationBreakdown[loc.nama_lokasi] += stock;
    });
    
    totalStock += productTotalStock;
    if (productTotalStock < threshold) {
      lowStockCount++;
    }
  });
  
  return {
    totalProducts,
    totalStock,
    lowStockCount,
    locationBreakdown,
    stockByProductAndLocation
  };
}

/**
 * Group stock logs by date and type for chart trends.
 * @param {Array} stockLogs - List of all stock logs
 * @param {String} start - Filter start date (YYYY-MM-DD)
 * @param {String} end - Filter end date (YYYY-MM-DD)
 * @returns {Object} Chart dates and values (masuk vs keluar)
 */
export function getTransactionTrendData(stockLogs, start, end) {
  const filtered = filterDataByDateRange(stockLogs, start, end);
  
  // Group by date
  const groups = {};
  
  filtered.forEach(log => {
    const dateStr = format(parseISO(log.created_at), 'yyyy-MM-dd');
    if (!groups[dateStr]) {
      groups[dateStr] = { masuk: 0, keluar: 0 };
    }
    
    if (log.tipe === 'MASUK') {
      groups[dateStr].masuk += log.qty;
    } else {
      groups[dateStr].keluar += log.qty;
    }
  });
  
  // Sort dates
  const sortedDates = Object.keys(groups).sort();
  const masukData = [];
  const keluarData = [];
  
  sortedDates.forEach(date => {
    masukData.push(groups[date].masuk);
    keluarData.push(groups[date].keluar);
  });
  
  return {
    dates: sortedDates.map(d => format(parseISO(d), 'dd MMM')),
    masuk: masukData,
    keluar: keluarData
  };
}

/**
 * Format currency to Indonesian Rupiah.
 * @param {Number} num - Number to format
 * @returns {String} Formatted string
 */
export function formatRupiah(num) {
  if (num === undefined || num === null) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num);
}

/**
 * Calculate product flow data (most entered and most exited).
 * @param {Array} products - List of products
 * @param {Array} barangMasuk - List of incoming transactions
 * @param {Array} barangKeluar - List of outgoing transactions
 * @param {Array} locations - List of active locations
 * @param {String} start - Start date string (YYYY-MM-DD)
 * @param {String} end - End date string (YYYY-MM-DD)
 * @param {Object} stockByProductAndLocation - Precalculated stock map
 * @returns {Object} { mostRestocked, mostSold }
 */
export function getProductFlowData(products, barangMasuk, barangKeluar, locations, start, end, stockByProductAndLocation) {
  // 1. Filter transactions by date range
  const filteredMasuk = filterDataByDateRange(barangMasuk, start, end);
  const filteredKeluar = filterDataByDateRange(barangKeluar, start, end);

  // 2. Sum quantities per product
  const incomingSums = {};
  filteredMasuk.forEach(bm => {
    incomingSums[bm.produk_id] = (incomingSums[bm.produk_id] || 0) + bm.qty_masuk;
  });

  const outgoingSums = {};
  filteredKeluar.forEach(bk => {
    outgoingSums[bk.produk_id] = (outgoingSums[bk.produk_id] || 0) + bk.qty_keluar;
  });

  // 3. Map products to their flows
  const flowList = products.map(p => {
    // Current stock is the sum across all locations
    let currentStock = 0;
    locations.forEach(loc => {
      currentStock += (stockByProductAndLocation[p.id]?.[loc.id] || 0);
    });

    return {
      id: p.id,
      nama_barang: p.nama_barang,
      totalMasuk: incomingSums[p.id] || 0,
      totalKeluar: outgoingSums[p.id] || 0,
      currentStock,
      satuan: p.satuan
    };
  });

  // 4. Generate Top Restocked (sort totalMasuk desc, limit to top 15)
  const mostRestocked = [...flowList]
    .filter(item => item.totalMasuk > 0)
    .sort((a, b) => b.totalMasuk - a.totalMasuk)
    .slice(0, 15);

  // 5. Generate Top Sold (sort totalKeluar desc, limit to top 15)
  const mostSold = [...flowList]
    .filter(item => item.totalKeluar > 0)
    .sort((a, b) => b.totalKeluar - a.totalKeluar)
    .slice(0, 15);

  return {
    mostRestocked,
    mostSold
  };
}
