// src/components/Header.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import NotificationCenter from './NotificationCenter'; // NotificationCenter'ı import edin
import ThemeToggle from './ThemeToggle'; // ThemeToggle'ı import edin

const Header = ({ session, userRole }) => {
  const [userName, setUserName] = useState('');
  
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
      padding: '15px 20px',
      backgroundColor: 'var(--card-background)',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    }}>
      <Link to="/" style={{
        fontSize: '24px',
        fontWeight: 'bold',
        color: 'var(--highlight-color)',
        textDecoration: 'none',
      }}>
        Vade Takip Sistemi
      </Link>
      
      <div>
        {session ? (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* NotificationCenter bileşeni eklendi */}
            <NotificationCenter />
            
            {/* Tema değiştirme butonu */}
            <ThemeToggle style={{ marginLeft: '15px' }} />
            
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
            <button 
              onClick={handleLogout}
              style={{
                padding: '8px 12px',
                backgroundColor: 'var(--hover-color)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                color: 'var(--text-color)',
              }}
            >
              Çıkış
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* Tema değiştirme butonu */}
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