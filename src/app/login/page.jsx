'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';
import styles from './login.module.css';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Email dan password wajib diisi');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      await login(email, password);
      // AuthState listener in ClientLayout handles redirect, but we can also route manually
      router.push('/dashboard');
    } catch (err) {
      console.error('Login error:', err);
      // Map common Supabase Auth errors to Indonesian friendly messages
      if (err.message === 'Invalid login credentials') {
        setErrorMsg('Email atau password salah. Silakan coba lagi.');
      } else if (err.message.includes('Email not confirmed')) {
        setErrorMsg('Email belum dikonfirmasi. Periksa kotak masuk Anda.');
      } else {
        setErrorMsg(err.message || 'Terjadi kesalahan sistem saat masuk.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.glow1}></div>
      <div className={styles.glow2}></div>
      
      <div className={styles.loginCard}>
        <div className={styles.brandHeader}>
          <img src="/logo.png" alt="LAF Logo" className={styles.logoImage} />
          <p className={styles.brandSubtitle} style={{ marginTop: '10px' }}>Sistem Manajemen Stok & Inventaris</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <h1 className={styles.formTitle}>Masuk Akun</h1>
          <p className={styles.formSubtitle}>Silakan masuk menggunakan akun administratif Anda.</p>

          {errorMsg && (
            <div className={styles.errorBanner}>
              <AlertCircle size={16} className={styles.errorIcon} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className={styles.inputGroup}>
            <label htmlFor="email" className={styles.label}>Email</label>
            <div className={styles.inputWrapper}>
              <Mail size={18} className={styles.inputIcon} />
              <input
                id="email"
                type="email"
                placeholder="nama@lafproject.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.input}
                disabled={isLoading}
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password" className={styles.label}>Password</label>
            <div className={styles.inputWrapper}>
              <Lock size={18} className={styles.inputIcon} />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.input}
                disabled={isLoading}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className={styles.eyeButton}
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className={styles.spinner}></span>
            ) : (
              <>
                <span>Masuk Sekarang</span>
                <ArrowRight size={18} className={styles.btnArrow} />
              </>
            )}
          </button>
        </form>
      </div>
      
      <div className={styles.loginFooter}>
        <p>© {new Date().getFullYear()} LAF Project Official. All rights reserved.</p>
        <p className={styles.footerNote}>Sistem Keamanan Terenkripsi • Supabase Auth</p>
      </div>
    </div>
  );
}
