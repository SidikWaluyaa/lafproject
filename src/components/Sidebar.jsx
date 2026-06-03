'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Boxes, ArrowDownLeft, ArrowUpRight, History, Tags, MapPin, LogOut, ArrowLeftRight } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import styles from './sidebar.module.css';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (err) {
      console.error('Failed to log out:', err.message);
    }
  };
  
  const menuItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Arus Barang', path: '/arus-barang', icon: ArrowLeftRight },
    { name: 'Stock Master', path: '/products', icon: Boxes },
    { name: 'Barang Masuk', path: '/barang-masuk', icon: ArrowDownLeft },
    { name: 'Barang Keluar', path: '/barang-keluar', icon: ArrowUpRight },
    { name: 'Riwayat Masuk', path: '/riwayat-masuk', icon: History },
    { name: 'Riwayat Keluar', path: '/riwayat-keluar', icon: History },
    { name: 'Kategori Master', path: '/categories', icon: Tags },
    { name: 'Lokasi Master', path: '/locations', icon: MapPin },
  ];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logoContainer}>
        <img src="/logo.png" alt="LAF Logo" className={styles.logoImage} />
        <span className={styles.logoText}>LAF PROJECT</span>
      </div>
      <nav className={styles.nav}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.path);
          return (
            <Link 
              key={item.path} 
              href={item.path}
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <Icon size={18} className={styles.icon} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
      <div className={styles.footer}>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          <LogOut size={18} className={styles.icon} />
          <span>Keluar Akun</span>
        </button>
        <div className={styles.statusBox}>
          <span className={styles.statusDot}></span>
          <span>Supabase Live</span>
        </div>
      </div>
    </aside>
  );
}
