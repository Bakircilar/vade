import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';

const CustomerList = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Sayfalama için state
  const [pagination, setPagination] = useState({
    page: 0,
    pageSize: 100,
    total: 0,
    totalPages: 0
  });
  
  // Toplam müşteri sayısını al
  const fetchCustomerCount = async () => {
    try {
      const { count, error } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      
      return count || 0;
    } catch (err) {
      console.error("Müşteri sayısı alınamadı:", err);
      return 0;
    }
  };
  
  // Sayfalı veri çekme
  const fetchCustomersPage = async (page = 0, pageSize = 100) => {
    setLoading(true);
    try {
      // Önce toplam kayıt sayısını al
      const totalCount = await fetchCustomerCount();
      const totalPages = Math.ceil(totalCount / pageSize);
      
      // Sayfalama bilgisini güncelle
      setPagination({
        page,
        pageSize,
        total: totalCount,
        totalPages
      });
      
      // Sayfa sınırları
      const from = page * pageSize;
      const to = from + pageSize - 1;
      
      // Sayfalanmış veriyi al
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .range(from, to)
        .order('name');
      
      if (error) throw error;
      
      console.log(`Sayfa ${page+1}/${totalPages}: ${data.length} müşteri gösteriliyor (toplam ${totalCount})`);
      setCustomers(data || []);
    } catch (err) {
      console.error("Müşteri getirme hatası:", err);
      setError(err.message);
      toast.error("Müşteriler yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };
  
  // İlk sayfa için veri çek
  useEffect(() => {
    fetchCustomersPage(0);
  }, []);
  
  // Sayfa değiştirme
  const handlePageChange = (newPage) => {
    if (newPage >= 0 && newPage < pagination.totalPages) {
      fetchCustomersPage(newPage);
    }
  };
  
  // Arama işlemi
  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };
  
  // Aranan değere göre müşterileri filtrele
  const filteredCustomers = React.useMemo(() => {
    if (!searchTerm) return customers;
    
    const searchLower = searchTerm.toLowerCase();
    return customers.filter(customer => 
      (customer.name && customer.name.toLowerCase().includes(searchLower)) ||
      (customer.code && customer.code.toLowerCase().includes(searchLower))
    );
  }, [customers, searchTerm]);

  // Hata durumunda göster
  if (error) {
    return (
      <div className="card" style={{ padding: '20px', backgroundColor: '#f8d7da', color: '#721c24' }}>
        <h3>Bir hata oluştu!</h3>
        <p>{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="btn btn-warning"
          style={{ marginTop: '10px' }}
        >
          Sayfayı Yenile
        </button>
      </div>
    );
  }

  // Yükleme durumunda göster
  if (loading && customers.length === 0) {
    return <div style={{ textAlign: 'center', padding: '40px' }}>Müşteriler yükleniyor...</div>;
  }

  // Müşteri bulunamadıysa göster
  if (!loading && customers.length === 0) {
    return (
      <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
        <p>Henüz müşteri kaydı bulunmuyor.</p>
        <Link to="/import" className="btn btn-primary" style={{ marginTop: '10px' }}>
          Excel Veri İçe Aktarma
        </Link>
      </div>
    );
  }

  // Müşterileri göster - sayfalama ile
  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        Müşteri Listesi
      </h1>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ width: '60%' }}>
          <input
            type="text"
            placeholder="Müşteri adı veya kodu ile ara..."
            value={searchTerm}
            onChange={handleSearch}
            style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
          />
        </div>
        
        <div>
          <button 
            onClick={() => fetchCustomersPage(pagination.page)}
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Yükleniyor...' : 'Yenile'}
          </button>
        </div>
      </div>
      
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Müşteri Kodu</th>
              <th>Müşteri Adı</th>
              <th>Sektör</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.code || '-'}</td>
                <td>{customer.name || '-'}</td>
                <td>{customer.sector_code || '-'}</td>
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
            ))}
          </tbody>
        </table>
        
        {/* Sayfalama kontrolleri */}
        {pagination.totalPages > 1 && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            gap: '10px', 
            margin: '20px 0',
            alignItems: 'center' 
          }}>
            <button
              onClick={() => handlePageChange(0)}
              disabled={pagination.page === 0 || loading}
              className="btn"
              title="İlk Sayfa"
            >
              ««
            </button>
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 0 || loading}
              className="btn"
              title="Önceki Sayfa"
            >
              «
            </button>
            
            <span>
              Sayfa {pagination.page + 1} / {pagination.totalPages}
            </span>
            
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages - 1 || loading}
              className="btn"
              title="Sonraki Sayfa"
            >
              »
            </button>
            <button
              onClick={() => handlePageChange(pagination.totalPages - 1)}
              disabled={pagination.page === pagination.totalPages - 1 || loading}
              className="btn"
              title="Son Sayfa"
            >
              »»
            </button>
          </div>
        )}
        
        <div style={{ margin: '20px 0', textAlign: 'center' }}>
          {loading ? (
            <p>Yükleniyor...</p>
          ) : (
            <p>
              {searchTerm ? 
                `${filteredCustomers.length} müşteri bulundu` : 
                `${customers.length} müşteri gösteriliyor (toplam ${pagination.total})`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerList;