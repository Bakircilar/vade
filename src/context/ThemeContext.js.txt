// src/context/ThemeContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';

// Tema Bağlamı oluştur
const ThemeContext = createContext();

// Dark Mode teması için CSS değişkenleri
const darkThemeColors = {
  '--background-color': '#121212',
  '--card-background': '#1e1e1e',
  '--text-color': '#e0e0e0',
  '--text-secondary': '#a0a0a0',
  '--border-color': '#333333',
  '--highlight-color': '#3498db',
  '--success-color': '#2ecc71',
  '--warning-color': '#f39c12',
  '--danger-color': '#e74c3c',
  '--info-color': '#3498db',
  '--hover-color': '#2c2c2c',
};

// Light Mode teması için CSS değişkenleri
const lightThemeColors = {
  '--background-color': '#f5f5f5',
  '--card-background': '#ffffff',
  '--text-color': '#333333',
  '--text-secondary': '#666666',
  '--border-color': '#dddddd',
  '--highlight-color': '#3498db',
  '--success-color': '#2ecc71',
  '--warning-color': '#f39c12',
  '--danger-color': '#e74c3c',
  '--info-color': '#3498db',
  '--hover-color': '#f0f0f0',
};

// Tema Provider bileşeni
export const ThemeProvider = ({ children }) => {
  // Local storage'dan tema tercihini al veya varsayılan olarak light kullan
  const getInitialTheme = () => {
    const savedTheme = localStorage.getItem('vade-takip-theme');
    return savedTheme || 'light';
  };

  const [theme, setTheme] = useState(getInitialTheme);

  // Tema değiştiğinde uygulanacak işlev
  const toggleTheme = () => {
    setTheme(prevTheme => {
      const newTheme = prevTheme === 'light' ? 'dark' : 'light';
      localStorage.setItem('vade-takip-theme', newTheme);
      return newTheme;
    });
  };
  
  // Tema değiştiğinde CSS değişkenlerini uygula
  useEffect(() => {
    const root = document.documentElement;
    const colors = theme === 'dark' ? darkThemeColors : lightThemeColors;
    
    Object.entries(colors).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });
    
    // Body sınıflarını ayarla
    document.body.classList.remove('light-theme', 'dark-theme');
    document.body.classList.add(`${theme}-theme`);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Tema kullanım kancası
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};