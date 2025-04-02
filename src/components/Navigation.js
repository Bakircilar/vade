// src/components/Navigation.js
import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';

const Navigation = ({ userRole, isMuhasebe, isMenuOpen, closeMenu }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const toggleMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };
  
  const navStyle = {
    width: '100%',
    backgroundColor: 'var(--card-background)',
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.1)',
    zIndex: 100,
  };

  const mobileNavContainerStyle = {
    position: 'fixed',
    top: '60px', // Header yüksekliğine göre ayarlayın
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 99,
    display: isMenuOpen ? 'block' : 'none',
  };

  const desktopMenuStyle = {
    width: '240px',
    backgroundColor: 'var(--card-background)',
    boxShadow: '1px 0 4px rgba(0, 0, 0, 0.1)',
    padding: '20px 0',
    display: 'none', // Mobilde varsayılan olarak gizli
    '@media (min-width: 768px)': {
      display: 'block', // Masaüstünde göster
    },
  };

  const mobileMenuStyle = {
    width: '85%',
    maxWidth: '300px',
    height: '100%',
    backgroundColor: 'var(--card-background)',
    boxShadow: '1px 0 4px rgba(0, 0, 0, 0.1)',
    padding: '20px 0',
    position: 'fixed',
    top: '60px', // Header yüksekliğine göre ayarlayın
    left: isMenuOpen ? '0' : '-100%',
    transition: 'left 0.3s ease',
    overflowY: 'auto',
    zIndex: 100,
  };

  const hamburgerStyle = {
    display: 'block',
    padding: '10px 15px',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    fontSize: '24px',
    color: 'var(--text-color)',
    '@media (min-width: 768px)': {
      display: 'none', // Masaüstünde gizle
    },
  };

  const linkStyle = {
    display: 'block',
    padding: '12px 20px',
    color: 'var(--text-color)',
    textDecoration: 'none',
    borderLeft: '4px solid transparent',
  };

  const activeLinkStyle = {
    borderLeft: '4px solid var(--highlight-color)',
    backgroundColor: 'var(--hover-color)',
    color: 'var(--highlight-color)',
    fontWeight: 'bold',
  };

  const sectionStyle = {
    marginTop: '20px',
    paddingTop: '10px',
    borderTop: '1px solid var(--border-color)',
  };

  const sectionTitleStyle = {
    padding: '0 20px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    marginBottom: '10px',
  };

  // Hem mobil hem de masaüstü menülerinde kullanılmak üzere menü bağlantıları
  const renderMenuLinks = () => (
    <>
      {/* Ana Menü Öğeleri */}
      <NavLink 
        to="/" 
        style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
        end
        onClick={closeMenu}
      >
        Ana Sayfa
      </NavLink>
      
      <NavLink 
        to="/customers" 
        style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
        onClick={closeMenu}
      >
        Müşteriler
      </NavLink>
      
      <NavLink 
        to="/payments" 
        style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
        onClick={closeMenu}
      >
        Vade Takip
      </NavLink>
      
      <NavLink 
        to="/import" 
        style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
        onClick={closeMenu}
      >
        Veri İçe Aktar
      </NavLink>
      
      {/* Not Raporları - sadece admin ve muhasebe kullanıcılar için */}
      {(userRole === 'admin' || userRole === 'muhasebe') && (
        <NavLink 
          to="/notes-report" 
          style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
          onClick={closeMenu}
        >
          Not Raporları
        </NavLink>
      )}
      
      {/* Hesap Bölümü */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Hesap</div>
        
        <NavLink 
          to="/profile" 
          style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
          onClick={closeMenu}
        >
          Profilim
        </NavLink>
        
        {/* Sadece admin ve muhasebe kullanıcılar için */}
        {(userRole === 'admin' || userRole === 'muhasebe') && (
          <>
            <NavLink 
              to="/user-assignments" 
              style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
              onClick={closeMenu}
            >
              Müşteri Atamaları
            </NavLink>
          </>
        )}
        
        {/* Sadece admin kullanıcılar için */}
        {userRole === 'admin' && (
          <NavLink 
            to="/auth-manager" 
            style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
            onClick={closeMenu}
          >
            Kullanıcı Yönetimi
          </NavLink>
        )}
      </div>
      
      {/* Rol göstergesi */}
      <div style={{
        marginTop: '20px',
        padding: '10px 20px',
        backgroundColor: 'var(--hover-color)',
        fontSize: '13px',
        color: 'var(--text-secondary)'
      }}>
        Rol: {userRole === 'admin' ? 'Yönetici' : 
              userRole === 'muhasebe' ? 'Muhasebe' : 'Kullanıcı'}
      </div>
    </>
  );

  return (
    <>
      {/* Mobil Hamburger Butonu */}
      <button 
        style={hamburgerStyle}
        onClick={toggleMenu}
        aria-label="Menüyü Aç/Kapat"
      >
        {isMobileMenuOpen ? '✕' : '☰'}
      </button>
      
      {/* Mobil Arka Plan Overlay */}
      {isMenuOpen && (
        <div style={mobileNavContainerStyle} onClick={closeMenu}></div>
      )}
      
      {/* Mobil Menü */}
      <nav style={{...navStyle, ...mobileMenuStyle}}>
        {renderMenuLinks()}
      </nav>
      
      {/* Masaüstü Menü */}
      <nav style={{...navStyle, ...desktopMenuStyle}}>
        {renderMenuLinks()}
      </nav>
    </>
  );
};

export default Navigation;