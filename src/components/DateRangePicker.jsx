'use client';

import { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import styles from './date-range-picker.module.css';

export default function DateRangePicker({ startDate, endDate, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeShortcut, setActiveShortcut] = useState('30_days');
  const containerRef = useRef(null);

  // Custom date states for custom range editing
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);

  const shortcuts = [
    { id: 'today', label: 'Hari Ini' },
    { id: 'yesterday', label: 'Kemarin' },
    { id: '7_days', label: '7 Hari Terakhir' },
    { id: '30_days', label: '30 Hari Terakhir' },
    { id: 'this_month', label: 'Bulan Ini' },
    { id: 'last_month', label: 'Bulan Lalu' },
    { id: 'custom', label: 'Kustom' },
  ];

  // Helper to format date strings YYYY-MM-DD to "DD MMM YYYY" in Indonesian
  const formatIndoDate = (dateStr) => {
    if (!dateStr) return '';
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
      'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
    ];
    try {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      const year = parts[0];
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return `${day} ${months[monthIndex]} ${year}`;
    } catch (e) {
      return dateStr;
    }
  };

  // Convert Date object to YYYY-MM-DD local date string
  const toLocalISOString = (date) => {
    const tzOffset = date.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 10);
    return localISOTime;
  };

  // Handle shortcut selection
  const handleShortcutClick = (shortcutId) => {
    setActiveShortcut(shortcutId);
    if (shortcutId === 'custom') {
      return; // Wait for user to select using inputs
    }

    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (shortcutId) {
      case 'today':
        // start and end are today
        break;
      case 'yesterday':
        start.setDate(today.getDate() - 1);
        end.setDate(today.getDate() - 1);
        break;
      case '7_days':
        start.setDate(today.getDate() - 6);
        break;
      case '30_days':
        start.setDate(today.getDate() - 29);
        break;
      case 'this_month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'last_month':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      default:
        break;
    }

    const startStr = toLocalISOString(start);
    const endStr = toLocalISOString(end);
    
    setCustomStart(startStr);
    setCustomEnd(endStr);
    onChange(startStr, endStr);
    setIsOpen(false);
  };

  // Handle custom range submission
  const handleCustomSubmit = (e) => {
    e.preventDefault();
    if (customStart && customEnd) {
      onChange(customStart, customEnd);
      setIsOpen(false);
    }
  };

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Sync state if props change externally
  useEffect(() => {
    setCustomStart(startDate);
    setCustomEnd(endDate);
  }, [startDate, endDate]);

  const getButtonText = () => {
    const active = shortcuts.find(s => s.id === activeShortcut);
    if (activeShortcut === 'custom') {
      return `${formatIndoDate(startDate)} - ${formatIndoDate(endDate)}`;
    }
    return active ? (
      <>
        <span>{active.label}</span>
        <span className={styles.rangeDetails}> ({formatIndoDate(startDate)} - {formatIndoDate(endDate)})</span>
      </>
    ) : `${formatIndoDate(startDate)} - ${formatIndoDate(endDate)}`;
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <button 
        type="button"
        className={styles.pickerButton} 
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Calendar size={16} className={styles.calendarIcon} />
        <span className={styles.buttonText}>{getButtonText()}</span>
        <ChevronDown size={14} className={`${styles.chevronIcon} ${isOpen ? styles.chevronOpen : ''}`} />
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.shortcutsList}>
            {shortcuts.map((shortcut) => (
              <button
                key={shortcut.id}
                type="button"
                className={`${styles.shortcutItem} ${activeShortcut === shortcut.id ? styles.activeShortcut : ''}`}
                onClick={() => handleShortcutClick(shortcut.id)}
              >
                <span>{shortcut.label}</span>
                {activeShortcut === shortcut.id && <Check size={14} className={styles.checkIcon} />}
              </button>
            ))}
          </div>

          <div className={styles.customSection}>
            <form onSubmit={handleCustomSubmit} className={styles.customForm}>
              <h4 className={styles.customTitle}>Pilih Tanggal Kustom</h4>
              <div className={styles.inputsGrid}>
                <div className={styles.inputGroup}>
                  <label htmlFor="customStart" className={styles.inputLabel}>Dari</label>
                  <input
                    id="customStart"
                    type="date"
                    className={styles.dateInput}
                    value={customStart}
                    onChange={(e) => {
                      setCustomStart(e.target.value);
                      setActiveShortcut('custom');
                    }}
                    required
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label htmlFor="customEnd" className={styles.inputLabel}>Ke</label>
                  <input
                    id="customEnd"
                    type="date"
                    className={styles.dateInput}
                    value={customEnd}
                    onChange={(e) => {
                      setCustomEnd(e.target.value);
                      setActiveShortcut('custom');
                    }}
                    required
                  />
                </div>
              </div>
              <button 
                type="submit" 
                className={styles.applyButton}
                disabled={!customStart || !customEnd}
              >
                Terapkan
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
