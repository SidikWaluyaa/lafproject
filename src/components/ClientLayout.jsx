'use client';

import { useAuth } from '@/lib/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export default function ClientLayout({ children }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isLoginPage = pathname === '/login';

  useEffect(() => {
    if (!loading) {
      if (!user && !isLoginPage) {
        // Redirect unauthenticated user to login
        router.push('/login');
      } else if (user && isLoginPage) {
        // Redirect authenticated user to dashboard if they try to access login
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
          {/* Logo badge */}
          <img src="/logo.png" alt="LAF Logo" style={{
            height: '46px',
            width: 'auto',
            borderRadius: '6px',
            marginBottom: '10px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          }} />
          
          {/* Loading Spinner */}
          <div className="spinner" style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(255, 178, 44, 0.1)',
            borderTop: '3px solid #FFB22C',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          
          <div style={{
            textAlign: 'center',
          }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#FFFFFF',
              marginBottom: '4px',
            }}>
              Memuat Sesi
            </h3>
            <p style={{
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.5)',
            }}>
              Menghubungkan ke Supabase...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Prevent flashing protected content before redirect
  if (!user && !isLoginPage) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: 'var(--bg-secondary)',
      }} />
    );
  }

  // Render Login page clean layout without Navbar/Sidebar
  if (isLoginPage) {
    return (
      <div style={{ 
        width: '100vw', 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        backgroundColor: '#0c0706' // Darker premium background for login
      }}>
        <main style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          {children}
        </main>
      </div>
    );
  }

  // Regular authenticated page layout
  return (
    <div style={{ 
      display: 'flex', 
      width: '100vw', 
      minHeight: '100vh',
      backgroundColor: '#FAFAFA',
      backgroundImage: 'radial-gradient(#E3E3E3 1.5px, transparent 1.5px)',
      backgroundSize: '20px 20px',
    }}>
      <Sidebar />
      <div style={{ 
        flexGrow: 1, 
        marginLeft: '260px', 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        background: 'transparent' 
      }}>
        <Navbar />
        <main style={{ padding: '40px', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
