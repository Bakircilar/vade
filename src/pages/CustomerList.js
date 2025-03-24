import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';

const CustomerList = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
  const [debugInfo, setDebugInfo] = useState({ error: null, message: null });

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setDebugInfo({ error: null, message: 'Sorgu başlatılıyor...' });
    
    try {
      // 1. Temel tablo bağlantısını kontrol et
      const { count, error: countError } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });
        
      if (countError) {
        setDebugInfo({ 
          error: countError, 
          message: 'Müşteri tablosuna erişim hatası! Detay için konsolda hata ayrıntılarını kontrol edin.' 
        });
        throw countError;
      }
      
      setDebugInfo({ message: `Müşteri tablosuna erişim başarılı. Toplam kayıt: ${count}` });
      
      // 2. Hiç kayıt yoksa, hemen dön
      if (count === 0) {
        setCustomers([]);
        setLoading(false);
        return;
      }
      
      // 3. Müşterileri getir - basit sorgu
      const { data: simpleData, error: simpleError } = await supabase
        .from('customers')
        .select('*')
        .order('name');
        
      if (simpleError) {
        setDebugInfo({ 
          error: simpleError, 
          message: 'Müşteri verileri çekilirken hata oluştu!' 
        });
        throw simpleError;
      }
      
      console.log("Çekilen müşteri sayısı:", simpleData?.length);
      
      // 4. Bakiyeleri ayrı sorgula
      const { data: balanceData, error: balanceError } = await supabase
        .from('customer_balances')
        .select('*');
        
      if (balanceError) {
        console.warn("Bakiye bilgileri çekilirken hata:", balanceError);
        // Hatada bile temel müşteri verilerini göster
        setCustomers(simpleData);
        setDebugInfo({ 
          message: 'Müşteriler yüklendi ancak bakiye bilgileri yüklenemedi.', 
          error: balanceError 
        });
      } else {
        // Müşterilere bakiye bilgilerini ekleyelim
        const customersWithBalances = simpleData.map(customer => {
          const balance = balanceData.find(b => b.customer_id === customer.id);
          return {
            ...customer,
            customer_balances: balance ? [balance] : []
          };
        });
        
        setCustomers(customersWithBalances);
        setDebugInfo({ 
          message: `${customersWithBalances.length} müşteri ve bakiye bilgileri başarıyla yüklendi.` 
        });
      }
    } catch (error) {
      toast.error('Müşteriler yüklenirken bir hata oluştu');
      console.error('Error loading customers:', error);
      setDebugInfo({ error, message: 'Müşteri verileri yüklenirken kritik bir hata oluştu!' });
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  // Verileri filtreleme ve sıralama
  const filteredAndSortedCustomers = React.useMemo(() => {
    let filteredCustomers = [...customers];
    
    // Arama filtrelemesi
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filteredCustomers = filteredCustomers.filter(
        customer => 
          (customer.name && customer.name.toLowerCase().includes(searchLower)) ||
          (customer.code && customer.code.toLowerCase().includes(searchLower))
      );
    }
    
    // Sıralama
    if (sortConfig.key) {
      filteredCustomers.sort((a, b) => {
        if (!a[sortConfig.key] && !b[sortConfig.key]) return 0;
        if (!a[sortConfig.key]) return 1;
        if (!b[sortConfig.key]) return -1;
        
        const aValue = typeof a[sortConfig.key] === 'string' 
          ? a[sortConfig.key].toLowerCase() 
          : a[sortConfig.key];
          
        const bValue = typeof b[sortConfig.key] === 'string' 
          ? b[sortConfig.key].toLowerCase() 
          : b[sortConfig.key];
        
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    
    return filteredCustomers;
  }, [customers, searchTerm, sortConfig]);

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        Müşteri Listesi
      </h1>
      
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="form-group" style={{ flexGrow: 1, maxWidth: '400px' }}>
          <input
            type="text"
            placeholder="Müşteri adı veya kodu ile ara..."
            value={searchTerm}
            onChange={handleSearch}
            style={{ width: '100%' }}
          />
        </div>
        
        <button 
          onClick={fetchCustomers} 
          className="btn btn-primary"
          style={{ marginLeft: '10px' }}
          disabled={loading}
        >
          {loading ? 'Yükleniyor...' : 'Yenile'}
        </button>
      </div>
      
      {/* Debug bilgisi */}
      {debugInfo.message && (
        <div className="card" style={{ 
          marginBottom: '20px', 
          padding: '10px', 
          backgroundColor: debugInfo.error ? '#f8d7da' : '#d4edda', 
          color: debugInfo.error ? '#721c24' : '#155724'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Durum Bilgisi</h3>
          <p>{debugInfo.message}</p>
          {debugInfo.error && (
            <div>
              <p><strong>Hata Detayı:</strong> {debugInfo.error.message || 'Bilinmeyen hata'}</p>
              <p><strong>Kod:</strong> {debugInfo.error.code || '-'}</p>
              <button 
                onClick={() => window.location.reload()} 
                className="btn btn-warning"
                style={{ marginTop: '10px', padding: '4px 8px', fontSize: '12px' }}
              >
                Sayfayı Yenile
              </button>
            </div>
          )}
        </div>
      )}
      
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Yükleniyor...</div>
      ) : (
        <div className="card">
          {filteredAndSortedCustomers.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th 
                    onClick={() => requestSort('code')}
                    style={{ cursor: 'pointer' }}
                  >
                    Müşteri Kodu
                    {sortConfig.key === 'code' && (
                      <span>{sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'}</span>
                    )}
                  </th>
                  <th 
                    onClick={() => requestSort('name')}
                    style={{ cursor: 'pointer' }}
                  >
                    Müşteri Adı
                    {sortConfig.key === 'name' && (
                      <span>{sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'}</span>
                    )}
                  </th>
                  <th>Sektör</th>
                  <th>Toplam Bakiye</th>
                  <th>Vadesi Geçen</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedCustomers.map((customer) => {
                  const balance = customer.customer_balances?.[0] || {};
                  
                  return (
                    <tr key={customer.id}>
                      <td>{customer.code || '-'}</td>
                      <td>{customer.name || '-'}</td>
                      <td>{customer.sector_code || '-'}</td>
                      <td>
                        {balance.total_balance
                          ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(balance.total_balance)
                          : '-'}
                      </td>
                      <td>
                        {balance.past_due_balance
                          ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(balance.past_due_balance)
                          : '-'}
                      </td>
                      <td>
                        <Link
                          to={`/customers/${customer.id}`}
                          className="btn btn-primary"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                        >
                          Detay
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
              {searchTerm ? 'Arama kriterine uygun müşteri bulunamadı.' : 'Henüz müşteri kaydı bulunmuyor.'}
            </p>
          )}
          
          {customers.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: '20px', padding: '10px' }}>
              <p style={{ marginBottom: '10px', color: '#666' }}>
                Sisteme müşteri eklemek için Excel dosyası yükleyebilirsiniz.
              </p>
              <Link to="/import" className="btn btn-primary">Excel Veri İçe Aktarma</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerList;