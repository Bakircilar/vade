import React from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';

const Header = ({ session }) => {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <header style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '15px 20px',
      backgroundColor: '#fff',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    }}>
      <Link to="/" style={{
        fontSize: '24px',
        fontWeight: 'bold',
        color: '#3498db',
        textDecoration: 'none',
      }}>
        Vade Takip Sistemi
      </Link>
      
      <div>
        {session ? (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ marginRight: '15px' }}>{session.user.email}</span>
            <button 
              onClick={handleLogout}
              style={{
                padding: '8px 12px',
                backgroundColor: '#f1f1f1',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Çıkış
            </button>
          </div>
        ) : (
          <Link 
            to="/login"
            style={{
              padding: '8px 12px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              textDecoration: 'none',
            }}
          >
            Giriş
          </Link>
        )}
      </div>
    </header>
  );
};

export default Header;