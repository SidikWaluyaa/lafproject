'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { User, Calendar, Menu } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import styles from './navbar.module.css';

export default function Navbar({ onMenuToggle }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getDisplayName = () => {
    if (!user || !user.email) return 'Administrator';
    const emailParts = user.email.split('@');
    return emailParts[0].charAt(0).toUpperCase() + emailParts[0].slice(1);
  };

  const getDisplayRole = () => {
    if (!user || !user.email) return 'Store Manager';
    return user.email;
  };
  
  const getPageTitle = () => {
    if (pathname === '/' || pathname.startsWith('/dashboard')) return 'Dashboard Analytics';
    if (pathname.startsWith('/arus-barang')) return 'Analisis Arus Barang';
    if (pathname.startsWith('/products')) return 'Stock Master';
    if (pathname.startsWith('/barang-masuk')) return 'Barang Masuk';
    if (pathname.startsWith('/barang-keluar')) return 'Barang Keluar';
    if (pathname.startsWith('/riwayat-masuk')) return 'Riwayat Masuk';
    if (pathname.startsWith('/riwayat-keluar')) return 'Riwayat Keluar';
    if (pathname.startsWith('/categories')) return 'Kategori Master';
    if (pathname.startsWith('/locations')) return 'Lokasi Master';
    return 'Stock Management';
  };

  const getBreadcrumbs = () => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) return 'laf / dashboard';
    return 'laf / ' + parts.join(' / ');
  };

  const getFormattedDate = () => {
    if (!mounted) return 'Memuat tanggal...';
    return new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <header className={styles.navbar}>
      <div className={styles.left}>
        {/* Hamburger button - visible on mobile only */}
        <button className={styles.menuBtn} onClick={onMenuToggle} aria-label="Toggle menu">
          <Menu size={22} />
        </button>
        <div className={styles.titleGroup}>
          <span className={styles.breadcrumbs}>{getBreadcrumbs()}</span>
          <h1 className={styles.title}>{getPageTitle()}</h1>
        </div>
      </div>
      <div className={styles.right}>
        <div className={styles.dateBadge}>
          <Calendar size={16} />
          <span>{getFormattedDate()}</span>
        </div>
        <div className={styles.profile}>
          <div className={styles.avatar}>
            <User size={18} />
          </div>
          <div className={styles.profileInfo}>
            <span className={styles.profileName}>{getDisplayName()}</span>
            <span className={styles.profileRole}>{getDisplayRole()}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
