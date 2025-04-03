// src/components/Navigation.js
import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';

const Navigation = ({ userRole, isMuhasebe, isMenuOpen, closeMenu }) => {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  
  // Ekran boyutu değişikliklerini izle
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  // Büyük ekranlarda menü daima açık
  const isMobile = windowWidth < 768;

  const navStyle = {
    width: isMobile ? '85%' : '240px',
    maxWidth: isMobile ? '300px' : 'none',
    backgroundColor: 'var(--card-background)',
    boxShadow: '1px 0 4px rgba(0, 0, 0, 0.1)',
    zIndex: 100,
    padding: '20px 0',
    height: isMobile ? '100%' : 'auto',
    position: isMobile ? 'fixed' : 'relative',
    left: isMobile ? (isMenuOpen ? '0' : '-100%') : '0',
    transition: 'left 0.3s ease',
    overflowY: 'auto'
  };

  const overlayStyle = {
    position: 'fixed',
    top: '60px', // Header yüksekliğine göre ayarlayın
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 99,
    display: isMobile && isMenuOpen ? 'block' : 'none'
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

  const handleLinkClick = () => {
    if (isMobile && closeMenu) {
      closeMenu();
    }
  };

  return (
    <>
      {/* Mobil Arka Plan Overlay */}
      {isMobile && (
        <div style={overlayStyle} onClick={closeMenu}></div>
      )}
      
      {/* Navigasyon Menüsü */}
      <nav style={navStyle}>
        {/* Ana Menü Öğeleri */}
        <NavLink 
          to="/" 
          style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
          end
          onClick={handleLinkClick}
        >
          Ana Sayfa
        </NavLink>
        
        <NavLink 
          to="/customers" 
          style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
          onClick={handleLinkClick}
        >
          Müşteriler
        </NavLink>
        
        <NavLink 
          to="/payments" 
          style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
          onClick={handleLinkClick}
        >
          Vade Takip
        </NavLink>
        
        {/* Hatırlatıcı Takvimi - tüm kullanıcılar için */}
        <NavLink 
          to="/calendar" 
          style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
          onClick={handleLinkClick}
        >
          Hatırlatıcı Takvimi
        </NavLink>
        
        {/* Veri İçe Aktar menü öğesi - sadece admin ve muhasebe için */}
        {(userRole === 'admin' || isMuhasebe) && (
          <NavLink 
            to="/import" 
            style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
            onClick={handleLinkClick}
          >
            Veri İçe Aktar
          </NavLink>
        )}
        
        {/* Not Raporları - sadece admin ve muhasebe kullanıcılar için */}
        {(userRole === 'admin' || isMuhasebe) && (
          <NavLink 
            to="/notes-report" 
            style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
            onClick={handleLinkClick}
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
            onClick={handleLinkClick}
          >
            Profilim
          </NavLink>
          
          {/* Sadece admin ve muhasebe kullanıcılar için */}
          {(userRole === 'admin' || isMuhasebe) && (
            <NavLink 
              to="/user-assignments" 
              style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
              onClick={handleLinkClick}
            >
              Müşteri Atamaları
            </NavLink>
          )}
          
          {/* Sadece admin kullanıcılar için */}
          {userRole === 'admin' && (
            <NavLink 
              to="/auth-manager" 
              style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
              onClick={handleLinkClick}
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
      </nav>
    </>
  );
};

export default Navigation;