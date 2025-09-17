import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { format, addDays, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import VadeHelper from '../helpers/VadeHelper';
import { useUserAccess } from '../helpers/userAccess';

// Hızlı Not Komponenti
const QuickNoteForm = ({ customerId, customerName, onClose, onSubmit }) => {
  const [note, setNote] = useState('');
  const [promiseDate, setPromiseDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!note.trim()) {
      toast.warning('Not içeriği boş olamaz');
      return;
    }
    
    setSubmitting(true);
    try {
      // Önce müşterinin bakiye bilgilerini alalım
      const { data: balanceData, error: balanceError } = await supabase
        .from('customer_balances')
        .select('past_due_balance')
        .eq('customer_id', customerId)
        .single();
      
      // Vadesi geçmiş bakiyeyi almaya çalışalım
      let pastDueBalance = 0;
      if (balanceData && balanceData.past_due_balance !== null && balanceData.past_due_balance !== undefined) {
        const parsedValue = parseFloat(balanceData.past_due_balance);
        if (!isNaN(parsedValue)) {
          pastDueBalance = parsedValue;
        }
      }
      
      // Notu oluştur - vadesi geçmiş bakiyeyi doğrudan kullan
      const newNoteData = {
        customer_id: customerId,
        note_content: note.trim(),
        promise_date: promiseDate || null,
        balance_at_time: pastDueBalance // Vadesi geçmiş bakiyeyi kullan
      };
      
      // Notu veritabanına ekle
      const { error } = await supabase
        .from('customer_notes')
        .insert([newNoteData]);
      
      if (error) throw error;
      
      toast.success('Not başarıyla eklendi');
      onSubmit && onSubmit();
      onClose();
    } catch (error) {
      console.error('Not ekleme hatası:', error);
      toast.error('Not eklenirken bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ 
      padding: '15px', 
      position: 'absolute',
      width: '400px',
      boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
      zIndex: 1000,
      backgroundColor: 'white',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>{customerName} için Hızlı Not</h3>
        <button 
          onClick={onClose}
          style={{ 
            background: 'none', 
            border: 'none', 
            fontSize: '18px', 
            cursor: 'pointer',
            color: '#888' 
          }}
        >
          ✕
        </button>
      </div>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="noteContent">Not İçeriği</label>
          <textarea
            id="noteContent"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="form-control"
            rows="4"
            style={{ 
              width: '100%', 
              padding: '8px', 
              border: '1px solid #ddd', 
              borderRadius: '4px',
              marginBottom: '10px'
            }}
            placeholder="Müşteri ile ilgili notunuzu buraya yazın..."
            required
          ></textarea>
        </div>
        
        <div className="form-group">
          <label htmlFor="promiseDate">Söz Verilen Ödeme Tarihi (Opsiyonel)</label>
          <input
            type="date"
            id="promiseDate"
            value={promiseDate}
            onChange={(e) => setPromiseDate(e.target.value)}
            className="form-control"
            style={{ 
              width: '100%', 
              padding: '8px', 
              border: '1px solid #ddd', 
              borderRadius: '4px' 
            }}
          />
        </div>
        
        <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn"
            style={{ padding: '8px 16px' }}
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={submitting || !note.trim()}
            className="btn btn-primary"
            style={{ padding: '8px 16px' }}
          >
            {submitting ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </form>
    </div>
  );
};

// Notları Görüntüle Modal Bileşeni - YENİ EKLENDİ
const NotesModal = ({ customerId, customerName, onClose }) => {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (customerId) {
      fetchNotes();
    }
  }, [customerId]);

  // Notları getir
  const fetchNotes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customer_notes')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error) {
      console.error('Notlar yüklenirken hata:', error);
      toast.error('Notlar yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  // Tarihi formatla
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd MMM yyyy HH:mm', { locale: tr });
    } catch (error) {
      return dateString;
    }
  };

  // Para birimi formatla
  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '-';
    return new Intl.NumberFormat('tr-TR', { 
      style: 'currency', 
      currency: 'TRY' 
    }).format(amount);
  };

  return (
    <div className="card" style={{ 
      padding: '15px', 
      position: 'absolute',
      width: '80%',
      maxWidth: '800px',
      maxHeight: '80vh',
      overflowY: 'auto',
      boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
      zIndex: 1000,
      backgroundColor: 'white',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>{customerName} - Notlar</h3>
        <button 
          onClick={onClose}
          style={{ 
            background: 'none', 
            border: 'none', 
            fontSize: '20px', 
            cursor: 'pointer',
            color: '#888' 
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ borderBottom: '1px solid #eee', marginBottom: '15px', paddingBottom: '10px' }}>
        <Link
          to={`/customers/${customerId}`}
          className="btn btn-primary"
          style={{ padding: '6px 10px', fontSize: '13px' }}
          onClick={onClose}
        >
          Müşteri Detayına Git
        </Link>
      </div>
      
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px' }}>Notlar yükleniyor...</div>
      ) : notes.length > 0 ? (
        <div>
          {notes.map((note) => (
            <div 
              key={note.id} 
              className="card" 
              style={{ 
                marginBottom: '15px', 
                padding: '15px',
                backgroundColor: '#f9f9f9',
                border: '1px solid #eee',
                borderLeft: note.promise_date ? '3px solid #3498db' : '1px solid #eee'
              }}
            >
              <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 'bold', color: '#666' }}>
                  {formatDate(note.created_at)}
                </span>
              </div>

              <p style={{ margin: '0 0 10px 0', whiteSpace: 'pre-wrap' }}>{note.note_content}</p>
              
              {note.promise_date && (
                <div 
                  style={{ 
                    padding: '5px 10px', 
                    backgroundColor: '#e3f2fd', 
                    borderRadius: '4px',
                    display: 'inline-block',
                    fontSize: '13px',
                    color: '#1565c0',
                    marginBottom: '10px'
                  }}
                >
                  <strong>Söz Verilen Ödeme Tarihi:</strong> {formatDate(note.promise_date)}
                </div>
              )}
              
              {/* Bakiye Bilgileri */}
              <div style={{ marginTop: '10px' }}>
                {note.balance_at_time !== null && note.balance_at_time !== undefined && (
                  <div style={{ 
                    padding: '8px', 
                    backgroundColor: '#f8fafc', 
                    borderRadius: '4px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <div style={{ fontSize: '12px', color: '#475569' }}>Not Eklendiğindeki Bakiye:</div>
                    <div style={{ fontWeight: 'bold' }}>
                      {formatCurrency(note.balance_at_time)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
          Bu müşteri için henüz not girilmemiş
        </p>
      )}
    </div>
  );
};

const PaymentList = () => {
  const location = useLocation();
  // URL parametre değerlerini al
  const [searchParams] = useSearchParams();
  const filterType = searchParams.get('filter') || 'all';
  
  const [balances, setBalances] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState(30); // Yaklaşan vadeler için 30 gün
  const [exporting, setExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState(''); // Arama terimi için state

  // Pagination state
  const [pagination, setPagination] = useState({
    page: 0,
    pageSize: 100,
    total: 0,
    totalPages: 0
  });

  // User access control
  const { isAdmin, isMuhasebe, getAssignedCustomerIds, loading: accessLoading } = useUserAccess();
  
  // Sıralama için state
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: 'ascending'
  });
  
  // Hızlı not için state
  const [quickNoteData, setQuickNoteData] = useState({
    show: false,
    customerId: null,
    customerName: ''
  });

  // Notları görüntülemek için state - YENİ EKLENDİ
  const [notesModalData, setNotesModalData] = useState({
    show: false,
    customerId: null,
    customerName: ''
  });
  
  // Son not tarihlerini saklamak için state - YENİ EKLENDİ
  const [lastNoteDates, setLastNoteDates] = useState({});
  
  // İstatistikler
  const [stats, setStats] = useState({
    total: 0,
    displayed: 0,
    allRecordsCount: 0, // Toplam tüm kayıt sayısı
    totalPastDueBalance: 0, // Toplam vadesi geçmiş bakiye
    totalNotDueBalance: 0, // Toplam vadesi geçmemiş bakiye
    totalBalance: 0 // Toplam genel bakiye
  });

  // Sıralama fonksiyonu
  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  // Sıralama oku görsel göstergesi
  const getSortDirectionIcon = (key) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'ascending' ? ' ↑' : ' ↓';
  };

  // Vade aralığını değiştirme fonksiyonu
  const handleDateRangeChange = (days) => {
    setDateRange(days);
  };

  // Database-level search function
  const handleSearch = async (value) => {
    setSearchTerm(value);

    if (!value.trim() || value.trim().length < 3) {
      // If search term is empty or less than 3 characters, return to normal pagination
      if (!value.trim()) {
        fetchData(true);
      }
      return;
    }

    // Search in entire database
    setLoading(true);
    try {

      // Get user access control
      const assignedIds = await getAssignedCustomerIds();

      // Create query for search
      let query = supabase
        .from('customer_balances')
        .select(`
          *,
          customers (
            id, name, code, sector_code
          )
        `);

      // Apply access filter - admin and muhasebe can see all
      if (!isAdmin && !isMuhasebe && assignedIds.length > 0) {
        query = query.in('customer_id', assignedIds);
      } else if (!isAdmin && !isMuhasebe) {
        query = query.filter('customer_id', 'eq', '00000000-0000-0000-0000-000000000000');
      }

      // First search customers table to get matching IDs
      const searchLower = value.toLowerCase().trim();

      let customerQuery = supabase
        .from('customers')
        .select('id')
        .or(`name.ilike.%${searchLower}%,code.ilike.%${searchLower}%,sector_code.ilike.%${searchLower}%`);

      const { data: customerData, error: customerError } = await customerQuery;

      if (customerError) throw customerError;

      if (!customerData || customerData.length === 0) {
        // No matching customers found
        setBalances([]);
        setAllRecords([]);
        setPagination(prev => ({
          ...prev,
          page: 0,
          total: 0,
          totalPages: 0
        }));
        return;
      }

      // Get customer IDs that match search - limit to reasonable number to avoid URL issues
      const matchingCustomerIds = customerData.slice(0, 1000).map(c => c.id);

      // Apply customer ID filter in smaller chunks if needed
      if (matchingCustomerIds.length > 500) {
        // If too many results, refine search or handle differently
        toast.warning('Çok fazla sonuç bulundu. Daha spesifik arama yapın.');
        return;
      }

      query = query.in('customer_id', matchingCustomerIds);

      // Order by customer name
      query = query.order('customer_id');

      const { data, error } = await query;

      if (error) throw error;

      // Process the search results similar to fetchData
      const processedData = await processBalanceData(data || []);
      setBalances(processedData.filteredBalances);
      setAllRecords(data || []);

      // Reset pagination since it's search results
      setPagination(prev => ({
        ...prev,
        page: 0,
        total: processedData.filteredBalances.length,
        totalPages: 1
      }));

      // Update stats
      setStats(processedData.stats);

      // Fetch last note dates for search results
      if (processedData.filteredBalances.length > 0) {
        const customerIds = processedData.filteredBalances.map(balance => balance.customer_id);
        fetchLastNoteDates(customerIds);
      }

    } catch (err) {
      console.error("Search error:", err);
      toast.error("Arama sırasında hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  // Hızlı not modunu aç
  const openQuickNote = (customerId, customerName) => {
    setQuickNoteData({
      show: true,
      customerId,
      customerName
    });
  };

  // Hızlı not modunu kapat
  const closeQuickNote = () => {
    setQuickNoteData({
      show: false,
      customerId: null,
      customerName: ''
    });
  };

  // Notları görüntüleme modalını aç - YENİ EKLENDİ
  const openNotesModal = (customerId, customerName) => {
    setNotesModalData({
      show: true,
      customerId,
      customerName
    });
  };

  // Notları görüntüleme modalını kapat - YENİ EKLENDİ
  const closeNotesModal = () => {
    setNotesModalData({
      show: false,
      customerId: null,
      customerName: ''
    });
  };

  // Her müşteri için son not tarihini getir - YENİ EKLENDİ
  const fetchLastNoteDates = async (customerIds) => {
    try {
      // Her müşteri için en son notu getir
      const promises = customerIds.map(async (customerId) => {
        try {
          const { data, error } = await supabase
            .from('customer_notes')
            .select('created_at')
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false })
            .limit(1);
            
          if (error) throw error;
          
          return {
            customerId,
            lastNoteDate: data && data.length > 0 ? data[0].created_at : null
          };
        } catch (err) {
          console.error(`Son not tarihi getirme hatası (${customerId}):`, err);
          return { customerId, lastNoteDate: null };
        }
      });
      
      const results = await Promise.all(promises);
      
      // Sonuçları bir objeye dönüştür
      const dateMap = {};
      results.forEach(result => {
        if (result.lastNoteDate) {
          dateMap[result.customerId] = result.lastNoteDate;
        }
      });
      
      setLastNoteDates(dateMap);
    } catch (err) {
      console.error('Son not tarihleri yükleme hatası:', err);
    }
  };

  // Son not tarihinden bugüne geçen gün sayısını hesapla - YENİ EKLENDİ
  const calculateDaysSinceLastNote = (customerId) => {
    const lastNoteDate = lastNoteDates[customerId];
    if (!lastNoteDate) return null;
    
    try {
      const date = new Date(lastNoteDate);
      const today = new Date();
      
      // Saatleri sıfırla (gün bazında karşılaştır)
      date.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      
      // Milisaniye farkını gün farkına çevir
      const diffTime = Math.abs(today - date);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      return diffDays;
    } catch (err) {
      console.error('Gün farkı hesaplama hatası:', err);
      return null;
    }
  };

  // Process balance data into filtered and statistics
  const processBalanceData = async (data) => {
    if (!data || data.length === 0) {
      return {
        filteredBalances: [],
        stats: {
          total: 0,
          displayed: 0,
          allRecordsCount: 0,
          totalPastDueBalance: 0,
          totalNotDueBalance: 0,
          totalBalance: 0
        }
      };
    }


    // Today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Date range for upcoming payments
    const futureDate = addDays(today, dateRange);

    let nonZeroBalanceCount = 0;
    let totalPastDueBalance = 0;
    let totalNotDueBalance = 0;
    let totalBalance = 0;

    // Process each balance
    let processedBalances = data.map(balance => {
      // Skip if no customer info
      if (!balance.customers) return null;

      try {
        // Parse balance values
        const pastDueBalance = parseFloat(balance.past_due_balance || 0);
        const notDueBalance = parseFloat(balance.not_due_balance || 0);
        const totalBalanceValue = parseFloat(balance.total_balance || 0) || (pastDueBalance + notDueBalance);

        // Count non-zero balances
        if (Math.abs(totalBalanceValue) >= 0.01) {
          nonZeroBalanceCount++;
        }

        // Skip records with zero or very small total balance
        if (Math.abs(totalBalanceValue) < 0.01) {
          return null;
        }

        // Check due dates
        let isPastDue = false;
        let isUpcoming = false;
        let effectiveDueDate = null;

        // 1. Past due date check
        if (balance.past_due_date) {
          const pastDueDate = new Date(balance.past_due_date);
          pastDueDate.setHours(0, 0, 0, 0);

          if (pastDueDate < today) {
            isPastDue = true;
            effectiveDueDate = pastDueDate;
          } else if (pastDueDate >= today && pastDueDate <= futureDate) {
            isUpcoming = true;
            effectiveDueDate = pastDueDate;
          }
        }

        // 2. Not due date check
        if (balance.not_due_date) {
          const notDueDate = new Date(balance.not_due_date);
          notDueDate.setHours(0, 0, 0, 0);

          if (notDueDate >= today && notDueDate <= futureDate) {
            isUpcoming = true;
            if (!effectiveDueDate || notDueDate < effectiveDueDate) {
              effectiveDueDate = notDueDate;
            }
          }
        }

        // 3. Legacy due_date check
        if (balance.due_date && !effectiveDueDate) {
          const dueDate = new Date(balance.due_date);
          dueDate.setHours(0, 0, 0, 0);

          if (dueDate < today) {
            isPastDue = true;
            effectiveDueDate = dueDate;
          } else if (dueDate >= today && dueDate <= futureDate) {
            isUpcoming = true;
            effectiveDueDate = dueDate;
          }
        }

        // Update totals
        totalPastDueBalance += pastDueBalance;
        totalNotDueBalance += notDueBalance;
        totalBalance += totalBalanceValue;

        return {
          ...balance,
          effective_due_date: effectiveDueDate ? effectiveDueDate.toISOString() : null,
          is_past_due: isPastDue,
          is_upcoming: isUpcoming,
          calculated_past_due: pastDueBalance,
          calculated_not_due: notDueBalance,
          calculated_total: totalBalanceValue
        };
      } catch (err) {
        console.error("Balance processing error:", err, balance);
        return null;
      }
    }).filter(item => item !== null);

    // Apply filter type
    let filteredBalances = processedBalances;

    if (filterType === 'upcoming') {
      filteredBalances = processedBalances.filter(balance => {
        if (balance.calculated_not_due <= VadeHelper.MIN_BALANCE) return false;
        if (!balance.not_due_date) return false;

        try {
          const notDueDate = new Date(balance.not_due_date);
          notDueDate.setHours(0, 0, 0, 0);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const futureDate = addDays(today, dateRange);

          if (notDueDate >= today && notDueDate <= futureDate) {
            balance.effective_due_date = notDueDate.toISOString();
            return true;
          }
          return false;
        } catch (err) {
          console.error("Date processing error (not_due_date):", err, balance.not_due_date);
          return false;
        }
      });
    } else if (filterType === 'overdue') {
      filteredBalances = processedBalances.filter(balance =>
        (balance.is_past_due || (!balance.effective_due_date && balance.calculated_past_due > VadeHelper.MIN_BALANCE))
        && balance.calculated_past_due > VadeHelper.MIN_BALANCE
      );
    }

    // Apply sorting
    filteredBalances = sortData(filteredBalances);

    return {
      filteredBalances,
      stats: {
        total: nonZeroBalanceCount,
        displayed: filteredBalances.length,
        allRecordsCount: data.length,
        totalPastDueBalance: totalPastDueBalance,
        totalNotDueBalance: totalNotDueBalance,
        totalBalance: totalBalance
      }
    };
  };

  // Get total count of customer balances for pagination
  const fetchCustomerBalanceCount = async () => {
    try {
      const assignedIds = await getAssignedCustomerIds();

      let query = supabase
        .from('customer_balances')
        .select('*', { count: 'exact', head: true });

      // Apply access filter with chunking for count
      if (!isAdmin && !isMuhasebe && assignedIds.length > 0) {
        // For count queries, if we have too many IDs, just return a rough estimate
        if (assignedIds.length > 1000) {
          console.log(`PaymentList Count: Too many IDs (${assignedIds.length}), returning estimate`);
          return assignedIds.length; // Rough estimate
        }
        query = query.in('customer_id', assignedIds);
      } else if (!isAdmin && !isMuhasebe) {
        query = query.filter('customer_id', 'eq', '00000000-0000-0000-0000-000000000000');
      }

      const { count, error } = await query;

      if (error) throw error;

      return count || 0;
    } catch (err) {
      console.error("Customer balance count error:", err);
      return 0;
    }
  };

  // Fetch customer balances by page
  const fetchCustomerBalancesPage = async (page = 0, pageSize = pagination.pageSize) => {
    console.log(`PaymentList: fetchCustomerBalancesPage called - page: ${page}, pageSize: ${pageSize}`);
    setLoading(true);
    try {
      // Get assigned IDs first
      const assignedIds = await getAssignedCustomerIds();
      console.log(`PaymentList: Got ${assignedIds.length} assigned customer IDs`);

      // Get total count first
      console.log(`PaymentList: Fetching customer balance count...`);
      const totalCount = await fetchCustomerBalanceCount();
      console.log(`PaymentList: Total count: ${totalCount}`);
      const totalPages = Math.ceil(totalCount / pageSize);

      // Update pagination
      setPagination({
        page,
        pageSize,
        total: totalCount,
        totalPages
      });

      // Calculate range
      const from = page * pageSize;
      const to = from + pageSize - 1;

      // Create paginated query
      let query = supabase
        .from('customer_balances')
        .select(`
          *,
          customers (
            id, name, code, sector_code
          )
        `)
        .range(from, to)
        .order('customer_id');

      let data = [];
      let error = null;

      // Apply access filter with chunking for large ID lists
      if (!isAdmin && !isMuhasebe && assignedIds.length > 0) {
        // If too many IDs, chunk them to avoid URL length issues
        const CHUNK_SIZE = 200; // Safe limit for URL length
        console.log(`PaymentList: Processing ${assignedIds.length} customer IDs`);

        if (assignedIds.length > CHUNK_SIZE) {
          console.log(`PaymentList: Using chunking with ${Math.ceil(assignedIds.length / CHUNK_SIZE)} chunks`);
          // Process in chunks
          for (let i = 0; i < assignedIds.length; i += CHUNK_SIZE) {
            const chunk = assignedIds.slice(i, i + CHUNK_SIZE);
            console.log(`PaymentList: Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(assignedIds.length / CHUNK_SIZE)} with ${chunk.length} IDs`);

            const chunkQuery = supabase
              .from('customer_balances')
              .select(`
                *,
                customers (
                  id, name, code, sector_code
                )
              `)
              .range(from, to)
              .in('customer_id', chunk)
              .order('customer_id');

            const { data: chunkData, error: chunkError } = await chunkQuery;

            if (chunkError) {
              console.error(`PaymentList: Chunk ${Math.floor(i / CHUNK_SIZE) + 1} error:`, chunkError);
              error = chunkError;
              break;
            }

            console.log(`PaymentList: Chunk ${Math.floor(i / CHUNK_SIZE) + 1} returned ${chunkData?.length || 0} records`);
            if (chunkData) {
              data = [...data, ...chunkData];
            }
          }
          console.log(`PaymentList: Chunking completed. Total records: ${data.length}`);
        } else {
          // Small list, use normal query
          query = query.in('customer_id', assignedIds);
          const { data: queryData, error: queryError } = await query;
          data = queryData;
          error = queryError;
        }
      } else if (!isAdmin && !isMuhasebe) {
        query = query.filter('customer_id', 'eq', '00000000-0000-0000-0000-000000000000');
        const { data: queryData, error: queryError } = await query;
        data = queryData;
        error = queryError;
      } else {
        // Admin/muhasebe - no filter needed
        const { data: queryData, error: queryError } = await query;
        data = queryData;
        error = queryError;
      }

      if (error) throw error;

      // Process the data
      const processedData = await processBalanceData(data || []);
      setBalances(processedData.filteredBalances);
      setAllRecords(data || []); // Store raw data for export

      // Update stats
      setStats(processedData.stats);

      // Fetch last note dates
      if (processedData.filteredBalances.length > 0) {
        const customerIds = processedData.filteredBalances.map(balance => balance.customer_id);
        fetchLastNoteDates(customerIds);
      }

    } catch (err) {
      console.error("Customer balance page fetch error:", err);
      setError(err.message);
      toast.error("Veriler yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  // Filter-specific data loading for upcoming/overdue filters
  const fetchFilteredData = async () => {
    setLoading(true);
    try {

      // Get user access control
      const assignedIds = await getAssignedCustomerIds();

      // Create base query
      let query = supabase
        .from('customer_balances')
        .select(`
          *,
          customers (
            id, name, code, sector_code
          )
        `);

      // Build base query conditions first
      const baseConditions = [];
      let orderField = 'customer_id';

      // Apply filter-specific conditions first
      if (filterType === 'upcoming') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const futureDate = addDays(today, dateRange);

        baseConditions.push(
          q => q.not('not_due_date', 'is', null)
            .gte('not_due_date', today.toISOString())
            .lte('not_due_date', futureDate.toISOString())
            .gt('not_due_balance', VadeHelper.MIN_BALANCE)
        );
        orderField = 'not_due_date';
      } else if (filterType === 'overdue') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        baseConditions.push(
          q => q.not('past_due_date', 'is', null)
            .lt('past_due_date', today.toISOString())
            .gt('past_due_balance', VadeHelper.MIN_BALANCE)
        );
        orderField = 'past_due_date';
      }

      let data = [];
      let error = null;

      // Apply access filter with chunking for large ID lists
      if (!isAdmin && !isMuhasebe && assignedIds.length > 0) {
        const CHUNK_SIZE = 200;
        if (assignedIds.length > CHUNK_SIZE) {
          // Process in chunks
          for (let i = 0; i < assignedIds.length; i += CHUNK_SIZE) {
            const chunk = assignedIds.slice(i, i + CHUNK_SIZE);
            let chunkQuery = supabase
              .from('customer_balances')
              .select(`
                *,
                customers (
                  id, name, code, sector_code
                )
              `)
              .in('customer_id', chunk);

            // Apply base conditions
            baseConditions.forEach(condition => {
              chunkQuery = condition(chunkQuery);
            });

            // Apply ordering
            chunkQuery = chunkQuery.order(orderField);

            const { data: chunkData, error: chunkError } = await chunkQuery;

            if (chunkError) {
              error = chunkError;
              break;
            }

            if (chunkData) {
              data = [...data, ...chunkData];
            }
          }
        } else {
          // Small list, use normal query
          query = query.in('customer_id', assignedIds);
          baseConditions.forEach(condition => {
            query = condition(query);
          });
          query = query.order(orderField);
          const { data: queryData, error: queryError } = await query;
          data = queryData;
          error = queryError;
        }
      } else if (!isAdmin && !isMuhasebe) {
        query = query.filter('customer_id', 'eq', '00000000-0000-0000-0000-000000000000');
        baseConditions.forEach(condition => {
          query = condition(query);
        });
        query = query.order(orderField);
        const { data: queryData, error: queryError } = await query;
        data = queryData;
        error = queryError;
      } else {
        // Admin/muhasebe - no customer filter needed
        baseConditions.forEach(condition => {
          query = condition(query);
        });
        query = query.order(orderField);
        const { data: queryData, error: queryError } = await query;
        data = queryData;
        error = queryError;
      }

      if (error) throw error;

      // Process the data
      const processedData = await processBalanceData(data || []);
      setBalances(processedData.filteredBalances);
      setAllRecords(data || []);

      // Update stats
      setStats(processedData.stats);

      // For filtered data, set pagination to show all results on one page
      setPagination({
        page: 0,
        pageSize: processedData.filteredBalances.length,
        total: processedData.filteredBalances.length,
        totalPages: 1
      });

      // Fetch last note dates
      if (processedData.filteredBalances.length > 0) {
        const customerIds = processedData.filteredBalances.map(balance => balance.customer_id);
        fetchLastNoteDates(customerIds);
      }

    } catch (err) {
      console.error("Filtered data fetch error:", err);
      setError(err.message);
      toast.error("Veriler yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  // Legacy fetchData function for backward compatibility
  const fetchData = async (force = false) => {
    console.log(`PaymentList: fetchData called - filterType: ${filterType}, force: ${force}`);
    if (filterType === 'upcoming' || filterType === 'overdue') {
      // Use filter-specific loading for filtered views
      console.log(`PaymentList: Using fetchFilteredData for ${filterType}`);
      fetchFilteredData();
    } else {
      // Use paginated loading for 'all' view
      console.log(`PaymentList: Using fetchCustomerBalancesPage for 'all' view`);
      fetchCustomerBalancesPage(0);
    }
  };

  // Sıralama fonksiyonu
  const sortData = (data) => {
    if (!sortConfig.key) {
      // Varsayılan sıralama - tarihe göre
      return data.sort((a, b) => {
        // Yaklaşanlar görünümünde sadece not_due_date'e bakıyoruz
        if (filterType === 'upcoming') {
          if (!a.not_due_date && !b.not_due_date) return 0;
          if (!a.not_due_date) return 1;
          if (!b.not_due_date) return -1;
          
          const aDate = new Date(a.not_due_date);
          const bDate = new Date(b.not_due_date);
          
          // En yakın vadeler önce
          return aDate - bDate;
        }
        
        // Diğer görünümler için standart effective_due_date kontrolü
        if (!a.effective_due_date && !b.effective_due_date) return 0;
        if (!a.effective_due_date) return 1;
        if (!b.effective_due_date) return -1;
        
        const aDate = new Date(a.effective_due_date);
        const bDate = new Date(b.effective_due_date);
        
        if (filterType === 'overdue') {
          // Vadesi en çok geçenler önce
          return aDate - bDate;
        } else {
          // En yakın vadeler önce
          return aDate - bDate;
        }
      });
    }

    return [...data].sort((a, b) => {
      // Müşteri adı için sıralama
      if (sortConfig.key === 'customer_name') {
        if (!a.customers || !b.customers) return 0;
        const aValue = a.customers.name || '';
        const bValue = b.customers.name || '';
        
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      }
      
      // Son not tarihi için sıralama - YENİ EKLENDİ
      if (sortConfig.key === 'last_note_date') {
        const aDate = lastNoteDates[a.customer_id] ? new Date(lastNoteDates[a.customer_id]) : null;
        const bDate = lastNoteDates[b.customer_id] ? new Date(lastNoteDates[b.customer_id]) : null;
        
        // Tarih olmayanları en sona koy
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        
        return sortConfig.direction === 'ascending'
          ? aDate - bDate
          : bDate - aDate;
      }
      
      // Vade tarihi için sıralama - 'Yaklaşanlar' filtresinde not_due_date kullan
      if (sortConfig.key === 'due_date') {
        if (filterType === 'upcoming') {
          if (!a.not_due_date && !b.not_due_date) return 0;
          if (!a.not_due_date) return sortConfig.direction === 'ascending' ? 1 : -1;
          if (!b.not_due_date) return sortConfig.direction === 'ascending' ? -1 : 1;
          
          const aDate = new Date(a.not_due_date);
          const bDate = new Date(b.not_due_date);
          
          return sortConfig.direction === 'ascending' 
            ? aDate - bDate 
            : bDate - aDate;
        } else {
          // Normal effective_due_date sıralaması
          if (!a.effective_due_date && !b.effective_due_date) return 0;
          if (!a.effective_due_date) return sortConfig.direction === 'ascending' ? 1 : -1;
          if (!b.effective_due_date) return sortConfig.direction === 'ascending' ? -1 : 1;
          
          const aDate = new Date(a.effective_due_date);
          const bDate = new Date(b.effective_due_date);
          
          return sortConfig.direction === 'ascending' 
            ? aDate - bDate 
            : bDate - aDate;
        }
      }
      
      // Diğer sayısal alanlar için sıralama
      let aValue, bValue;
      
      if (sortConfig.key === 'calculated_past_due') {
        aValue = a.calculated_past_due || 0;
        bValue = b.calculated_past_due || 0;
      } else if (sortConfig.key === 'calculated_not_due') {
        aValue = a.calculated_not_due || 0;
        bValue = b.calculated_not_due || 0;
      } else if (sortConfig.key === 'calculated_total') {
        aValue = a.calculated_total || 0;
        bValue = b.calculated_total || 0;
      } else {
        aValue = a[sortConfig.key] || 0;
        bValue = b[sortConfig.key] || 0;
      }
      
      if (aValue < bValue) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
  };

  // Since we now search at database level, no client-side filtering needed
  const filteredBalances = balances;

  // Page change handler
  const handlePageChange = (newPage) => {
    if (newPage >= 0 && newPage < pagination.totalPages) {
      fetchCustomerBalancesPage(newPage);
    }
  };

  // İlk yükleme için ve filtre değişikliklerinde verileri getir
  // KEY FIX: Wait for access loading before fetching data
  useEffect(() => {
    if (!accessLoading) {
      fetchData(true); // Yeni filtreyi uygulamak için force true
    }
  }, [filterType, dateRange, location.search, accessLoading]);

  // KEY FIX: Initial data load - removed timeout and accessLoading check
  useEffect(() => {
    if (!accessLoading) {
      fetchData(true); // Force data fetch on initial render
    }
  }, [accessLoading]);

  // Sıralama değiştiğinde verileri yeniden sırala
  useEffect(() => {
    if (balances.length > 0) {
      setBalances(sortData([...balances]));
    }
  }, [sortConfig]);

  // Gösterilecek status badge'i belirle - DÜZELTME YAPILDI
  const getStatusBadge = (balance) => {
    // 'Yaklaşanlar' filtresinde sadece not_due_date ve not_due_balance değerlerini kullan
    if (filterType === 'upcoming') {
      // Vadesi geçmemiş bakiye tarihi mutlaka olmalı
      if (!balance.not_due_date) {
        return { text: 'Vade Tarihi Yok', class: 'badge-danger' };
      }
      
      const notDueDate = new Date(balance.not_due_date);
      notDueDate.setHours(0, 0, 0, 0);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Tarihler arasındaki farkı hesapla (gün olarak)
      const diffMs = notDueDate.getTime() -today.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      
      if (diffDays < 0) {
        // Vade tarihi geçmiş (yaklaşan vadelerde gösterilmemeli)
        return { 
          text: `${Math.abs(diffDays)} gün gecikmiş`, 
          class: 'badge-danger' 
        };
      } else if (diffDays === 0) {
        // Bugün
        return { text: 'Bugün', class: 'badge-warning' };
      } else if (diffDays === 1) {
        // Yarın
        return { text: 'Yarın', class: 'badge-warning' };
      } else if (diffDays <= 3) {
        // Yakın gelecek (2-3 gün)
        return { text: `${diffDays} gün kaldı`, class: 'badge-warning' };
      } else {
        // Uzak gelecek
        return { text: `${diffDays} gün kaldı`, class: 'badge-info' };
      }
    }

    // Normal durum (Tümü veya Vadesi Geçmiş filtresi)
    if (!balance.effective_due_date) {
      // Vade tarihi belirsiz olan kayıtları vadesi geçmiş olarak işaretle
      return { text: 'Vadesi Geçmiş (Belirsiz)', class: 'badge-danger' };
    }
    
    const dueDate = new Date(balance.effective_due_date);
    // Saat bilgilerini sıfırlayarak iki tarihi karşılaştırma
    dueDate.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Tarihler arasındaki farkı hesapla (gün olarak)
    const diffMs = dueDate.getTime() - today.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    // Sonucu logla
    
    if (diffDays < 0) {
      // Vade tarihi geçmiş
      return { 
        text: `${Math.abs(diffDays)} gün gecikmiş`, 
        class: 'badge-danger' 
      };
    } else if (diffDays === 0) {
      // Bugün
      return { text: 'Bugün', class: 'badge-warning' };
    } else if (diffDays === 1) {
      // Yarın
      return { text: 'Yarın', class: 'badge-warning' };
    } else if (diffDays <= 3) {
      // Yakın gelecek (2-3 gün)
      return { text: `${diffDays} gün kaldı`, class: 'badge-warning' };
    } else {
      // Uzak gelecek
      return { text: `${diffDays} gün kaldı`, class: 'badge-info' };
    }
  };

  // Para birimi formatla
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', { 
      style: 'currency', 
      currency: 'TRY' 
    }).format(Math.abs(amount || 0));
  };
  
  // Excel dosyasına aktarma fonksiyonu
  const exportToExcel = (exportType) => {
    setExporting(true);
    try {
      let dataToExport = [];
      let filename = '';
      
      // Hangi verileri dışa aktaracağımızı belirle
      if (exportType === 'filtered') {
        dataToExport = filteredBalances;
        filename = `vade-takip-${filterType}-${new Date().toISOString().slice(0,10)}.xlsx`;
      } else if (exportType === 'all') {
        dataToExport = allRecords;
        filename = `vade-takip-tum-veriler-${new Date().toISOString().slice(0,10)}.xlsx`;
      }
      
      // Veri yoksa uyarı göster ve çık
      if (dataToExport.length === 0) {
        toast.warning('Dışa aktarılacak veri bulunamadı');
        setExporting(false);
        return;
      }
      
      // Excel formatına dönüştürülecek veriyi hazırla
      const excelData = dataToExport.map(row => {
        // Vade tarihini formatla
        let effectiveDueDate = '-';
        if (row.effective_due_date) {
          effectiveDueDate = format(new Date(row.effective_due_date), 'dd.MM.yyyy', { locale: tr });
        } else if (row.past_due_date) {
          effectiveDueDate = format(new Date(row.past_due_date), 'dd.MM.yyyy', { locale: tr });
        } else if (row.not_due_date) {
          effectiveDueDate = format(new Date(row.not_due_date), 'dd.MM.yyyy', { locale: tr });
        }
        
        // Bakiyeler
        const pastDueBalance = parseFloat(row.past_due_balance || row.calculated_past_due || 0);
        const notDueBalance = parseFloat(row.not_due_balance || row.calculated_not_due || 0);
        const totalBalance = parseFloat(row.total_balance || row.calculated_total || 0) || (pastDueBalance + notDueBalance);
        
        // Veri satırını oluştur
        return {
          'Müşteri Kodu': row.customers?.code || '-',
          'Müşteri Adı': row.customers?.name || '-',
          'Sektör': row.customers?.sector_code || '-',
          'Vade Tarihi': effectiveDueDate,
          'Vadesi Geçmiş Bakiye': pastDueBalance,
          'Vadesi Geçmemiş Bakiye': notDueBalance,
          'Toplam Bakiye': totalBalance,
          'Bakiyesi Sıfır mı': Math.abs(totalBalance) < 0.01 ? 'Evet' : 'Hayır',
          'Past Due Date': row.past_due_date || '-',
          'Not Due Date': row.not_due_date || '-',
          'Due Date': row.due_date || '-'
        };
      });
      
      // Excel çalışma kitabı oluştur
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Vade Takip');
      
      // Otomatik sütun genişlikleri ayarla
      const maxWidth = excelData.reduce((w, r) => Math.max(w, r['Müşteri Adı']?.length || 0), 10);
      const colWidths = [
        { wch: 15 }, // Müşteri Kodu
        { wch: maxWidth }, // Müşteri Adı
        { wch: 12 }, // Sektör
        { wch: 12 }, // Vade Tarihi
        { wch: 18 }, // Vadesi Geçmiş Bakiye
        { wch: 18 }, // Vadesi Geçmemiş Bakiye
        { wch: 15 }, // Toplam Bakiye
        { wch: 15 }, // Bakiyesi Sıfır mı
        { wch: 12 }, // Past Due Date
        { wch: 12 }, // Not Due Date
        { wch: 12 }  // Due Date
      ];
      worksheet['!cols'] = colWidths;
      
      // Excel dosyasını indir
      XLSX.writeFile(workbook, filename);
      
      toast.success('Excel dosyası oluşturuldu ve indirildi');
    } catch (err) {
      console.error('Excel dışa aktarma hatası:', err);
      toast.error('Excel dosyası oluşturulurken bir hata oluştu');
    } finally {
      setExporting(false);
    }
  };

  // Hata durumunda göster
  if (error) {
    return (
      <div className="card" style={{ padding: '20px', backgroundColor: '#f8d7da', color: '#721c24' }}>
        <h3>Bir hata oluştu!</h3>
        <p>{error}</p>
        <button 
          onClick={() => {
            fetchData(true);
          }} 
          className="btn btn-warning"
          style={{ marginTop: '10px' }}
        >
          Sayfayı Yenile
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '10px'
        }}
      >
        <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Vade Takip Listesi</h1>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {/* Filter Selection */}
          <div>
            <Link
              to="/payments"
              className={`btn ${filterType === 'all' || !filterType ? 'btn-primary' : ''}`}
              style={{ padding: '6px 12px' }}
            >
              Tümü
            </Link>
            <Link
              to="/payments?filter=upcoming"
              className={`btn ${filterType === 'upcoming' ? 'btn-primary' : ''}`}
              style={{ padding: '6px 12px' }}
            >
              Yaklaşanlar
            </Link>
            <Link
              to="/payments?filter=overdue"
              className={`btn ${filterType === 'overdue' ? 'btn-primary' : ''}`}
              style={{ padding: '6px 12px' }}
            >
              Vadesi Geçmiş
            </Link>
          </div>
          
          <button 
            onClick={() => {
              fetchData(true);
            }} 
            className="btn"
            style={{ padding: '6px 12px' }}
            disabled={loading}
          >
            {loading ? 'Yükleniyor...' : 'Yenile'}
          </button>
        </div>
      </div>
      
      {/* Search Input */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Müşteri adı, kodu veya sektör ile ara..."
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
        />
      </div>
      
      {/* Date range for upcoming payments */}
      {filterType === 'upcoming' && (
        <div className="card" style={{ marginBottom: '20px', padding: '15px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
            Vade Aralığı Seçimi
          </h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button 
              onClick={() => handleDateRangeChange(7)}
              className={`btn ${dateRange === 7 ? 'btn-primary' : ''}`}
            >
              7 Gün
            </button>
            <button 
              onClick={() => handleDateRangeChange(15)}
              className={`btn ${dateRange === 15 ? 'btn-primary' : ''}`}
            >
              15 Gün
            </button>
            <button 
              onClick={() => handleDateRangeChange(30)}
              className={`btn ${dateRange === 30 ? 'btn-primary' : ''}`}
            >
              30 Gün
            </button>
            <button 
              onClick={() => handleDateRangeChange(60)}
              className={`btn ${dateRange === 60 ? 'btn-primary' : ''}`}
            >
              60 Gün
            </button>
            <button 
              onClick={() => handleDateRangeChange(90)}
              className={`btn ${dateRange === 90 ? 'btn-primary' : ''}`}
            >
              90 Gün
            </button>
          </div>
          <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
            {filterType === 'upcoming' && (
              `Bugünden itibaren ${dateRange} gün içindeki vadeler gösteriliyor.`
            )}
          </p>
        </div>
      )}
      
      {/* Özet ve toplamlar */}
      <div className="card" style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#eaf7ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <p>
              <strong>Sayfa:</strong> {pagination.page + 1}/{pagination.totalPages} |
              <strong> Gösterilen:</strong> {balances.length} |
              <strong> Yüklenen:</strong> {allRecords.length} / {pagination.pageSize} |
              <strong> Toplam:</strong> {pagination.total} |
              <strong> Filtre:</strong> {
                filterType === 'upcoming' ? 'Yaklaşanlar' :
                filterType === 'overdue' ? 'Vadesi Geçmiş' : 'Tümü'
              }
              {filterType !== 'all' && <span className="badge badge-info" style={{ marginLeft: '5px' }}>Min: {VadeHelper.MIN_BALANCE}₺</span>}
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={() => exportToExcel('filtered')} 
              className="btn btn-success"
              disabled={exporting || filteredBalances.length === 0}
              style={{ padding: '6px 12px' }}
            >
              {exporting ? 'İndiriliyor...' : 'Filtrelenmiş Verileri İndir'}
            </button>
            
            <button 
              onClick={() => exportToExcel('all')} 
              className="btn"
              disabled={exporting || allRecords.length === 0}
              style={{ padding: '6px 12px', backgroundColor: '#f39c12', color: 'white' }}
            >
              {exporting ? 'İndiriliyor...' : 'Tüm Verileri İndir'}
            </button>
          </div>
        </div>
        
        {/* Bakiye Toplamları */}
        <div className="stats-grid" style={{ marginTop: '15px' }}>
          <div className="stat-card">
            <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Toplam Vadesi Geçmiş Bakiye</h3>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#e74c3c' }}>
              {formatCurrency(stats.totalPastDueBalance)}
            </p>
          </div>
          
          <div className="stat-card">
            <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Toplam Vadesi Geçmemiş Bakiye</h3>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#3498db' }}>
              {formatCurrency(stats.totalNotDueBalance)}
            </p>
          </div>
          
          <div className="stat-card">
            <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Toplam Bakiye</h3>
            <p style={{ fontSize: '18px', fontWeight: 'bold' }}>
              {formatCurrency(stats.totalBalance)}
            </p>
          </div>
        </div>
      </div>
      
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Yükleniyor...</div>
      ) : (
        <div className="card">
          {filteredBalances.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
                  <tr>
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('customer_name')}>
                      Müşteri {getSortDirectionIcon('customer_name')}
                    </th>
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('due_date')}>
                      Vade Tarihi {getSortDirectionIcon('due_date')}
                    </th>
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('calculated_past_due')}>
                      Vadesi Geçmiş Bakiye {getSortDirectionIcon('calculated_past_due')}
                    </th>
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('calculated_not_due')}>
                      Vadesi Geçmemiş Bakiye {getSortDirectionIcon('calculated_not_due')}
                    </th>
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('calculated_total')}>
                      Toplam Bakiye {getSortDirectionIcon('calculated_total')}
                    </th>
                    {/* Son Not Tarihi Kolonu - YENİ EKLENDİ */}
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('last_note_date')}>
                      Son Not {getSortDirectionIcon('last_note_date')}
                    </th>
                    <th>Durum</th>
                    <th>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBalances.map((balance) => {
                    const status = getStatusBadge(balance);
                    
                    // Son not tarihi ve kaç gün önce eklendiği bilgisi - YENİ EKLENDİ
                    const lastNoteDate = lastNoteDates[balance.customer_id] || null;
                    const daysSinceLastNote = lastNoteDate ? calculateDaysSinceLastNote(balance.customer_id) : null;

                    return (
                      <tr key={balance.id}>
                        <td>
                          <div style={{ fontWeight: 'bold' }}>
                            {balance.customers?.name || '-'}
                          </div>
                          <div style={{ fontSize: '12px', color: '#888' }}>
                            {balance.customers?.code || '-'}
                          </div>
                        </td>
                        <td>
                          {filterType === 'upcoming' && balance.not_due_date
                            ? format(new Date(balance.not_due_date), 'dd.MM.yyyy', { locale: tr })
                            : balance.effective_due_date
                              ? format(new Date(balance.effective_due_date), 'dd.MM.yyyy', { locale: tr })
                              : '-'}
                        </td>
                        <td style={{ color: balance.calculated_past_due > 0 ? '#e74c3c' : 'inherit' }}>
                          {formatCurrency(balance.calculated_past_due)}
                        </td>
                        <td>
                          {formatCurrency(balance.calculated_not_due)}
                        </td>
                        <td style={{ fontWeight: 'bold' }}>
                          {formatCurrency(balance.calculated_total)}
                        </td>
                        {/* Son Not Tarihi Hücresi - YENİ EKLENDİ */}
                        <td>
                          {lastNoteDate ? (
                            <div>
                              <div style={{ fontSize: '12px' }}>
                                {format(new Date(lastNoteDate), 'dd.MM.yyyy', { locale: tr })}
                              </div>
                              {daysSinceLastNote !== null && (
                                <div style={{ 
                                  fontSize: '11px',
                                  color: daysSinceLastNote > 30 ? '#e74c3c' : 
                                         daysSinceLastNote > 14 ? '#f39c12' : '#3498db',
                                  fontWeight: 'bold'
                                }}>
                                  {daysSinceLastNote === 0 ? 'Bugün' : 
                                   daysSinceLastNote === 1 ? 'Dün' : 
                                   `${daysSinceLastNote} gün önce`}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: '#888', fontSize: '12px' }}>Not yok</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${status.class}`}>{status.text}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                            <Link
                              to={`/customers/${balance.customer_id}`}
                              className="btn btn-primary"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                            >
                              Detay
                            </Link>
                            {/* Notları Görüntüle Butonu - YENİ EKLENDİ */}
                            <button
                              onClick={() => openNotesModal(balance.customer_id, balance.customers?.name || 'Müşteri')}
                              className="btn"
                              style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#3498db', color: 'white' }}
                            >
                              Notları Görüntüle
                            </button>
                            <button
                              onClick={() => openQuickNote(balance.customer_id, balance.customers?.name || 'Müşteri')}
                              className="btn"
                              style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#2ecc71', color: 'white' }}
                            >
                              Not Ekle
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
              <p style={{ marginBottom: '20px' }}>
                {searchTerm.trim() ? (
                  'Arama kriterlerine uygun kayıt bulunamadı.'
                ) : filterType === 'upcoming' ? (
                  `Belirtilen ${dateRange} günlük vade aralığında kayıt bulunamadı.`
                ) : filterType === 'overdue' ? (
                  'Vadesi geçmiş kayıt bulunamadı.'
                ) : (
                  'Kayıt bulunamadı.'
                )}
              </p>
              {(isAdmin || isMuhasebe) && (
                <Link to="/import" className="btn btn-primary">
                  Excel Veri İçe Aktarma
                </Link>
              )}
            </div>
          )}

          {/* Pagination controls */}
          {!searchTerm.trim() && pagination.totalPages > 1 && (
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
                {searchTerm.trim() ?
                  `${filteredBalances.length} kayıt bulundu` :
                  `${filteredBalances.length} kayıt gösteriliyor (toplam ${pagination.total})`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Hızlı Not Modal */}
      {quickNoteData.show && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 999
        }}>
          <QuickNoteForm 
            customerId={quickNoteData.customerId}
            customerName={quickNoteData.customerName}
            onClose={closeQuickNote}
            onSubmit={() => {
              fetchData(true);
            }}
          />
        </div>
      )}

      {/* Notları Görüntüleme Modal - YENİ EKLENDİ */}
      {notesModalData.show && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 999
        }}>
          <NotesModal 
            customerId={notesModalData.customerId}
            customerName={notesModalData.customerName}
            onClose={closeNotesModal}
          />
        </div>
      )}
    </div>
  );
};

export default PaymentList;