// src/pages/CustomerList.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';
import { useUserAccess } from '../helpers/userAccess';
import AdvancedSearch from '../components/AdvancedSearch'; // Gelişmiş arama bileşenini import edin

const CustomerList = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [advancedSearchCriteria, setAdvancedSearchCriteria] = useState(null);
  
  // User access control
  const { isAdmin, isMuhasebe, filterCustomersByAccess } = useUserAccess();
  
  // Sayfalama için state
  const [pagination, setPagination] = useState({
    page: 0,
    pageSize: 100,
    total: 0,
    totalPages: 0
  });
  
  // Gelişmiş arama ile veri çekme
  const fetchCustomersWithSearch = async (criteria) => {
    setLoading(true);
    try {
      console.log('Arama kriterleri:', criteria);
      
      // Veritabanı sorgusu oluştur
      let query = supabase
        .from('customers')
        .select('*');
      
      // Erişim kontrolü uygula
      query = await filterCustomersByAccess(query);
      
      // Arama kriterlerini uygula
      if (criteria.name) {
        query = query.ilike('name', `%${criteria.name}%`);
      }
      
      if (criteria.code) {
        query = query.ilike('code', `%${criteria.code}%`);
      }
      
      if (criteria.sector) {
        query = query.eq('sector_code', criteria.sector);
      }
      
      if (criteria.region) {
        query = query.eq('region_code', criteria.region);
      }
      
      // Sıralama uygula
      if (criteria.sortBy) {
        query = query.order(criteria.sortBy, { 
          ascending: criteria.sortDirection === 'asc'
        });
      } else {
        query = query.order('name');
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      let filteredData = data || [];
      
      // Bakiye filtreleri varsa ilgili müşterilerin bakiyelerini getir
      if ((criteria.balanceMin || criteria.balanceMax || criteria.pastDueOnly) && 
          filteredData.length > 0) {
        
        // Müşteri ID'leri
        const customerIds = filteredData.map(customer => customer.id);
        
        // Bakiyeleri getir
        const { data: balances, error: balanceError } = await supabase
          .from('customer_balances')
          .select('*')
          .in('customer_id', customerIds);
          
        if (balanceError) throw balanceError;
        
        // Müşteri-bakiye eşleşmesi
        const balanceMap = {};
        if (balances) {
          balances.forEach(balance => {
            balanceMap[balance.customer_id] = balance;
          });
        }
        
        // Bakiye filtrelerini uygula
        filteredData = filteredData.filter(customer => {
          const balance = balanceMap[customer.id];
          
          // Bakiye yoksa ve filtreleme isteniyorsa, müşteriyi dahil etme
          if (!balance && (criteria.balanceMin || criteria.balanceMax || criteria.pastDueOnly)) {
            return false;
          }
          
          // Min bakiye filtresi
          if (criteria.balanceMin && parseFloat(balance?.total_balance || 0) < parseFloat(criteria.balanceMin)) {
            return false;
          }
          
          // Max bakiye filtresi
          if (criteria.balanceMax && parseFloat(balance?.total_balance || 0) > parseFloat(criteria.balanceMax)) {
            return false;
          }
          
          // Sadece vadesi geçenler filtresi
          if (criteria.pastDueOnly && parseFloat(balance?.past_due_balance || 0) <= 0) {
            return false;
          }
          
          return true;
        });
      }
      
      // Not filtreleri varsa ilgili müşterilerin notlarını getir
      if (criteria.hasNotes) {
        if (filteredData.length > 0) {
          const customerIds = filteredData.map(customer => customer.id);
          
          let notesQuery = supabase
            .from('customer_notes')
            .select('customer_id')
            .in('customer_id', customerIds);
            
          // Not içeriği araması varsa ekle
          if (criteria.notesKeyword) {
            notesQuery = notesQuery.ilike('note_content', `%${criteria.notesKeyword}%`);
          }
          
          const { data: notes, error: notesError } = await notesQuery;
          
          if (notesError) throw notesError;
          
          // Notu olan müşteri ID'leri
          const customerIdsWithNotes = new Set(notes?.map(note => note.customer_id) || []);
          
          // Notu olan müşterileri filtrele
          filteredData = filteredData.filter(customer => 
            customerIdsWithNotes.has(customer.id)
          );
        } else {
          // Sonuç zaten boşsa
          filteredData = [];
        }
      }
      
      // Sonuçları güncelle
      setCustomers(filteredData);
      
      // Toplam kayıt sayısını güncelle
      setPagination({
        ...pagination,
        total: filteredData.length,
        totalPages: Math.ceil(filteredData.length / pagination.pageSize)
      });
    } catch (err) {
      console.error("Gelişmiş arama hatası:", err);
      setError(err.message);
      toast.error("Arama sırasında bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };
  
  // Arama yapıldığında
  const handleSearch = (criteria) => {
    setAdvancedSearchCriteria(criteria);
    fetchCustomersWithSearch(criteria);
  };
  
  // Arama sıfırlandığında
  const handleResetSearch = () => {
    setAdvancedSearchCriteria(null);
    fetchCustomersPage(0);
  };
  
  // Toplam müşteri sayısını al
  const fetchCustomerCount = async () => {
    try {
      let query = supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });
      
      // Yetki filtrelemesi
      query = await filterCustomersByAccess(query);
      
      const { count, error } = await query;
      
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
      let query = supabase
        .from('customers')
        .select('*')
        .range(from, to)
        .order('name');
      
      // Kullanıcı erişim kontrolü
      query = await filterCustomersByAccess(query);
      
      const { data, error } = await query;
      
      if (error) throw error;
      
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
    // Arama kriterleri varsa onunla getir, yoksa normal sayfalama
    if (advancedSearchCriteria) {
      fetchCustomersWithSearch(advancedSearchCriteria);
    } else {
      fetchCustomersPage(0);
    }
  }, []);
  
  // Sayfa değiştirme
  const handlePageChange = (newPage) => {
    if (newPage >= 0 && newPage < pagination.totalPages) {
      fetchCustomersPage(newPage);
    }
  };
  
  // Arama işlemi
  const handleBasicSearch = (e) => {
    setSearchTerm(e.target.value);
  };
  
  // Aranan değere göre müşterileri filtrele
  const filteredCustomers = React.useMemo(() => {
    if (!searchTerm.trim()) return customers;
    
    const searchLower = searchTerm.toLowerCase().trim();
    return customers.filter(customer => 
      (customer.name && customer.name.toLowerCase().includes(searchLower)) ||
      (customer.code && customer.code.toLowerCase().includes(searchLower)) ||
      (customer.sector_code && customer.sector_code.toLowerCase().includes(searchLower))
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
      
      {/* Gelişmiş Arama Bileşeni */}
      <AdvancedSearch 
        onSearch={handleSearch}
        onReset={handleResetSearch}
      />
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ width: '60%' }}>
          <input
            type="text"
            placeholder="Müşteri adı, kodu veya sektör ile ara..."
            value={searchTerm}
            onChange={handleBasicSearch}
            style={{ width: '100%', padding: '8px', border: '1px solid var(--border-color)', borderRadius: '4px' }}
          />
        </div>
        
        <div>
          <button 
            onClick={() => advancedSearchCriteria ? fetchCustomersWithSearch(advancedSearchCriteria) : fetchCustomersPage(pagination.page)}
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Yükleniyor...' : 'Yenile'}
          </button>
        </div>
      </div>
      
      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-background)', zIndex: 1 }}>
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
        </div>
        
        {/* Sayfalama kontrolleri */}
        {!advancedSearchCriteria && pagination.totalPages > 1 && (
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
              {searchTerm.trim() || advancedSearchCriteria ? 
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