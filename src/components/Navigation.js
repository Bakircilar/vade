import React from 'react';
import { NavLink } from 'react-router-dom';

const Navigation = ({ userRole }) => {
  const navStyle = {
    width: '240px',
    backgroundColor: '#fff',
    boxShadow: '1px 0 4px rgba(0, 0, 0, 0.1)',
    padding: '20px 0',
  };

  const linkStyle = {
    display: 'block',
    padding: '12px 20px',
    color: '#333',
    textDecoration: 'none',
    borderLeft: '4px solid transparent',
  };

  const activeLinkStyle = {
    borderLeft: '4px solid #3498db',
    backgroundColor: '#f0f8ff',
    color: '#3498db',
    fontWeight: 'bold',
  };

  const sectionStyle = {
    marginTop: '20px',
    paddingTop: '10px',
    borderTop: '1px solid #eee',
  };

  const sectionTitleStyle = {
    padding: '0 20px',
    fontSize: '12px',
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: '10px',
  };

  return (
    <nav style={navStyle}>
      {/* Ana Menü Öğeleri */}
      <NavLink 
        to="/" 
        style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
        end
      >
        Ana Sayfa
      </NavLink>
      
      <NavLink 
        to="/customers" 
        style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
      >
        Müşteriler
      </NavLink>
      
      <NavLink 
        to="/payments" 
        style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
      >
        Vade Takip
      </NavLink>
      
      <NavLink 
        to="/import" 
        style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
      >
        Veri İçe Aktar
      </NavLink>
      
      {/* Hesap Bölümü */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Hesap</div>
        
        <NavLink 
          to="/profile" 
          style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
        >
          Profilim
        </NavLink>
        
        {/* Sadece admin kullanıcılar için */}
        {userRole === 'admin' && (
          <>
            <NavLink 
              to="/user-assignments" 
              style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
            >
              Müşteri Atamaları
            </NavLink>
            
            <NavLink 
              to="/auth-manager" 
              style={({ isActive }) => isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle}
            >
              Kullanıcı Yönetimi
            </NavLink>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navigation;