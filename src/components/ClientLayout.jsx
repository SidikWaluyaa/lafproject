'use client';

import { useAuth } from '@/lib/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export default function ClientLayout({ children }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isLoginPage = pathname === '/login';

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Close sidebar on window resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Lock body scroll when sidebar drawer is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  useEffect(() => {
    if (!loading) {
      if (!user && !isLoginPage) {
        router.push('/login');
      } else if (user && isLoginPage) {
        router.push('/dashboard');
      }
    }
  }, [user, loading, isLoginPage, router]);

  // Premium loading indicator
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        background: 'radial-gradient(circle at 50% 50%, #20120F 0%, #000000 100%)',
        color: '#FFFFFF',
        fontFamily: 'var(--font-sans)',
      }}>
        <div style={{
          padding: '40px',
          borderRadius: '24px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          maxWidth: '320px',
          width: '90%',
        }}>
          <img src="/logo.png" alt="LAF Logo" style={{
            height: '46px',
            width: 'auto',
            borderRadius: '6px',
            marginBottom: '10px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          }} />
          <div className="spinner" style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(255, 178, 44, 0.1)',
            borderTop: '3px solid #FFB22C',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#FFFFFF', marginBottom: '4px' }}>
              Memuat Sesi
            </h3>
            <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
              Menghubungkan ke Supabase...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user && !isLoginPage) {
    return (
      <div style={{ width: '100vw', height: '100vh', backgroundColor: 'var(--bg-secondary)' }} />
    );
  }

  if (isLoginPage) {
    return (
      <div style={{ 
        width: '100vw', 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        backgroundColor: '#0c0706'
      }}>
        <main style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Overlay backdrop (mobile only) */}
      {sidebarOpen && (
        <div 
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar with mobile drawer support */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area */}
      <div className="main-content">
        <Navbar onMenuToggle={() => setSidebarOpen(prev => !prev)} />
        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}
