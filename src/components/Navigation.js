import React from 'react';
import { NavLink } from 'react-router-dom';

const Navigation = () => {
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

  return (
    <nav style={navStyle}>
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
    </nav>
  );
};

export default Navigation;