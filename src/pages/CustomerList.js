import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';
import { useUserAccess } from '../helpers/userAccess';
import AdvancedSearch from '../components/AdvancedSearch';
import SearchBox from '../components/SearchBox';
import ResponsiveTable from '../components/ResponsiveTable';

const CustomerList = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [advancedSearchCriteria, setAdvancedSearchCriteria] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // User access control - Get loading state
  const { isAdmin, isMuhasebe, filterCustomersByAccess, loading: accessLoading } = useUserAccess();
  
  // Pagination state
  const [pagination, setPagination] = useState({
    page: 0,
    pageSize: isMobile ? 50 : 100, // Küçük ekranlarda daha az kayıt göster
    total: 0,
    totalPages: 0
  });

  // Ekran boyutu değişikliklerini izle
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Ekran boyutu değiştiğinde sayfa başına kayıt sayısını güncelle
      setPagination(prev => ({
        ...prev,
        pageSize: mobile ? 50 : 100
      }));
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Advanced search with loading state check
  const fetchCustomersWithSearch = async (criteria) => {
    setLoading(true);
    try {
      console.log('Arama kriterleri:', criteria);
      
      // Create database query
      let query = supabase
        .from('customers')
        .select('*');
      
      // Apply access control
      query = await filterCustomersByAccess(query);
      
      // Apply search criteria
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
      
      // Apply sorting
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
      
      // Balance filters
      if ((criteria.balanceMin || criteria.balanceMax || criteria.pastDueOnly) && 
          filteredData.length > 0) {
        
        // Customer IDs
        const customerIds = filteredData.map(customer => customer.id);
        
        // Get balances
        const { data: balances, error: balanceError } = await supabase
          .from('customer_balances')
          .select('*')
          .in('customer_id', customerIds);
          
        if (balanceError) throw balanceError;
        
        // Map customer balances
        const balanceMap = {};
        if (balances) {
          balances.forEach(balance => {
            balanceMap[balance.customer_id] = balance;
          });
        }
        
        // Apply balance filters
        filteredData = filteredData.filter(customer => {
          const balance = balanceMap[customer.id];
          
          if (!balance && (criteria.balanceMin || criteria.balanceMax || criteria.pastDueOnly)) {
            return false;
          }
          
          // Min balance filter
          if (criteria.balanceMin && parseFloat(balance?.total_balance || 0) < parseFloat(criteria.balanceMin)) {
            return false;
          }
          
          // Max balance filter
          if (criteria.balanceMax && parseFloat(balance?.total_balance || 0) > parseFloat(criteria.balanceMax)) {
            return false;
          }
          
          // Past due only filter
          if (criteria.pastDueOnly && parseFloat(balance?.past_due_balance || 0) <= 0) {
            return false;
          }
          
          return true;
        });
      }
      
      // Note filters
      if (criteria.hasNotes) {
        if (filteredData.length > 0) {
          const customerIds = filteredData.map(customer => customer.id);
          
          let notesQuery = supabase
            .from('customer_notes')
            .select('customer_id')
            .in('customer_id', customerIds);
            
          // Note content search
          if (criteria.notesKeyword) {
            notesQuery = notesQuery.ilike('note_content', `%${criteria.notesKeyword}%`);
          }
          
          const { data: notes, error: notesError } = await notesQuery;
          
          if (notesError) throw notesError;
          
          // Customer IDs with notes
          const customerIdsWithNotes = new Set(notes?.map(note => note.customer_id) || []);
          
          // Filter to only customers with notes
          filteredData = filteredData.filter(customer => 
            customerIdsWithNotes.has(customer.id)
          );
        } else {
          // Result already empty
          filteredData = [];
        }
      }
      
      // Update results
      setCustomers(filteredData);
      
      // Update total record count
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
  
  // Search handler
  const handleSearch = (criteria) => {
    setAdvancedSearchCriteria(criteria);
    fetchCustomersWithSearch(criteria);
  };
  
  // Reset search
  const handleResetSearch = () => {
    setAdvancedSearchCriteria(null);
    fetchCustomersPage(0);
  };
  
  // Basic search handler - artık veritabanından arayacak
  const handleBasicSearch = async (value) => {
    setSearchTerm(value);

    if (!value.trim()) {
      // Arama terimi boşsa normal sayfalama ile geri dön
      fetchCustomersPage(0);
      return;
    }

    // Arama varsa tüm veritabanında ara
    setLoading(true);
    try {
      let query = supabase
        .from('customers')
        .select('*');

      // Arama filtresi
      const searchLower = value.toLowerCase().trim();
      query = query.or(`name.ilike.%${searchLower}%,code.ilike.%${searchLower}%,sector_code.ilike.%${searchLower}%`);

      // Erişim kontrolü
      query = await filterCustomersByAccess(query);

      // Sıralama
      query = query.order('name');

      const { data, error } = await query;

      if (error) throw error;

      setCustomers(data || []);

      // Pagination'ı sıfırla çünkü arama sonucu
      setPagination(prev => ({
        ...prev,
        page: 0,
        total: data?.length || 0,
        totalPages: 1
      }));

    } catch (err) {
      console.error("Arama hatası:", err);
      toast.error("Arama sırasında hata oluştu");
    } finally {
      setLoading(false);
    }
  };
  
  // Get total customer count
  const fetchCustomerCount = async () => {
    try {
      let query = supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });

      // Access filtering
      query = await filterCustomersByAccess(query);

      const { count, error } = await query;

      if (error) throw error;

      return count || 0;
    } catch (err) {
      console.error("Müşteri sayısı alınamadı:", err);
      return 0;
    }
  };
  
  // Fetch customers by page - FIXED to always load data
  const fetchCustomersPage = async (page = 0, pageSize = pagination.pageSize) => {
    setLoading(true);
    try {
      // First get total count
      const totalCount = await fetchCustomerCount();
      const totalPages = Math.ceil(totalCount / pageSize);
      
      // Update pagination
      setPagination({
        page,
        pageSize,
        total: totalCount,
        totalPages
      });
      
      // Page limits
      const from = page * pageSize;
      const to = from + pageSize - 1;
      
      // Get paginated data
      let query = supabase
        .from('customers')
        .select('*')
        .range(from, to)
        .order('name');
      
      // User access control
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
  
  // Initial data load - FIXED by waiting for access loading
  useEffect(() => {
    if (!accessLoading) {
      // Either use search criteria or fetch customers directly
      if (advancedSearchCriteria) {
        fetchCustomersWithSearch(advancedSearchCriteria);
      } else {
        fetchCustomersPage(0);
      }
    }
  }, [accessLoading]);
  
  // Page change handler
  const handlePageChange = (newPage) => {
    if (newPage >= 0 && newPage < pagination.totalPages) {
      fetchCustomersPage(newPage);
    }
  };
  
  // Since we now search at database level, no client-side filtering needed
  const filteredCustomers = customers;

  // Error display
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

  // Loading state
  if (loading && customers.length === 0) {
    return <div style={{ textAlign: 'center', padding: '40px' }}>Müşteriler yükleniyor...</div>;
  }

  // No customers display
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
  
  // Tablo sütunları
  const columns = [
    {
      header: "Müşteri Kodu",
      accessor: "code",
      render: (row) => row.code || '-'
    },
    {
      header: "Müşteri Adı",
      accessor: "name",
      render: (row) => row.name || '-'
    },
    {
      header: "Sektör",
      accessor: "sector_code",
      render: (row) => row.sector_code || '-'
    }
  ];
  
  // Tablo işlemleri
  const renderActions = (customer) => (
    <Link
      to={`/customers/${customer.id}`}
      className="btn btn-primary"
      style={{ padding: '4px 8px', fontSize: '12px' }}
    >
      Detay
    </Link>
  );

  return (
    <div>
      <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        Müşteri Listesi
      </h1>
      
      <AdvancedSearch 
        onSearch={handleSearch}
        onReset={handleResetSearch}
      />
      
      <SearchBox
        placeholder="Müşteri adı, kodu veya sektör ile ara..."
        value={searchTerm}
        onChange={(e) => handleBasicSearch(e.target.value)}
        buttonText={loading ? "Yükleniyor..." : "Ara"}
      />
      
      <div className="card">
        <ResponsiveTable
          columns={columns}
          data={filteredCustomers}
          actions={renderActions}
          emptyMessage="Müşteri bulunamadı."
        />
        
        {/* Pagination controls */}
        {!advancedSearchCriteria && pagination.totalPages > 1 && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            gap: '10px', 
            margin: '20px 0',
            alignItems: 'center',
            flexWrap: 'wrap'
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