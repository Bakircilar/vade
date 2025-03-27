import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';

function Profile() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({
    full_name: '',
    phone: '',
    department: ''
  });
  const [myCustomers, setMyCustomers] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState([]);

  useEffect(() => {
    getProfile();
    fetchMyCustomers();
  }, []);

  // Profil bilgilerini getir
  const getProfile = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Kullanıcı bilgisi bulunamadı');
      }
      
      setUser(user);
      
      // Profil bilgilerini getir
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
        
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      if (data) {
        setProfile({
          full_name: data.full_name || user.user_metadata?.full_name || '',
          phone: data.phone || '',
          department: data.department || ''
        });
        
        setIsAdmin(data.role === 'admin');
      } else {
        // Profil yoksa, user_metadata'dan al
        setProfile({
          full_name: user.user_metadata?.full_name || '',
          phone: user.user_metadata?.phone || '',
          department: ''
        });
      }
    } catch (error) {
      console.error('Profil getirme hatası:', error);
      toast.error('Profil bilgileri yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  // Profilimi güncelle
  const updateProfile = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      // Profil bilgilerini güncelle
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          full_name: profile.full_name,
          phone: profile.phone,
          department: profile.department,
          updated_at: new Date().toISOString()
        });
        
      if (error) throw error;
      
      // User metadata'yı da güncelle
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          full_name: profile.full_name,
          phone: profile.phone
        }
      });
      
      if (updateError) throw updateError;
      
      toast.success('Profil başarıyla güncellendi');
    } catch (error) {
      console.error('Profil güncelleme hatası:', error);
      toast.error('Profil güncellenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  // Bana atanmış müşterileri getir
  const fetchMyCustomers = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Kullanıcı bilgisi bulunamadı');
      }
      
      // Kullanıcının rolünü kontrol et
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
        
      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }
      
      const isUserAdmin = profileData?.role === 'admin';
      setIsAdmin(isUserAdmin);
      
      // Kullanıcıya atanmış müşterileri getir
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('user_customer_assignments')
        .select(`
          customer_id,
          customers (
            id,
            code,
            name,
            sector_code,
            region_code
          )
        `)
        .eq('user_id', user.id);
        
      if (assignmentsError) throw assignmentsError;
      
      // Müşteri verilerini düzenle
      const myCustomersList = assignmentsData
        .filter(item => item.customers)
        .map(item => item.customers);
        
      setMyCustomers(myCustomersList);
      
      // Admin ise tüm müşterileri getir
      if (isUserAdmin) {
        const { data: allCustomersData, error: allCustomersError } = await supabase
          .from('customers')
          .select('id, code, name, sector_code, region_code')
          .limit(1000); // Limit ekledik
          
        if (allCustomersError) throw allCustomersError;
        
        setAllCustomers(allCustomersData);
        setFilteredCustomers(allCustomersData);
      }
    } catch (error) {
      console.error('Müşteri verisi getirme hatası:', error);
      toast.error('Müşteri bilgileri yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  // Müşteri ata/çıkar (sadece admin için)
  const toggleCustomerAssignment = async (customerId) => {
    if (!user || !isAdmin) return;
    
    try {
      // Bu müşteri kullanıcıya atanmış mı kontrol et
      const isAssigned = myCustomers.some(customer => customer.id === customerId);
      
      if (isAssigned) {
        // Atamayı kaldır
        const { error } = await supabase
          .from('user_customer_assignments')
          .delete()
          .match({ user_id: user.id, customer_id: customerId });
          
        if (error) throw error;
        
        // Listeden kaldır
        setMyCustomers(myCustomers.filter(customer => customer.id !== customerId));
        toast.info('Müşteri ataması kaldırıldı');
      } else {
        // Yeni atama yap
        const { error } = await supabase
          .from('user_customer_assignments')
          .insert({ user_id: user.id, customer_id: customerId });
          
        if (error) throw error;
        
        // Listeye ekle
        const newCustomer = allCustomers.find(customer => customer.id === customerId);
        if (newCustomer) {
          setMyCustomers([...myCustomers, newCustomer]);
          toast.success('Müşteri başarıyla atandı');
        }
      }
    } catch (error) {
      console.error('Müşteri atama hatası:', error);
      toast.error('Müşteri ataması yapılırken bir hata oluştu');
    }
  };

  // Müşteri ara
  const handleSearch = (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    
    if (!term.trim()) {
      setFilteredCustomers(allCustomers);
      return;
    }
    
    const searchLower = term.toLowerCase();
    const filtered = allCustomers.filter(customer => 
      customer.name.toLowerCase().includes(searchLower) ||
      customer.code.toLowerCase().includes(searchLower)
    );
    
    setFilteredCustomers(filtered);
  };

  if (loading && !user) {
    return <div className="loading">Yükleniyor...</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        Profilim
      </h1>
      
      <div className="card">
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
          Kullanıcı Bilgileri
        </h2>
        
        <form onSubmit={updateProfile}>
          <div className="form-group">
            <label htmlFor="email">E-posta</label>
            <input
              type="email"
              id="email"
              value={user?.email || ''}
              disabled
              style={{ background: '#f5f5f5' }}
            />
            <small style={{ color: '#888' }}>E-posta adresi değiştirilemez</small>
          </div>
          
          <div className="form-group">
            <label htmlFor="full_name">Ad Soyad</label>
            <input
              type="text"
              id="full_name"
              value={profile.full_name}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="phone">Telefon</label>
            <input
              type="text"
              id="phone"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="department">Departman</label>
            <input
              type="text"
              id="department"
              value={profile.department}
              onChange={(e) => setProfile({ ...profile, department: e.target.value })}
            />
          </div>
          
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Kaydediliyor...' : 'Bilgilerimi Güncelle'}
          </button>
          
          {isAdmin && (
            <div style={{ marginTop: '10px', padding: '8px', backgroundColor: '#e3f2fd', borderRadius: '4px', color: '#2c5282' }}>
              Yönetici hesabı kullanıyorsunuz. Tüm müşterileri görüntüleyebilir ve atayabilirsiniz.
            </div>
          )}
        </form>
      </div>
      
      {/* Müşteri Atama (Sadece admin için) */}
      {isAdmin && (
        <div className="card" style={{ marginTop: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
            Müşteri Atama Yönetimi
          </h2>
          
          <div style={{ marginBottom: '20px' }}>
            <input
              type="text"
              placeholder="Müşteri adı veya kodu ile ara..."
              value={searchTerm}
              onChange={handleSearch}
              style={{ width: '100%', padding: '8px' }}
            />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Atanmış Müşteriler */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
                Bana Atanmış Müşteriler ({myCustomers.length})
              </h3>
              
              <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #eee', padding: '10px' }}>
                {myCustomers.length > 0 ? (
                  myCustomers.map(customer => (
                    <div 
                      key={customer.id} 
                      style={{ 
                        padding: '10px', 
                        borderBottom: '1px solid #eee', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center' 
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{customer.name}</div>
                        <div style={{ fontSize: '12px', color: '#888' }}>{customer.code}</div>
                      </div>
                      
                      <button 
                        onClick={() => toggleCustomerAssignment(customer.id)}
                        className="btn btn-danger"
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                      >
                        Kaldır
                      </button>
                    </div>
                  ))
                ) : (
                  <p style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                    Henüz atanmış müşteri bulunmuyor
                  </p>
                )}
              </div>
            </div>
            
            {/* Tüm Müşteriler */}
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
                Tüm Müşteriler ({filteredCustomers.length})
              </h3>
              
              <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #eee', padding: '10px' }}>
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map(customer => {
                    const isAssigned = myCustomers.some(c => c.id === customer.id);
                    
                    return (
                      <div 
                        key={customer.id} 
                        style={{ 
                          padding: '10px', 
                          borderBottom: '1px solid #eee', 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          backgroundColor: isAssigned ? '#f0f8ff' : 'transparent'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 'bold' }}>{customer.name}</div>
                          <div style={{ fontSize: '12px', color: '#888' }}>{customer.code}</div>
                        </div>
                        
                        <button 
                          onClick={() => toggleCustomerAssignment(customer.id)}
                          className={`btn ${isAssigned ? 'btn-warning' : 'btn-success'}`}
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                        >
                          {isAssigned ? 'Kaldır' : 'Ata'}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                    Arama kriterine uygun müşteri bulunamadı
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Normal kullanıcılar için müşteri listesi */}
      {!isAdmin && (
        <div className="card" style={{ marginTop: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
            Bana Atanmış Müşteriler
          </h2>
          
          {myCustomers.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Müşteri Kodu</th>
                  <th>Müşteri Adı</th>
                  <th>Sektör</th>
                  <th>Bölge</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {myCustomers.map(customer => (
                  <tr key={customer.id}>
                    <td>{customer.code}</td>
                    <td>{customer.name}</td>
                    <td>{customer.sector_code || '-'}</td>
                    <td>{customer.region_code || '-'}</td>
                    <td>
                      <a 
                        href={`/customers/${customer.id}`}
                        className="btn btn-primary"
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                      >
                        Detay
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
              Henüz size atanmış müşteri bulunmuyor. Yöneticinize başvurun.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default Profile;