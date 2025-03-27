import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';

const UserAssignments = () => {
  const [users, setUsers] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedSector, setSelectedSector] = useState('');
  const [assignedCustomers, setAssignedCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [adminRights, setAdminRights] = useState(false);

  useEffect(() => {
    checkAdmin();
    fetchUsers();
    fetchSectors();
  }, []);

  // Admin kullanıcı olup olmadığını kontrol et
  const checkAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Oturum açmış kullanıcı bulunamadı');
        return;
      }
      
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
        
      if (error && error.code !== 'PGRST116') {
        console.error('Rol kontrolü hatası:', error);
        return;
      }
      
      const isAdmin = data?.role === 'admin';
      setAdminRights(isAdmin);
      
      if (!isAdmin) {
        toast.warning('Bu sayfaya erişmek için yönetici hakları gerekiyor');
      }
    } catch (error) {
      console.error('Admin kontrolü hatası:', error);
    }
  };

  // Kullanıcıları getir
  const fetchUsers = async () => {
    try {
      setLoading(true);
      
      // Tüm auth kullanıcılarını getir
      const { data: { data: authUsers }, error: authError } = await supabase.auth.admin.listUsers();
      
      if (authError) {
        console.error('Auth kullanıcı listesi alınamadı:', authError);
        // Supabase'in auth.admin.listUsers API'sı kullanılamıyorsa, alternatif yöntem
        // profiles tablosundan kullanıcı bilgilerini çek
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email');
          
        if (error) throw error;
        
        setUsers(data || []);
        return;
      }
      
      setUsers(authUsers.map(user => ({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.email
      })));
      
      console.log('Kullanıcılar yüklendi:', authUsers.length);
    } catch (error) {
      console.error('Kullanıcı yükleme hatası:', error);
      toast.error('Kullanıcılar yüklenirken bir hata oluştu');
      
      // Hata durumunda alternatif yöntem - profiles tablosundan yükle
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name');
        
        // Auth verisi olmadığı için email alanını atlayacağız
        setUsers(data || []);
        console.log('Profiles tablosundan kullanıcılar yüklendi:', data?.length || 0);
      } catch (profilesError) {
        console.error('Profiles yükleme hatası:', profilesError);
      }
    } finally {
      setLoading(false);
    }
  };

  // Sektörleri getir (benzersiz sektör kodları)
  const fetchSectors = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('customers')
        .select('sector_code');
        
      if (error) throw error;
      
      // Benzersiz sektör kodlarını bul
      const uniqueSectors = [...new Set(data.map(item => item.sector_code))].filter(Boolean);
      
      // Sektör kodlarını sırala
      uniqueSectors.sort();
      
      setSectors(uniqueSectors);
    } catch (error) {
      console.error('Sektör yükleme hatası:', error);
      toast.error('Sektörler yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  // Bir kullanıcı seçildiğinde o kullanıcının atanmış müşterilerini getir
  const handleUserSelect = async (userId) => {
    setSelectedUser(userId);
    setSelectedSector('');
    
    if (!userId) {
      setAssignedCustomers([]);
      return;
    }
    
    try {
      setListLoading(true);
      
      // Önce user_customer_assignments tablosunun var olup olmadığını kontrol et
      const { count, error: tableError } = await supabase
        .from('user_customer_assignments')
        .select('*', { count: 'exact', head: true });
        
      if (tableError) {
        console.error('Tablo kontrolü hatası:', tableError);
        toast.error('user_customer_assignments tablosu bulunamadı veya oluşturulmamış');
        setListLoading(false);
        return;
      }
      
      // Kullanıcıya atanmış müşteri ID'lerini getir
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('user_customer_assignments')
        .select('customer_id')
        .eq('user_id', userId);
        
      if (assignmentError) throw assignmentError;
      
      // Atanmış müşteri ID'lerini elde et
      const customerIds = assignmentData.map(item => item.customer_id);
      
      // Bu ID'lere göre müşteri bilgilerini getir
      if (customerIds.length > 0) {
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('id, code, name, sector_code')
          .in('id', customerIds);
          
        if (customerError) throw customerError;
        
        setAssignedCustomers(customerData);
      } else {
        setAssignedCustomers([]);
      }
    } catch (error) {
      console.error('Atama yükleme hatası:', error);
      toast.error('Müşteri atamaları yüklenirken bir hata oluştu');
    } finally {
      setListLoading(false);
    }
  };

  // Sektör seçildiğinde o sektöre ait müşterileri getir
  const handleSectorSelect = async (sectorCode) => {
    setSelectedSector(sectorCode);
    
    if (!sectorCode) {
      setCustomers([]);
      return;
    }
    
    try {
      setListLoading(true);
      
      const { data, error } = await supabase
        .from('customers')
        .select('id, code, name, sector_code')
        .eq('sector_code', sectorCode);
        
      if (error) throw error;
      
      setCustomers(data);
    } catch (error) {
      console.error('Sektör müşterileri yükleme hatası:', error);
      toast.error('Sektör müşterileri yüklenirken bir hata oluştu');
    } finally {
      setListLoading(false);
    }
  };

  // Seçili sektördeki tüm müşterileri seçili kullanıcıya ata
  const assignAllCustomers = async () => {
    if (!selectedUser || !selectedSector) {
      toast.warning('Lütfen bir kullanıcı ve sektör seçin');
      return;
    }
    
    try {
      setLoading(true);
      
      // Seçili sektördeki tüm müşteri ID'lerini al
      const customerIds = customers.map(customer => customer.id);
      
      // Mevcut atamaları kontrol et
      const { data: existingAssignments, error: checkError } = await supabase
        .from('user_customer_assignments')
        .select('customer_id')
        .eq('user_id', selectedUser)
        .in('customer_id', customerIds);
        
      if (checkError) throw checkError;
      
      // Zaten atanmış müşteri ID'lerini bul
      const alreadyAssignedIds = existingAssignments.map(item => item.customer_id);
      
      // Yeni atanacak müşteri ID'lerini bul
      const newAssignmentIds = customerIds.filter(id => !alreadyAssignedIds.includes(id));
      
      if (newAssignmentIds.length === 0) {
        toast.info('Bu sektördeki tüm müşteriler zaten bu kullanıcıya atanmış');
        return;
      }
      
      // Yeni atamaları oluştur
      const newAssignments = newAssignmentIds.map(customer_id => ({
        user_id: selectedUser,
        customer_id,
        created_at: new Date().toISOString(),
      }));
      
      // Toplu olarak atamaları ekle
      const { error: insertError } = await supabase
        .from('user_customer_assignments')
        .insert(newAssignments);
        
      if (insertError) throw insertError;
      
      toast.success(`${newAssignmentIds.length} müşteri başarıyla atandı`);
      
      // Atanmış müşteri listesini güncelle
      handleUserSelect(selectedUser);
    } catch (error) {
      console.error('Toplu atama hatası:', error);
      toast.error('Müşteriler atanırken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  // Seçili kullanıcıdan seçili sektördeki tüm müşterileri kaldır
  const removeAllCustomers = async () => {
    if (!selectedUser || !selectedSector) {
      toast.warning('Lütfen bir kullanıcı ve sektör seçin');
      return;
    }
    
    try {
      setLoading(true);
      
      // Seçili sektördeki ve atanmış listedeki müşteri ID'lerini al
      const sectorCustomerIds = customers.map(customer => customer.id);
      
      // Bu sektördeki atanmış müşterileri bul
      const sectorAssignedCustomers = assignedCustomers.filter(
        customer => customer.sector_code === selectedSector
      );
      
      if (sectorAssignedCustomers.length === 0) {
        toast.info('Bu sektörden atanmış müşteri bulunmuyor');
        return;
      }
      
      const customerIdsToRemove = sectorAssignedCustomers.map(customer => customer.id);
      
      // Atamaları kaldır
      const { error } = await supabase
        .from('user_customer_assignments')
        .delete()
        .eq('user_id', selectedUser)
        .in('customer_id', customerIdsToRemove);
        
      if (error) throw error;
      
      toast.success(`${customerIdsToRemove.length} müşteri ataması kaldırıldı`);
      
      // Atanmış müşteri listesini güncelle
      handleUserSelect(selectedUser);
    } catch (error) {
      console.error('Toplu atama kaldırma hatası:', error);
      toast.error('Müşteri atamaları kaldırılırken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  // Tek tek müşteri ata/kaldır
  const toggleCustomerAssignment = async (customerId) => {
    if (!selectedUser) {
      toast.warning('Lütfen bir kullanıcı seçin');
      return;
    }
    
    try {
      setListLoading(true);
      
      // Müşteri zaten atanmış mı kontrol et
      const isAssigned = assignedCustomers.some(customer => customer.id === customerId);
      
      if (isAssigned) {
        // Atamayı kaldır
        const { error } = await supabase
          .from('user_customer_assignments')
          .delete()
          .eq('user_id', selectedUser)
          .eq('customer_id', customerId);
          
        if (error) throw error;
        
        // Atanmış listesinden kaldır
        setAssignedCustomers(assignedCustomers.filter(c => c.id !== customerId));
        toast.info('Müşteri ataması kaldırıldı');
      } else {
        // Yeni atama ekle
        const { error } = await supabase
          .from('user_customer_assignments')
          .insert({
            user_id: selectedUser,
            customer_id: customerId,
            created_at: new Date().toISOString()
          });
          
        if (error) throw error;
        
        // Müşteri bilgisini bul
        const customer = customers.find(c => c.id === customerId);
        
        // Atanmış listeye ekle
        setAssignedCustomers([...assignedCustomers, customer]);
        toast.success('Müşteri başarıyla atandı');
      }
    } catch (error) {
      console.error('Atama değiştirme hatası:', error);
      toast.error('Müşteri ataması değiştirilirken bir hata oluştu');
    } finally {
      setListLoading(false);
    }
  };

  // Admin değilse erişimi engelle
  if (!adminRights) {
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
    <div className="card">
      <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
        Sektör Bazlı Müşteri Atamaları
      </h2>
      
      <div style={{ marginBottom: '20px' }}>
        <p>
          Bu sayfada kullanıcılara sektör bazlı müşteri ataması yapabilirsiniz. 
          Kullanıcılar yalnızca kendilerine atanan müşterileri görebilirler.
        </p>
      </div>
      
      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        {/* Kullanıcı seçimi */}
        <div style={{ width: '50%' }}>
          <label htmlFor="userSelect" style={{ display: 'block', marginBottom: '5px' }}>
            Kullanıcı Seçin
          </label>
          <select
            id="userSelect"
            value={selectedUser || ''}
            onChange={(e) => handleUserSelect(e.target.value)}
            style={{ width: '100%', padding: '8px' }}
            disabled={loading}
          >
            <option value="">-- Kullanıcı Seçin --</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.full_name || user.email || 'İsimsiz Kullanıcı'}
              </option>
            ))}
          </select>
          
          {users.length === 0 && (
            <p style={{ color: '#dc3545', fontSize: '14px', marginTop: '5px' }}>
              Kullanıcı listesi yüklenemedi veya hiç kullanıcı yok. Profil tablosunu oluşturduğunuzdan emin olun.
            </p>
          )}
        </div>
        
        {/* Sektör seçimi */}
        <div style={{ width: '50%' }}>
          <label htmlFor="sectorSelect" style={{ display: 'block', marginBottom: '5px' }}>
            Sektör Seçin
          </label>
          <select
            id="sectorSelect"
            value={selectedSector}
            onChange={(e) => handleSectorSelect(e.target.value)}
            style={{ width: '100%', padding: '8px' }}
            disabled={!selectedUser || loading}
          >
            <option value="">-- Sektör Seçin --</option>
            {sectors.map(sector => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Toplu atama butonları */}
      {selectedUser && selectedSector && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button 
            onClick={assignAllCustomers} 
            className="btn btn-success"
            disabled={loading || listLoading || customers.length === 0}
          >
            Bu Sektördeki Tüm Müşterileri Ata
          </button>
          
          <button 
            onClick={removeAllCustomers} 
            className="btn btn-danger"
            disabled={loading || listLoading || assignedCustomers.length === 0}
          >
            Bu Sektördeki Tüm Atamaları Kaldır
          </button>
        </div>
      )}
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Sol liste: Atanmış müşteriler */}
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Atanmış Müşteriler</span>
            <span style={{ fontSize: '14px', color: '#666' }}>{assignedCustomers.length} müşteri</span>
          </h3>
          
          {listLoading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>Yükleniyor...</div>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #eee' }}>
              {assignedCustomers.length > 0 ? (
                <table style={{ width: '100%' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa' }}>
                    <tr>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Kod</th>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Müşteri</th>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Sektör</th>
                      <th style={{ padding: '10px', textAlign: 'center' }}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignedCustomers.map(customer => (
                      <tr key={customer.id} style={{ 
                        backgroundColor: customer.sector_code === selectedSector ? '#e3f2fd' : 'transparent' 
                      }}>
                        <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                          {customer.code}
                        </td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                          {customer.name}
                        </td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                          {customer.sector_code}
                        </td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                          <button
                            onClick={() => toggleCustomerAssignment(customer.id)}
                            className="btn btn-danger"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            disabled={listLoading}
                          >
                            Kaldır
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                  {selectedUser ? 'Bu kullanıcıya atanmış müşteri bulunamadı.' : 'Lütfen bir kullanıcı seçin.'}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Sağ liste: Sektördeki müşteriler */}
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Sektördeki Müşteriler</span>
            <span style={{ fontSize: '14px', color: '#666' }}>{customers.length} müşteri</span>
          </h3>
          
          {!selectedSector ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
              Lütfen bir sektör seçin.
            </div>
          ) : listLoading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>Yükleniyor...</div>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #eee' }}>
              {customers.length > 0 ? (
                <table style={{ width: '100%' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa' }}>
                    <tr>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Kod</th>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Müşteri</th>
                      <th style={{ padding: '10px', textAlign: 'center' }}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map(customer => {
                      const isAssigned = assignedCustomers.some(c => c.id === customer.id);
                      
                      return (
                        <tr key={customer.id} style={{ 
                          backgroundColor: isAssigned ? '#e3f2fd' : 'transparent' 
                        }}>
                          <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                            {customer.code}
                          </td>
                          <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                            {customer.name}
                          </td>
                          <td style={{ padding: '10px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                            <button
                              onClick={() => toggleCustomerAssignment(customer.id)}
                              className={`btn ${isAssigned ? 'btn-danger' : 'btn-success'}`}
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                              disabled={listLoading}
                            >
                              {isAssigned ? 'Kaldır' : 'Ata'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                  Bu sektörde müşteri bulunamadı.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserAssignments;