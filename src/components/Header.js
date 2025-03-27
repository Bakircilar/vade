import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import NotificationCenter from './NotificationCenter';
import ThemeToggle from './ThemeToggle';

const Header = ({ session, userRole, toggleMobileMenu, isMobileMenuOpen }) => {
  const [userName, setUserName] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  useEffect(() => {
    // Responsive tasarım için ekran boyutu izleyici
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  useEffect(() => {
    // If session exists, try to get the user's name
    if (session) {
      // First check user_metadata
      const metadataName = session.user?.user_metadata?.full_name;
      
      if (metadataName) {
        setUserName(metadataName);
      } else {
        // Try to get from profiles table
        fetchUserProfile(session.user.id);
      }
    }
  }, [session]);
  
  const fetchUserProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single();
        
      if (!error && data && data.full_name) {
        setUserName(data.full_name);
      }
    } catch (error) {
      console.error('Profil bilgisi getirme hatası:', error);
    }
  };
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };
  
  // Function to get role display text
  const getRoleDisplay = (role) => {
    switch(role) {
      case 'admin':
        return 'Yönetici';
      case 'muhasebe':
        return 'Muhasebe';
      default:
        return 'Kullanıcı';
    }
  };

  return (
    <header style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '15px 10px',
      backgroundColor: 'var(--card-background)',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    }}>
      {/* Hamburger Menu Button (Mobile Only) */}
      {session && isMobile && (
        <button 
          onClick={toggleMobileMenu}
          aria-label="Toggle Menu"
          style={{
            background: 'none',
            border: 'none',
            fontSize: '24px',
            padding: '8px',
            marginRight: '5px',
            cursor: 'pointer',
            color: 'var(--text-color)',
          }}
        >
          {isMobileMenuOpen ? '✕' : '☰'}
        </button>
      )}
      
      <Link to="/" style={{
        fontSize: isMobile ? '18px' : '24px',
        fontWeight: 'bold',
        color: 'var(--highlight-color)',
        textDecoration: 'none',
        whiteSpace: isMobile ? 'nowrap' : 'normal',
      }}>
        {isMobile ? 'Vade Takip' : 'Vade Takip Sistemi'}
      </Link>
      
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {session ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {/* NotificationCenter */}
              <NotificationCenter />
              
              {/* Theme Toggle */}
              <ThemeToggle style={{ marginLeft: '10px' }} />
              
              {/* User Info - Hide on very small screens */}
              {!isMobile && (
                <div style={{ marginLeft: '15px', marginRight: '15px', textAlign: 'right' }}>
                  <div style={{ fontWeight: 'bold' }}>{userName || session.user.email}</div>
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#888',
                    backgroundColor: userRole === 'admin' ? '#e3f2fd' : userRole === 'muhasebe' ? '#e8f5e9' : '#f5f5f5',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    display: 'inline-block'
                  }}>
                    {getRoleDisplay(userRole)}
                  </div>
                </div>
              )}
              
              {/* Logout Button */}
              <button 
                onClick={handleLogout}
                style={{
                  padding: isMobile ? '8px' : '8px 12px',
                  backgroundColor: 'var(--hover-color)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: 'var(--text-color)',
                  fontSize: isMobile ? '13px' : 'inherit',
                }}
              >
                {isMobile ? 'Çıkış' : 'Çıkış Yap'}
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* Theme Toggle */}
            <ThemeToggle />
            
            <Link 
              to="/login"
              style={{
                marginLeft: '15px',
                padding: '8px 12px',
                backgroundColor: 'var(--highlight-color)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                textDecoration: 'none',
              }}
            >
              Giriş
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;