import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';

const AuthManager = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'user'
  });
  
  // Mevcut kullanıcıyı kontrol et
  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setIsAdmin(false);
          return;
        }
        
        // Profil tablosunu kontrol et
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();
            
          if (error && error.code !== 'PGRST116') {
            console.error('Profil kontrolü hatası:', error);
            setIsAdmin(false);
            return;
          }
          
          setIsAdmin(data?.role === 'admin');
        } catch (error) {
          console.error('Profil kontrolü hatası:', error);
          setIsAdmin(false);
        }
      } catch (error) {
        console.error('Kullanıcı kontrolü hatası:', error);
        setIsAdmin(false);
      }
    };
    
    checkAdminStatus();
    loadUsers();
  }, []);
  
  // Kullanıcıları yükle
  const loadUsers = async () => {
    setLoading(true);
    try {
      // Önce auth tablosundan kullanıcıları çek
      try {
        // Admin API'sini dene
        const { data, error } = await supabase.auth.admin.listUsers();
        
        if (error) {
          console.error('Admin API hatası:', error);
          throw error;
        }
        
        const authUsers = data.users || [];
        
        // Profil tablosundan rolleri al
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, role');
          
        if (profileError) {
          console.warn('Profil tablosu hatası:', profileError);
        }
        
        // Kullanıcı bilgilerini ve rollerini birleştir
        const usersWithRoles = authUsers.map(user => {
          const profile = profiles?.find(p => p.id === user.id);
          return {
            id: user.id,
            email: user.email,
            created_at: user.created_at,
            last_sign_in_at: user.last_sign_in_at,
            full_name: user.user_metadata?.full_name || '',
            role: profile?.role || 'user'
          };
        });
        
        setUsers(usersWithRoles);
      } catch (authError) {
        console.warn('Auth kullanıcıları çekilemedi, profil tablosunu deniyorum:', authError);
        
        // Alternatif olarak profil tablosundan al
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('*');
          
        if (profileError) {
          throw profileError;
        }
        
        setUsers(profiles);
      }
    } catch (error) {
      console.error('Kullanıcı yükleme hatası:', error);
      toast.error('Kullanıcılar yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };
  
  // Rol değiştirme
  const changeRole = async (userId, newRole) => {
    try {
      setLoading(true);
      
      // Profil tablosunu güncelle
      const { error } = await supabase
        .from('profiles')
        .upsert({ 
          id: userId, 
          role: newRole,
          updated_at: new Date().toISOString()
        });
        
      if (error) throw error;
      
      // Kullanıcıları güncelle
      setUsers(users.map(user => 
        user.id === userId ? { ...user, role: newRole } : user
      ));
      
      toast.success('Kullanıcı rolü güncellendi');
    } catch (error) {
      console.error('Rol değiştirme hatası:', error);
      toast.error('Rol değiştirilirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };
  
  // Yeni kullanıcı oluşturma
  const createUser = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      if (!newUser.email || !newUser.password) {
        toast.error('E-posta ve şifre gereklidir');
        return;
      }
      
      // Kullanıcı oluştur
      const { data, error } = await supabase.auth.admin.createUser({
        email: newUser.email,
        password: newUser.password,
        email_confirm: true,
        user_metadata: {
          full_name: newUser.fullName
        }
      });
      
      if (error) {
        // Admin API çalışmazsa alternatif yöntem
        if (error.message.includes('admin API')) {
          toast.error("Yönetici API'si kullanılamıyor. Lütfen Supabase Dashboard üzerinden kullanıcı oluşturun.");
          console.error('Admin API kullanılamıyor:', error);
          return;
        }
        
        throw error;
      }
      
      // Profil tablosuna ekle
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          full_name: newUser.fullName,
          role: newUser.role,
          created_at: new Date().toISOString()
        });
        
      if (profileError) throw profileError;
      
      toast.success('Kullanıcı başarıyla oluşturuldu');
      
      // Formu sıfırla
      setNewUser({
        email: '',
        password: '',
        fullName: '',
        role: 'user'
      });
      
      // Kullanıcı listesini yenile
      await loadUsers();
    } catch (error) {
      console.error('Kullanıcı oluşturma hatası:', error);
      toast.error(`Kullanıcı oluşturulurken bir hata oluştu: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  // Admin değilse erişimi engelle
  if (!isAdmin) {
    return (
      <div className="card">
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
          Erişim Engellendi
        </h2>
        <p>Bu sayfaya erişmek için yönetici haklarına sahip olmanız gerekiyor.</p>
      </div>
    );
  }
  
  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        Kullanıcı Yönetimi
      </h1>
      
      {/* Yeni Kullanıcı Formu */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
          Yeni Kullanıcı Oluştur
        </h2>
        
        <form onSubmit={createUser}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
            <div className="form-group">
              <label htmlFor="email">E-posta*</label>
              <input
                type="email"
                id="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Şifre*</label>
              <input
                type="password"
                id="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                required
                minLength={6}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="fullName">Ad Soyad</label>
              <input
                type="text"
                id="fullName"
                value={newUser.fullName}
                onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="role">Rol</label>
              <select
                id="role"
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              >
                <option value="user">Kullanıcı</option>
                <option value="admin">Yönetici</option>
              </select>
            </div>
          </div>
          
          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ marginTop: '15px' }}
            disabled={loading}
          >
            {loading ? 'Oluşturuluyor...' : 'Kullanıcı Oluştur'}
          </button>
          
          <div style={{ marginTop: '10px', fontSize: '13px', color: '#666' }}>
            * Admin API erişiminiz yoksa kullanıcı oluşturamayabilirsiniz. Bu durumda Supabase Dashboard üzerinden kullanıcı oluşturun.
          </div>
        </form>
      </div>
      
      {/* Kullanıcı Listesi */}
      <div className="card">
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Kullanıcı Listesi</span>
          <button 
            onClick={loadUsers} 
            className="btn"
            style={{ padding: '4px 10px', fontSize: '14px' }}
            disabled={loading}
          >
            {loading ? 'Yükleniyor...' : 'Yenile'}
          </button>
        </h2>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>Kullanıcılar yükleniyor...</div>
        ) : users.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>E-posta</th>
                  <th>Ad Soyad</th>
                  <th>Rol</th>
                  <th>Oluşturulma Tarihi</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>{user.full_name}</td>
                    <td>
                      {user.role === 'admin' ? (
                        <span className="badge badge-info">Yönetici</span>
                      ) : (
                        <span className="badge">Kullanıcı</span>
                      )}
                    </td>
                    <td>
                      {user.created_at ? new Date(user.created_at).toLocaleDateString('tr-TR') : '-'}
                    </td>
                    <td>
                      <select
                        value={user.role || 'user'}
                        onChange={(e) => changeRole(user.id, e.target.value)}
                        disabled={loading}
                        style={{ marginRight: '10px' }}
                      >
                        <option value="user">Kullanıcı</option>
                        <option value="admin">Yönetici</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
            Henüz kullanıcı bulunmuyor veya kullanıcılar yüklenemedi.
          </p>
        )}
      </div>
    </div>
  );
};

export default AuthManager;