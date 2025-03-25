import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { format, addDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'react-toastify';

const PaymentList = () => {
  // URL parametre değerlerini al
  const [searchParams] = useSearchParams();
  const filterType = searchParams.get('filter') || 'all';
  
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState(30); // Yaklaşan vadeler için 30 gün
  
  // İstatistikler
  const [stats, setStats] = useState({
    total: 0,
    displayed: 0
  });

  // Vade aralığını değiştirme fonksiyonu
  const handleDateRangeChange = (days) => {
    setDateRange(days);
  };

  // Veri getirme fonksiyonu
  const fetchData = async () => {
    setLoading(true);
    try {
      // Tüm bakiyeleri ve müşteri bilgilerini getir - basit sorgu
      const { data, error } = await supabase
        .from('customer_balances')
        .select(`
          *,
          customers (
            id, name, code, sector_code
          )
        `);
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        setBalances([]);
        setStats({ total: 0, displayed: 0 });
        setLoading(false);
        return;
      }
      
      console.log(`${data.length} adet bakiye kaydı bulundu`);
      
      // Bugünün tarihi
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Vade aralığı için bitiş tarihi
      const futureDate = addDays(today, dateRange);
      
      // Gösterilecek bakiyeleri filtrele
      let filteredBalances = [];
      
      // Her bakiye için işlem yap
      data.forEach(balance => {
        // Müşteri bilgisi yoksa atla
        if (!balance.customers) return;
        
        try {
          // Vade tarihlerini kontrol et
          let isPastDue = false;  // Vadesi geçmiş mi
          let isUpcoming = false; // Yaklaşan vade mi
          let effectiveDueDate = null; // Gösterilecek vade tarihi
          
          // 1. Vadesi geçen bakiye tarihi kontrolü
          if (balance.past_due_date) {
            const pastDueDate = new Date(balance.past_due_date);
            pastDueDate.setHours(0, 0, 0, 0);
            
            if (pastDueDate < today) {
              // Vadesi geçmiş
              isPastDue = true;
              effectiveDueDate = pastDueDate;
            } else if (pastDueDate >= today && pastDueDate <= futureDate) {
              // Yaklaşan vadeli
              isUpcoming = true;
              effectiveDueDate = pastDueDate;
            }
          }
          
          // 2. Vadesi geçmeyen bakiye tarihi kontrolü 
          if (balance.not_due_date) {
            const notDueDate = new Date(balance.not_due_date);
            notDueDate.setHours(0, 0, 0, 0);
            
            // Yakın vadeli mi?
            if (notDueDate >= today && notDueDate <= futureDate) {
              isUpcoming = true;
              
              // Eğer önceki tarihten daha yakınsa bu tarihi kullan
              if (!effectiveDueDate || notDueDate < effectiveDueDate) {
                effectiveDueDate = notDueDate;
              }
            }
          }
          
          // 3. Eski due_date alanı kontrolü
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
          
          // 4. Filtreleme tipine göre gösterilecekleri belirle
          const shouldInclude = 
            filterType === 'all' || 
            (filterType === 'upcoming' && isUpcoming) || 
            (filterType === 'overdue' && isPastDue);
          
          if (shouldInclude) {
            // Bakiye bilgilerini hesapla
            const pastDueBalance = parseFloat(balance.past_due_balance || 0);
            const notDueBalance = parseFloat(balance.not_due_balance || 0);
            const totalBalance = parseFloat(balance.total_balance || 0) || (pastDueBalance + notDueBalance);
            
            filteredBalances.push({
              ...balance,
              effective_due_date: effectiveDueDate ? effectiveDueDate.toISOString() : null,
              is_past_due: isPastDue,
              is_upcoming: isUpcoming,
              calculated_total: totalBalance
            });
          }
        } catch (err) {
          console.error("Bakiye işleme hatası:", err, balance);
        }
      });
      
      // Tarihe göre sırala
      filteredBalances.sort((a, b) => {
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
      
      // İstatistikleri güncelle
      setStats({
        total: data.length,
        displayed: filteredBalances.length
      });
      
      // Bakiyeleri ayarla
      setBalances(filteredBalances);
      
      console.log(`${filteredBalances.length} adet bakiye filtrelendi`);
    } catch (err) {
      console.error("Veri çekerken hata:", err);
      setError(err.message);
      toast.error("Veriler yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  // İlk yükleme ve filtre değişikliğinde verileri getir
  useEffect(() => {
    fetchData();
  }, [filterType, dateRange]);

  // Gösterilecek status badge'i belirle
  const getStatusBadge = (balance) => {
    if (!balance.effective_due_date) {
      return { text: 'Belirsiz', class: 'badge-info' };
    }
    
    const dueDate = new Date(balance.effective_due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Tarihler arasındaki farkı hesapla (gün olarak)
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (balance.is_past_due) {
      return { 
        text: `${Math.abs(diffDays)} gün gecikmiş`, 
        class: 'badge-danger' 
      };
    } else if (balance.is_upcoming) {
      if (diffDays === 0) {
        return { text: 'Bugün', class: 'badge-warning' };
      } else if (diffDays <= 2) {
        return { text: `${diffDays} gün kaldı`, class: 'badge-warning' };
      } else {
        return { text: `${diffDays} gün kaldı`, class: 'badge-info' };
      }
    }
    
    return { text: 'Normal', class: 'badge-info' };
  };

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
            onClick={fetchData} 
            className="btn"
            style={{ padding: '6px 12px' }}
            disabled={loading}
          >
            {loading ? 'Yükleniyor...' : 'Yenile'}
          </button>
        </div>
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
      
      {/* Basit bilgi kartı */}
      <div className="card" style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa' }}>
        <p>
          <strong>Toplam Kayıt:</strong> {stats.total} | 
          <strong> Gösterilen:</strong> {stats.displayed} | 
          <strong> Filtre:</strong> {
            filterType === 'upcoming' ? 'Yaklaşanlar' : 
            filterType === 'overdue' ? 'Vadesi Geçmiş' : 'Tümü'
          }
        </p>
      </div>
      
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Yükleniyor...</div>
      ) : (
        <div className="card">
          {balances.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Müşteri</th>
                  <th>Vade Tarihi</th>
                  <th>Bakiye</th>
                  <th>Durum</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((balance) => {
                  const status = getStatusBadge(balance);
                  const formattedBalance = new Intl.NumberFormat('tr-TR', { 
                    style: 'currency', 
                    currency: 'TRY' 
                  }).format(Math.abs(balance.calculated_total || 0));

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
                        {balance.effective_due_date
                          ? format(new Date(balance.effective_due_date), 'dd.MM.yyyy', { locale: tr })
                          : '-'}
                      </td>
                      <td>{formattedBalance}</td>
                      <td>
                        <span className={`badge ${status.class}`}>{status.text}</span>
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
                  `Belirtilen ${dateRange} günlük vade aralığında kayıt bulunamadı.`
                ) : filterType === 'overdue' ? (
                  'Vadesi geçmiş kayıt bulunamadı.'
                ) : (
                  'Kayıt bulunamadı.'
                )}
              </p>
              <Link to="/import" className="btn btn-primary">
                Excel Veri İçe Aktarma
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PaymentList;