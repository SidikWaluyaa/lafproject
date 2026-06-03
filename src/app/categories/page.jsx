'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Search, Edit2, Trash2, ShieldAlert, Loader2 } from 'lucide-react';
import { yieldToMainThread } from '@/utils/performance';
import Modal from '@/components/Modal';
import styles from './categories.module.css';

export default function Categories() {
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Form states
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [formValues, setFormValues] = useState({
    nama_kategori: '',
    kode_prefix: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('categories').select('*').order('nama_kategori');
      setCategories(data || []);
    } catch (err) {
      console.error('Error fetching categories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const channel = supabase.channel('categories-realtime')
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
        nama_kategori: '',
        kode_prefix: ''
      });
    }
  }, [isAddModalOpen]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormValues(prev => ({
      ...prev,
      [name]: name === 'kode_prefix' ? value.toUpperCase().trim() : value
    }));
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (formValues.kode_prefix.length < 2) {
      alert('Kode prefix minimal 2 karakter.');
      return;
    }

    setSubmitLoading(true);
    try {
      const { error } = await supabase.from('categories').insert([formValues]);
      if (error) throw error;

      setIsAddModalOpen(false);
      fetchData();
    } catch (err) {
      alert('Error menambah kategori: ' + err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleEditClick = (cat) => {
    setSelectedCategory(cat);
    setFormValues({
      nama_kategori: cat.nama_kategori,
      kode_prefix: cat.kode_prefix
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setSubmitLoading(true);
    try {
      const { error } = await supabase
        .from('categories')
        .update(formValues)
        .eq('id', selectedCategory.id);

      if (error) throw error;

      setIsEditModalOpen(false);
      fetchData();
    } catch (err) {
      alert('Error mengedit kategori: ' + err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteClick = (cat) => {
    setSelectedCategory(cat);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setSubmitLoading(true);
    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', selectedCategory.id);

      if (error) {
        // Check for reference violation
        if (error.code === '23503') {
          throw new Error('Tidak bisa menghapus kategori ini karena masih ada produk yang menggunakannya.');
        }
        throw error;
      }

      setIsDeleteModalOpen(false);
      fetchData();
    } catch (err) {
      alert('Gagal menghapus: ' + err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const filteredCategories = categories.filter(cat => 
    cat.nama_kategori.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cat.kode_prefix.toLowerCase().includes(searchTerm.toLowerCase())
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
              placeholder="Cari kategori atau prefix..."
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
          <Plus size={16} /> Tambah Kategori
        </button>
      </div>

      {/* Main List Table */}
      {loading ? (
        <div className={styles.loadingState}>
          <Loader2 className="spinner" size={24} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ marginLeft: '12px', color: 'var(--text-secondary)' }}>Memuat kategori...</span>
        </div>
      ) : (
        <div className="table-container" style={{ maxWidth: '800px' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Nama Kategori</th>
                <th>Kode Prefix (SKU)</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-light)', padding: '30px' }}>
                    Kategori tidak ditemukan.
                  </td>
                </tr>
              ) : (
                filteredCategories.map((cat) => (
                  <tr key={cat.id}>
                    <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{cat.nama_kategori}</td>
                    <td>
                      <span className="badge badge-primary" style={{ fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                        {cat.kode_prefix}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actionsCell}>
                        <button 
                          className={`${styles.iconBtn} ${styles.editBtn}`}
                          onClick={() => yieldToMainThread(() => handleEditClick(cat))}
                          title="Edit Kategori"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          className={`${styles.iconBtn} ${styles.deleteBtn}`}
                          onClick={() => yieldToMainThread(() => handleDeleteClick(cat))}
                          title="Hapus Kategori"
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

      {/* Modal Tambah Kategori */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Tambah Kategori Baru"
      >
        <form onSubmit={handleAddSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Nama Kategori*</label>
            <input 
              type="text" 
              name="nama_kategori"
              placeholder="E.g., Aksesoris, Sandal Gunung"
              className="input-field" 
              required
              value={formValues.nama_kategori}
              onChange={handleInputChange}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Kode Prefix (SKU)*</label>
            <input 
              type="text" 
              name="kode_prefix"
              placeholder="E.g., ACC, SNDG (Min 2 huruf, huruf kapital otomatis)"
              className="input-field" 
              required
              maxLength="8"
              value={formValues.kode_prefix}
              onChange={handleInputChange}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '2px' }}>
              Digunakan sebagai prefix kode barang / SKU otomatis (contoh: LAF-ACC-0001)
            </span>
          </div>

          <div className={styles.formActions}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)}>
              Batal
            </button>
            <button type="submit" className="btn btn-accent" disabled={submitLoading}>
              {submitLoading ? 'Menyimpan...' : 'Simpan Kategori'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Edit Kategori */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Kategori"
      >
        <form onSubmit={handleEditSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Nama Kategori*</label>
            <input 
              type="text" 
              name="nama_kategori"
              className="input-field" 
              required
              value={formValues.nama_kategori}
              onChange={handleInputChange}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Kode Prefix (SKU)*</label>
            <input 
              type="text" 
              name="kode_prefix"
              className="input-field" 
              required
              maxLength="8"
              value={formValues.kode_prefix}
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

      {/* Modal Hapus Kategori */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Hapus Kategori"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            <ShieldAlert size={36} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <div>
              <p style={{ fontWeight: '600', fontSize: '15px', color: 'var(--text-primary)', marginBottom: '6px' }}>
                Apakah Anda yakin ingin menghapus kategori ini?
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Kategori <strong>{selectedCategory?.nama_kategori}</strong> ({selectedCategory?.kode_prefix}) tidak dapat dihapus jika terdapat produk aktif yang terdaftar di bawahnya.
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
