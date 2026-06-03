'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Search, Edit2, Trash2, ShieldAlert, Loader2, MapPin } from 'lucide-react';
import { yieldToMainThread } from '@/utils/performance';
import Modal from '@/components/Modal';
import styles from './locations.module.css';

export default function Locations() {
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [locations, setLocations] = useState([]);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Form states
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [formValues, setFormValues] = useState({
    nama_lokasi: '',
    tipe_lokasi: 'retail',
    alamat: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('locations').select('*').order('nama_lokasi');
      setLocations(data || []);
    } catch (err) {
      console.error('Error fetching locations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const channel = supabase.channel('locations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (isAddModalOpen) {
      setFormValues({
        nama_lokasi: '',
        tipe_lokasi: 'retail',
        alamat: ''
      });
    }
  }, [isAddModalOpen]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormValues(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setSubmitLoading(true);
    try {
      const { error } = await supabase.from('locations').insert([formValues]);
      if (error) throw error;

      setIsAddModalOpen(false);
      fetchData();
    } catch (err) {
      alert('Error menambah lokasi: ' + err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleEditClick = (loc) => {
    setSelectedLocation(loc);
    setFormValues({
      nama_lokasi: loc.nama_lokasi,
      tipe_lokasi: loc.tipe_lokasi,
      alamat: loc.alamat || ''
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setSubmitLoading(true);
    try {
      const { error } = await supabase
        .from('locations')
        .update(formValues)
        .eq('id', selectedLocation.id);

      if (error) throw error;

      setIsEditModalOpen(false);
      fetchData();
    } catch (err) {
      alert('Error mengedit lokasi: ' + err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteClick = (loc) => {
    setSelectedLocation(loc);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setSubmitLoading(true);
    try {
      const { error } = await supabase
        .from('locations')
        .delete()
        .eq('id', selectedLocation.id);

      if (error) {
        if (error.code === '23503') {
          throw new Error('Tidak bisa menghapus lokasi ini karena masih terdapat produk default atau histori transaksi di lokasi ini.');
        }
        throw error;
      }

      setIsDeleteModalOpen(false);
      fetchData();
    } catch (err) {
      alert('Gagal menghapus lokasi: ' + err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const filteredLocations = locations.filter(loc => 
    loc.nama_lokasi.toLowerCase().includes(searchTerm.toLowerCase()) ||
    loc.tipe_lokasi.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (loc.alamat && loc.alamat.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className={styles.container}>
      {/* Top action bar */}
      <div className={styles.topActions}>
        <div className={styles.searchFilters}>
          <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-light)' }} />
            <input 
              type="text" 
              placeholder="Cari lokasi berdasarkan nama atau alamat..."
              className={styles.searchInput}
              style={{ paddingLeft: '36px' }}
              value={searchTerm}
              onChange={(e) => {
                const val = e.target.value;
                yieldToMainThread(() => setSearchTerm(val));
              }}
            />
          </div>
        </div>

        <button className="btn btn-primary" onClick={() => yieldToMainThread(() => setIsAddModalOpen(true))}>
          <Plus size={16} /> Tambah Lokasi
        </button>
      </div>

      {/* Main List Table */}
      {loading ? (
        <div className={styles.loadingState}>
          <Loader2 className="spinner" size={24} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ marginLeft: '12px', color: 'var(--text-secondary)' }}>Memuat lokasi...</span>
        </div>
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Nama Lokasi</th>
                <th>Tipe Lokasi</th>
                <th>Alamat</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredLocations.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-light)', padding: '30px' }}>
                    Lokasi tidak ditemukan.
                  </td>
                </tr>
              ) : (
                filteredLocations.map((loc) => (
                  <tr key={loc.id}>
                    <td style={{ fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MapPin size={14} style={{ color: 'var(--text-light)' }} />
                      {loc.nama_lokasi}
                    </td>
                    <td>
                      <span className={`badge ${loc.tipe_lokasi === 'retail' ? 'badge-primary' : 'badge-secondary'}`}>
                        {loc.tipe_lokasi === 'retail' ? 'Toko Retail' : loc.tipe_lokasi === 'warehouse' ? 'Gudang' : 'Lainnya'}
                      </span>
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--text-light)' }}>{loc.alamat || '-'}</td>
                    <td>
                      <div className={styles.actionsCell}>
                        <button 
                          className={`${styles.iconBtn} ${styles.editBtn}`}
                          onClick={() => yieldToMainThread(() => handleEditClick(loc))}
                          title="Edit Lokasi"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          className={`${styles.iconBtn} ${styles.deleteBtn}`}
                          onClick={() => yieldToMainThread(() => handleDeleteClick(loc))}
                          title="Hapus Lokasi"
                        >
                          <Trash2 size={16} />
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

      {/* Modal Tambah Lokasi */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Tambah Lokasi Baru"
      >
        <form onSubmit={handleAddSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Nama Lokasi*</label>
            <input 
              type="text" 
              name="nama_lokasi"
              placeholder="E.g., TOKO UTAMA, GUDANG SENTRAL"
              className="input-field" 
              required
              value={formValues.nama_lokasi}
              onChange={handleInputChange}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Tipe Lokasi*</label>
            <select
              name="tipe_lokasi"
              className="input-field"
              required
              value={formValues.tipe_lokasi}
              onChange={handleInputChange}
            >
              <option value="retail">Toko Retail (Outlet)</option>
              <option value="warehouse">Gudang Penyimpanan</option>
              <option value="other">Lainnya</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Alamat Lengkap</label>
            <textarea
              name="alamat"
              placeholder="Tulis alamat lokasi (opsional)..."
              className="input-field"
              style={{ minHeight: '80px', resize: 'vertical' }}
              value={formValues.alamat}
              onChange={handleInputChange}
            />
          </div>

          <div className={styles.formActions}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)}>
              Batal
            </button>
            <button type="submit" className="btn btn-accent" disabled={submitLoading}>
              {submitLoading ? 'Menyimpan...' : 'Simpan Lokasi'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Edit Lokasi */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Lokasi"
      >
        <form onSubmit={handleEditSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Nama Lokasi*</label>
            <input 
              type="text" 
              name="nama_lokasi"
              className="input-field" 
              required
              value={formValues.nama_lokasi}
              onChange={handleInputChange}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Tipe Lokasi*</label>
            <select
              name="tipe_lokasi"
              className="input-field"
              required
              value={formValues.tipe_lokasi}
              onChange={handleInputChange}
            >
              <option value="retail">Toko Retail (Outlet)</option>
              <option value="warehouse">Gudang Penyimpanan</option>
              <option value="other">Lainnya</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Alamat Lengkap</label>
            <textarea
              name="alamat"
              className="input-field"
              style={{ minHeight: '80px', resize: 'vertical' }}
              value={formValues.alamat}
              onChange={handleInputChange}
            />
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

      {/* Modal Hapus Lokasi */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Hapus Lokasi"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            <ShieldAlert size={36} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <div>
              <p style={{ fontWeight: '600', fontSize: '15px', color: 'var(--text-primary)', marginBottom: '6px' }}>
                Apakah Anda yakin ingin menghapus lokasi ini?
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Lokasi <strong>{selectedLocation?.nama_lokasi}</strong> tidak dapat dihapus jika terdapat produk yang menunjuk lokasi ini sebagai default, atau terdapat histori transaksi barang masuk/keluar di lokasi ini.
              </p>
            </div>
          </div>
          
          <div className={styles.formActions}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsDeleteModalOpen(false)}>
              Batal
            </button>
            <button type="button" className="btn btn-danger" onClick={handleDeleteConfirm} disabled={submitLoading}>
              {submitLoading ? 'Menghapus...' : 'Ya, Hapus'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
