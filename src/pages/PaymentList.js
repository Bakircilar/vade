import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { format, differenceInDays, addDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'react-toastify';

const PaymentList = () => {
  // Müşteri/Tedarikçi seçimi için state
  const [viewMode, setViewMode] = useState('customer'); // 'customer' veya 'supplier'
  
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const filterType = searchParams.get('filter') || 'all';
  const [dateRange, setDateRange] = useState(30); // Yaklaşan vadeler için 30 gün
  const [debug, setDebug] = useState({
    filterType: filterType,
    viewMode: 'customer',
    dataCount: 0,
    filteredCount: 0,
    dateRange: 30,
    examples: [],
    customerCount: 0,
    supplierCount: 0
  });
  
  // Görünüm modunu değiştirme fonksiyonu
  const toggleViewMode = (mode) => {
    setViewMode(mode);
    setDebug(prev => ({ ...prev, viewMode: mode }));
  };

  const fetchBalances = useCallback(async () => {
    setLoading(true);
    setDebug(prev => ({ ...prev, overdueItems: [] }));
    
    try {
      console.log("Filtre tipi:", filterType);
      console.log("Görünüm modu:", viewMode);
      
      // Tüm bakiyeleri müşteri bilgileriyle birlikte getir
      const { data, error } = await supabase
        .from('customer_balances')
        .select(`
          *,
          customers (
            id,
            code,
            name,
            sector_code,
            group_code,
            region_code
          )
        `);

      if (error) throw error;

      if (!data || data.length === 0) {
        setBalances([]);
        setLoading(false);
        return;
      }
      
      // Tarihleri ve bakiyeleri normalleştir
      const normalizedData = data.map(item => {
        // Eski ve yeni vade tarihi alanlarını kontrol et
        // Geriye dönük uyumluluk - eski verilerde due_date var ama past_due_date yok
        const hasDueDate = item.due_date !== null && item.due_date !== undefined;
        const hasPastDueDate = item.past_due_date !== null && item.past_due_date !== undefined;
        const hasNotDueDate = item.not_due_date !== null && item.not_due_date !== undefined;
        
        // Eski sistemde kullanılan due_date değerini past_due_date'e kopyala
        const pastDueDate = hasPastDueDate && item.past_due_date ? item.past_due_date : 
                           (hasDueDate && item.due_date ? item.due_date : null);
        
        // Bakiyeleri normalleştir
        const pastDueBalance = parseFloat(item.past_due_balance) || 0;
        const notDueBalance = parseFloat(item.not_due_balance) || 0;
        const totalBalance = parseFloat(item.total_balance) || 0;
        
        // Hesaplanan toplam bakiye
        const calculatedTotalBalance = (pastDueBalance + notDueBalance) !== 0 ? 
                                     (pastDueBalance + notDueBalance) : totalBalance;
        
        return {
          ...item,
          past_due_date: pastDueDate,
          not_due_date: hasNotDueDate && item.not_due_date ? item.not_due_date : null,
          past_due_balance: pastDueBalance,
          not_due_balance: notDueBalance,
          calculated_total_balance: calculatedTotalBalance
        };
      });
      
      // Müşteri/Tedarikçi ayrımı yap - TOPLAM BAKİYE işaretine göre
      const customerData = normalizedData.filter(item => item.calculated_total_balance > 0);
      const supplierData = normalizedData.filter(item => item.calculated_total_balance < 0);
      
      // Aktif veri seti (müşteri veya tedarikçi)
      const activeData = viewMode === 'customer' ? customerData : supplierData;
      
      // Debug için ilk birkaç örneği al
      const examples = activeData.slice(0, 5).map(item => ({
        customer: item.customers?.name || 'İsimsiz',
        due_date: item.due_date || 'Eski vade tarihi yok',
        past_due_date: item.past_due_date || 'Vadesi geçen tarih yok',
        not_due_date: item.not_due_date || 'Vadesi geçmeyen tarih yok',
        past_due_balance: item.past_due_balance,
        not_due_balance: item.not_due_balance,
        total_balance: item.total_balance,
        calculated_total_balance: item.calculated_total_balance
      }));
      
      setDebug(prev => ({ 
        ...prev, 
        dataCount: data.length,
        customerCount: customerData.length,
        supplierCount: supplierData.length,
        examples
      }));

      // Bugünkü tarih
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Bugünün başlangıcı (saat 00:00:00)
      
      // Filtreleme için tarihler
      const futureDate = addDays(today, dateRange); // Yaklaşan vadeler için X gün sonrası
      
      // Debug için tarih aralığı
      console.log("Bugün:", today.toISOString().split('T')[0]);
      console.log("Bitiş tarihi:", futureDate.toISOString().split('T')[0]);
      
      setDebug(prev => ({ 
        ...prev, 
        dateRange,
        today: today.toISOString().split('T')[0],
        futureDate: futureDate.toISOString().split('T')[0]
      }));

      // Filtrele
      let filteredBalances = [];
      
      if (filterType === 'upcoming') {
        // Yaklaşan vadeleri filtrele - Her iki vade tarihini de kontrol et
        filteredBalances = activeData.filter(balance => {
          // Eski due_date VEYA yeni past_due_date ve not_due_date'e bakarak filtreleme yap
          const dueDate = balance.due_date ? new Date(balance.due_date) : null;
          const pastDueDate = balance.past_due_date ? new Date(balance.past_due_date) : null;
          const notDueDate = balance.not_due_date ? new Date(balance.not_due_date) : null;
          
          // Tarihler için saat kısmını sıfırla
          if (dueDate) dueDate.setHours(0, 0, 0, 0);
          if (pastDueDate) pastDueDate.setHours(0, 0, 0, 0);
          if (notDueDate) notDueDate.setHours(0, 0, 0, 0);
          
          // Herhangi bir vade tarihi yaklaşan mı? (due_date'den veya past_due_date'den)
          const isDueInRange = dueDate && dueDate >= today && dueDate <= futureDate;
          const isPastDueInRange = pastDueDate && pastDueDate >= today && pastDueDate <= futureDate;
          const isNotDueInRange = notDueDate && notDueDate >= today && notDueDate <= futureDate;
          
          // Vade yaklaşıyor mu? (eski veya yeni format)
          return isDueInRange || isPastDueInRange || isNotDueInRange;
        });
      } else if (filterType === 'overdue') {
        // Vadesi geçenleri filtrele - Eski due_date VEYA yeni past_due_date'e bakıyoruz
        filteredBalances = activeData.filter(balance => {
          const dueDate = balance.due_date ? new Date(balance.due_date) : null;
          const pastDueDate = balance.past_due_date ? new Date(balance.past_due_date) : null;
          
          // Tarihler için saat kısmını sıfırla
          if (dueDate) dueDate.setHours(0, 0, 0, 0);
          if (pastDueDate) pastDueDate.setHours(0, 0, 0, 0);
          
          // Vadesi geçmiş mi? (due_date veya past_due_date'den herhangi biri)
          const isDueOverdue = dueDate && dueDate < today;
          const isPastDueOverdue = pastDueDate && pastDueDate < today;
          const isOverdue = isDueOverdue || isPastDueOverdue;
          
          // Debug için vadesi geçen örnekleri ekle
          if (isOverdue) {
            setDebug(prev => ({
              ...prev, 
              overdueItems: [...(prev.overdueItems || []), {
                customer: balance.customers?.name,
                due_date: balance.due_date,
                past_due_date: balance.past_due_date,
                today: today.toISOString().split('T')[0],
                isDueOverdue,
                isPastDueOverdue,
                past_due_balance: balance.past_due_balance
              }]
            }));
          }
          
          // Sadece vadesi geçmiş olanları göster
          return isOverdue;
        });
      } else {
        // "Tümü" filtresi için tüm kayıtları göster
        filteredBalances = activeData;
      }

      setDebug(prev => ({ 
        ...prev, 
        filteredCount: filteredBalances.length 
      }));

      // Vade tarihine göre sırala
      filteredBalances.sort((a, b) => {
        // Her kayıt için en uygun vade tarihini belirle (eski veya yeni format)
        const getEffectiveDueDate = (balance) => {
          // Öncelik past_due_date'e, sonra due_date'e
          if (balance.past_due_date) return new Date(balance.past_due_date);
          if (balance.due_date) return new Date(balance.due_date);
          if (balance.not_due_date) return new Date(balance.not_due_date);
          return null;
        };
        
        const aDate = getEffectiveDueDate(a);
        const bDate = getEffectiveDueDate(b);
        
        if (!aDate) return 1;
        if (!bDate) return -1;
        return aDate - bDate;
      });

      setBalances(filteredBalances);
    } catch (error) {
      toast.error('Vade bilgileri yüklenirken bir hata oluştu');
      console.error('Error loading balances:', error);
      setDebug(prev => ({ ...prev, error: error.message }));
    } finally {
      setLoading(false);
    }
  }, [filterType, dateRange, viewMode]); // viewMode değişikliğinde verileri yeniden yükle

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const handleDateRangeChange = (days) => {
    setDateRange(days);
  };

  // Vade tarihini ve kalan günü hesapla (eski veya yeni format)
  const calculateDueInfo = (balance) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Geçerli vade tarihini bul (öncelik past_due_date'de, sonra due_date'de)
    let dueDate = null;
    
    // Önce past_due_date'i kontrol et
    if (balance.past_due_date) {
      dueDate = new Date(balance.past_due_date);
    } 
    // Sonra due_date'i kontrol et
    else if (balance.due_date) {
      dueDate = new Date(balance.due_date);
    }
    // Son olarak not_due_date'i kontrol et
    else if (balance.not_due_date) {
      dueDate = new Date(balance.not_due_date);
    }
    
    if (!dueDate) {
      return { date: null, daysLeft: null, isOverdue: false };
    }
    
    dueDate.setHours(0, 0, 0, 0);
    const daysLeft = differenceInDays(dueDate, today);
    const isOverdue = dueDate < today;
    
    return {
      date: dueDate,
      daysLeft,
      isOverdue
    };
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}
      >
        <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Vade Takip Listesi</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          {/* Müşteri/Tedarikçi Seçimi */}
          <button 
            onClick={() => toggleViewMode('customer')}
            className={`btn ${viewMode === 'customer' ? 'btn-primary' : ''}`}
            style={{ padding: '6px 12px' }}
          >
            Müşteriler
          </button>
          <button 
            onClick={() => toggleViewMode('supplier')}
            className={`btn ${viewMode === 'supplier' ? 'btn-primary' : ''}`}
            style={{ padding: '6px 12px' }}
          >
            Tedarikçiler
          </button>
          
          {/* Filtre Seçimi */}
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
          <button 
            onClick={fetchBalances} 
            className="btn"
            style={{ padding: '6px 12px' }}
            disabled={loading}
          >
            {loading ? 'Yükleniyor...' : 'Yenile'}
          </button>
        </div>
      </div>
      
      {/* Yaklaşan ödemeler için tarih aralığı ayarı */}
      {filterType === 'upcoming' && (
        <div className="card" style={{ marginBottom: '20px', padding: '15px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
            Vade Aralığı Seçimi
          </h3>
          <div style={{ display: 'flex', gap: '10px' }}>
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
      
      {/* DEBUG BİLGİSİ */}
      <div className="card" style={{ marginBottom: '20px', backgroundColor: '#f8f9fa', padding: '15px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>Debug Bilgisi</h3>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Görünüm Modu:</strong> {viewMode === 'customer' ? 'Müşteriler' : 'Tedarikçiler'}
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Filtre Tipi:</strong> {debug.filterType || 'all'}
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Müşteri Sayısı:</strong> {debug.customerCount || 0}
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Tedarikçi Sayısı:</strong> {debug.supplierCount || 0}
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Toplam Veri Sayısı:</strong> {debug.dataCount || 0}
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Filtrelenmiş Veri Sayısı:</strong> {debug.filteredCount || 0}
        </div>
        
        {filterType === 'upcoming' && (
          <div style={{ marginBottom: '10px' }}>
            <strong>Tarih Aralığı:</strong> {debug.today} - {debug.futureDate} ({dateRange} gün)
          </div>
        )}
        
        {debug.error && (
          <div style={{ color: '#dc3545', marginBottom: '10px' }}>
            <strong>Hata:</strong> {debug.error}
          </div>
        )}
        
        {filterType === 'overdue' && debug.overdueItems && debug.overdueItems.length > 0 && (
          <div style={{ marginBottom: '10px' }}>
            <strong>Vadesi Geçen Örnekler (İlk 5):</strong>
            <ul style={{ marginTop: '5px', fontSize: '12px' }}>
              {debug.overdueItems.slice(0, 5).map((item, idx) => (
                <li key={idx} style={{ marginBottom: '5px' }}>
                  {item.customer} - 
                  Due Date: {item.due_date} - 
                  Past Due Date: {item.past_due_date} - 
                  Bakiye: {item.past_due_balance}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {debug.examples && debug.examples.length > 0 && (
          <div>
            <strong>İlk 5 veri örneği:</strong>
            <ul style={{ marginTop: '5px', fontSize: '12px' }}>
              {debug.examples.map((item, idx) => (
                <li key={idx} style={{ marginBottom: '5px' }}>
                  {item.customer} - 
                  Due Date (eski): {item.due_date} - 
                  Past Due Date: {item.past_due_date} - 
                  Not Due Date: {item.not_due_date} - 
                  Bakiye: {item.calculated_total_balance}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Yükleniyor...</div>
      ) : (
        <div className="card">
          {balances.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>{viewMode === 'customer' ? 'Müşteri' : 'Tedarikçi'}</th>
                  <th>Vade Tarihi</th>
                  <th>Toplam Bakiye</th>
                  <th>Vadesi Geçen</th>
                  <th>Vade Durumu</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((balance) => {
                  // Vade bilgisini hesapla (eski veya yeni format)
                  const dueInfo = calculateDueInfo(balance);
                  
                  let statusClass = 'badge-info';
                  let statusText = 'Normal';

                  if (dueInfo.daysLeft !== null) {
                    if (dueInfo.daysLeft < 0) {
                      statusClass = 'badge-danger';
                      statusText = `${Math.abs(dueInfo.daysLeft)} gün gecikmiş`;
                    } else if (dueInfo.daysLeft <= 5) {
                      statusClass = 'badge-warning';
                      statusText = dueInfo.daysLeft === 0 ? 'Bugün' : `${dueInfo.daysLeft} gün kaldı`;
                    }
                  }

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
                        {dueInfo.date
                          ? format(dueInfo.date, 'dd.MM.yyyy', { locale: tr })
                          : '-'}
                      </td>
                      <td>
                        {balance.calculated_total_balance
                          ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Math.abs(balance.calculated_total_balance))
                          : '-'}
                      </td>
                      <td>
                        {balance.past_due_balance && parseFloat(balance.past_due_balance) !== 0
                          ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Math.abs(balance.past_due_balance))
                          : '-'}
                      </td>
                      <td>
                        <span className={`badge ${statusClass}`}>{statusText}</span>
                      </td>
                      <td>
                        <Link
                          to={`/customers/${balance.customer_id}`}
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
            <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
              <p style={{ marginBottom: '20px' }}>
                {filterType === 'upcoming' ? (
                  `Belirtilen ${dateRange} günlük vade aralığında herhangi bir bakiye bulunamadı.`
                ) : filterType === 'overdue' ? (
                  'Vadesi geçmiş bakiye bulunamadı.'
                ) : (
                  'Bu filtreye uygun vade veya bakiye bilgisi bulunamadı.'
                )}
              </p>
              <Link to="/import" className="btn btn-primary">
                Excel Veri İçe Aktar
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PaymentList;