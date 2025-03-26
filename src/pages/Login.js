import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(''); // Added username field
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    
    // Validate inputs
    if (!email.trim()) {
      toast.error('E-posta adresi gereklidir');
      return;
    }
    
    if (!password.trim()) {
      toast.error('Şifre gereklidir');
      return;
    }
    
    if (!fullName.trim()) {
      toast.error('Ad Soyad gereklidir');
      return;
    }
    
    setLoading(true);

    try {
      // Login with email and password
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      // Check if user exists in the profile table
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();
        
      // If no profile exists or profile has no full_name, create/update the profile
      if ((profileError && profileError.code === 'PGRST116') || 
          (profileData && (!profileData.full_name || profileData.full_name !== fullName))) {
        
        // Update or create profile
        const { error: upsertError } = await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            full_name: fullName,
            updated_at: new Date().toISOString()
          });
          
        if (upsertError) {
          console.error('Profil güncelleme hatası:', upsertError);
          // Don't throw error here, just log it - allow login to continue
        }
        
        // Update user metadata
        const { error: updateError } = await supabase.auth.updateUser({
          data: { full_name: fullName }
        });
        
        if (updateError) {
          console.error('Kullanıcı verisi güncelleme hatası:', updateError);
        }
      }
      
      toast.success('Giriş başarılı!');
    } catch (error) {
      toast.error(error.message || 'Giriş yapılırken bir hata oluştu');
      console.error('Login error:', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      maxWidth: '400px',
      margin: '100px auto',
      padding: '30px',
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
    }}>
      <h2 style={{
        fontSize: '24px',
        fontWeight: 'bold',
        marginBottom: '20px',
        textAlign: 'center',
      }}>
        Vade Takip Sistemi
      </h2>
      
      <p style={{
        textAlign: 'center',
        marginBottom: '20px',
        color: '#666',
      }}>
        Hesabınıza giriş yapın
      </p>
      
      <form onSubmit={handleLogin}>
        <div className="form-group">
          <label htmlFor="email">E-posta</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="password">Şifre</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="fullName">Ad Soyad</label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            placeholder="Ad Soyad giriniz"
          />
          <small style={{ color: '#888' }}>Müşteri takip ve not eklemede kullanılır</small>
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary"
          style={{
            width: '100%',
            padding: '12px',
            marginTop: '10px',
          }}
        >
          {loading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
        </button>
      </form>
    </div>
  );
};

export default Login;