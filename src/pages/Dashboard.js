import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { format, differenceInDays, addDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'react-toastify';
import VadeHelper from '../helpers/VadeHelper';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalCustomers: 0,
    recentCustomers: [],
    upcomingCount: 0,
    overdueCount: 0,
    upcomingBalances: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('customer');
  const [debug, setDebug] = useState({
    upcomingItems: [],
    overdueItems: [],
    dates: {},
    counts: {}
  });

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        console.log("Veri yükleniyor... Görünüm modu:", viewMode);
        
        // Adım 1: Müşteri sayısını al
        const { count, error: countError } = await supabase
          .from('customers')
          .select('*', { count: 'exact', head: true });
        
        if (countError) throw countError;
        
        // Adım 2: Son eklenen müşterileri al (en son 10 tane)
        const { data: recentCustomers, error: recentError } = await supabase
          .from('customers')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);
        
        if (recentError) throw recentError;
        
        // Adım 3: Tüm bakiyeleri getir - Sayfalama ile
        console.log("Veritabanından tüm bakiyeler sayfalama ile yükleniyor...");

        // Sayfalama ile tüm verileri çek
        let allBalances = [];
        let page = 0;
        const pageSize = 1000; // Her seferde 1000 kayıt
        let hasMoreData = true;

        while (hasMoreData) {
          // Sayfa sınırlarını hesapla
          const from = page * pageSize;
          
          console.log(`Bakiye sayfası ${page+1} yükleniyor (kayıtlar ${from}-${from+pageSize-1})...`);
          
          const { data: pageData, error: pageError } = await supabase
            .from('customer_balances')
            .select(`
              *,
              customers (
                id, name, code
              )
            `)
            .range(from, from + pageSize - 1);
          
          if (pageError) {
            console.error(`Sayfa ${page+1} yüklenirken hata:`, pageError);
            throw pageError;
          }
          
          // Veri yoksa veya sayfa eksik veri içeriyorsa, tüm verileri çektik demektir
          if (!pageData || pageData.length === 0) {
            hasMoreData = false;
          } else {
            // Verileri ana diziye ekle
            allBalances = [...allBalances, ...pageData];
            console.log(`Toplam ${allBalances.length} bakiye kaydı yüklendi`);
            
            // Eksik veri varsa tüm verileri çektik demektir
            if (pageData.length < pageSize) {
              hasMoreData = false;
            } else {
              // Sonraki sayfaya geç
              page++;
            }
          }
        }

        // Artık tüm bakiyeler elimizde
        const balances = allBalances;

        console.log(`${balances?.length || 0} adet bakiye kaydı yüklendi.`);
        
        // Bugünün tarihi
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // 15 gün sonrası
        const fifteenDaysLater = new Date(today);
        fifteenDaysLater.setDate(today.getDate() + 15);
        
        // Debug için
        setDebug(prev => ({
          ...prev,
          dates: {
            today: today.toISOString().split('T')[0],
            fifteenDaysLater: fifteenDaysLater.toISOString().split('T')[0]
          }
        }));
        
        // İstatistikler
        let upcomingCount = 0;
        let overdueCount = 0;
        const upcomingBalances = [];
        const upcomingItems = [];
        const overdueItems = [];
        
        // Bakiyeleri analiz et
        if (balances && balances.length > 0) {
          console.log("Bakiyeler analiz ediliyor...");
          
          balances.forEach(balance => {
            try {
              // Müşteri bilgisi yoksa atla
              if (!balance.customers) return;
              
              // Bakiye değerlerini parse et
              const pastDueBalance = VadeHelper.parseAmount(balance.past_due_balance);
              const notDueBalance = VadeHelper.parseAmount(balance.not_due_balance);
              const totalBalance = VadeHelper.calculateTotal(balance);
              
              // Müşteri/Tedarikçi ayrımı
              const isCustomer = totalBalance >= 0;
              const isSupplier = totalBalance < 0;
              
              // Görünüm moduna göre filtrele
              if ((viewMode === 'customer' && !isCustomer) || 
                  (viewMode === 'supplier' && !isSupplier)) {
                return;
              }
              
              // ÖNEMLİ: VADESİ GEÇMİŞ KONTROLÜ
              // past_due_balance > 100₺ ve past_due_date bugünden önceyse vadesi geçmiş say
              const isPastDue = pastDueBalance > VadeHelper.MIN_BALANCE;
              
              if (isPastDue) {
                // Debug için tarih kontrol et
                let overdueDate = null;
                if (balance.past_due_date) {
                  try {
                    overdueDate = new Date(balance.past_due_date);
                  } catch (e) {
                    console.error("past_due_date tarih dönüşüm hatası:", e);
                  }
                }
                
                overdueCount++;
                
                // Debug için örnek ekle 
                overdueItems.push({
                  customer: balance.customers.name,
                  balance: pastDueBalance,
                  total: totalBalance,
                  date: overdueDate ? overdueDate.toISOString() : null
                });
              }
              
              // ÖNEMLİ: YAKLAŞAN VADE KONTROLÜ
              // not_due_balance > 100₺ olmalı ve not_due_date bugünden 15 güne kadar olmalı
              if (balance.not_due_date && notDueBalance > VadeHelper.MIN_BALANCE) {
                try {
                  const dueDate = new Date(balance.not_due_date);
                  dueDate.setHours(0, 0, 0, 0);
                  
                  // Debug için tarih kontrolü
                  const isInFuturePeriod = dueDate >= today && dueDate <= fifteenDaysLater;
                  
                  if (isInFuturePeriod) {
                    upcomingCount++;
                    
                    upcomingItems.push({
                      customer: balance.customers.name,
                      date: dueDate.toISOString(),
                      balance: notDueBalance,
                      total: totalBalance
                    });
                    
                    // Yaklaşan vadeleri listeye ekle
                    upcomingBalances.push({
                      id: balance.id,
                      customer_id: balance.customer_id,
                      customers: balance.customers,
                      due_date: dueDate.toISOString().split('T')[0],
                      vade_tarihi: dueDate,
                      calculated_total_balance: notDueBalance, // Vadesi geçmemiş bakiye tutarı
                      total_balance: totalBalance // Toplam bakiye
                    });
                  }
                } catch (err) {
                  console.error("Tarih işleme hatası (not_due_date):", err, balance.not_due_date);
                }
              }
            } catch (err) {
              console.error("Bakiye işleme hatası:", err, balance);
            }
          });
          
          console.log(`Analiz sonuçları: Vadesi Geçmiş: ${overdueCount}, Yaklaşan Vadeler: ${upcomingCount}`);
        }
        
        // Yaklaşan vadeleri tarihe göre sırala
        upcomingBalances.sort((a, b) => {
          if (!a.vade_tarihi || !b.vade_tarihi) return 0;
          return new Date(a.vade_tarihi) - new Date(b.vade_tarihi);
        });
        
        // Debug için örnekleri kaydet
        setDebug(prev => ({
          ...prev,
          upcomingItems: upcomingItems.slice(0, 5),
          overdueItems: overdueItems.slice(0, 5),
          counts: {
            total: balances?.length || 0,
            upcoming: upcomingCount,
            overdue: overdueCount
          }
        }));
        
        // İstatistikleri güncelle
        setStats({
          totalCustomers: count || 0,
          recentCustomers: recentCustomers || [],
          upcomingCount,
          overdueCount,
          upcomingBalances: upcomingBalances.slice(0, 5) // İlk 5 tanesi
        });
      } catch (err) {
        console.error("Veri getirme hatası:", err);
        setError(err.message);
        toast.error("Veriler yüklenirken hata oluştu");
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [viewMode]);

  // Toggle view mode function
  const toggleViewMode = (mode) => {
    setViewMode(mode);
  };

  // Kalan gün hesapla
  const calculateDaysLeft = (dueDateStr) => {
    if (!dueDateStr) return null;
    try {
      const dueDate = new Date(dueDateStr);
      return differenceInDays(dueDate, new Date());
    } catch (err) {
      return null;
    }
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

  // Yükleme durumunda göster
  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px' }}>Veriler yükleniyor...</div>;
  }

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>
          Vade Takip Sistemi
        </h1>
        
        <div style={{ display: 'flex', gap: '10px' }}>
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
          <button 
            onClick={() => window.location.reload()}
            className="btn"
            style={{ padding: '6px 12px' }}
          >
            Yenile
          </button>
        </div>
      </div>
      
      {/* DEBUG INFO */}
      <div className="card" style={{ marginBottom: '20px', backgroundColor: '#f8f9fa', padding: '15px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>Debug Bilgisi</h3>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Görünüm Modu:</strong> {viewMode === 'customer' ? 'Müşteriler' : 'Tedarikçiler'}
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Vade Aralığı:</strong> {debug.dates.today} ile {debug.dates.fifteenDaysLater} arası (bugünden 15 gün sonrası)
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Toplam Müşteri Sayısı:</strong> {stats.totalCustomers}
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Yaklaşan Vade Sayısı:</strong> {stats.upcomingCount} (Debug: {debug.counts.upcoming})
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Vadesi Geçmiş Sayısı:</strong> {stats.overdueCount} (Debug: {debug.counts.overdue})
        </div>
        
        {debug.upcomingItems && debug.upcomingItems.length > 0 ? (
          <div style={{ marginBottom: '10px' }}>
            <strong>Yaklaşan Vadeler Örnekleri:</strong>
            <ul>
              {debug.upcomingItems.map((item, index) => (
                <li key={index}>
                  {item.customer}: {item.date ? new Date(item.date).toLocaleDateString() : '-'} - 
                  Vade Tutarı: {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Math.abs(item.balance))}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div style={{ marginBottom: '10px', color: '#721c24' }}>
            <strong>Yaklaşan vadeli kayıt bulunamadı!</strong>
          </div>
        )}
        
        {debug.overdueItems && debug.overdueItems.length > 0 ? (
          <div style={{ marginBottom: '10px' }}>
            <strong>Vadesi Geçmiş Örnekleri:</strong>
            <ul>
              {debug.overdueItems.map((item, index) => (
                <li key={index}>
                  {item.customer} - Vadesi Geçen: 
                  {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Math.abs(item.balance))}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div style={{ marginBottom: '10px', color: '#721c24' }}>
            <strong>Vadesi geçmiş kayıt bulunamadı!</strong>
          </div>
        )}
        
        <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '4px' }}>
          <strong>NOT:</strong> Bu sayfada:<br/>
          1. Vadesi geçmiş hesaplaması: past_due_balance > 100₺ olan kayıtlar<br/>
          2. Yaklaşan vade hesaplaması: not_due_balance > 100₺ ve tarihi 15 gün içinde olan kayıtlar
        </div>
      </div>
      
      <div className="stats-grid">
        <div className="stat-card">
          <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>
            Toplam {viewMode === 'customer' ? 'Müşteri' : 'Tedarikçi'}
          </h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {stats.totalCustomers}
          </p>
          <Link to="/customers" style={{ fontSize: '14px', color: '#3498db', textDecoration: 'none' }}>
            Tümünü Görüntüle →
          </Link>
        </div>

        <div className="stat-card">
          <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Yakın Vadeli</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {stats.upcomingCount}
          </p>
          <Link to="/payments?filter=upcoming" style={{ fontSize: '14px', color: '#f39c12', textDecoration: 'none' }}>
            Tümünü Görüntüle →
          </Link>
        </div>

        <div className="stat-card">
          <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Vadesi Geçmiş</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {stats.overdueCount}
          </p>
          <Link to="/payments?filter=overdue" style={{ fontSize: '14px', color: '#e74c3c', textDecoration: 'none' }}>
            Tümünü Görüntüle →
          </Link>
        </div>

        <div className="stat-card">
          <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Ödeme Vadesi</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {stats.upcomingBalances.length > 0 ? '15 Gün İçinde' : '-'}
          </p>
          <Link to="/payments" style={{ fontSize: '14px', color: '#2ecc71', textDecoration: 'none' }}>
            Tümünü Görüntüle →
          </Link>
        </div>
      </div>

      {/* Yaklaşan Vadeler */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
          Vadesi Yaklaşan {viewMode === 'customer' ? 'Müşteri' : 'Tedarikçi'} Bakiyeleri (15 gün içinde)
        </h2>

        {stats.upcomingBalances && stats.upcomingBalances.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>{viewMode === 'customer' ? 'Müşteri' : 'Tedarikçi'}</th>
                <th>Vade Tarihi</th>
                <th>Vade Tutarı</th>
                <th>Kalan Gün</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {stats.upcomingBalances.map((item, index) => {
                const daysLeft = calculateDaysLeft(item.due_date);
                const statusClass = daysLeft <= 2 ? 'badge-warning' : 'badge-info';

                return (
                  <tr key={`${item.id}-${index}`}>
                    <td>
                      <div style={{ fontWeight: 'bold' }}>
                        {item.customers?.name || '-'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#888' }}>
                        {item.customers?.code || '-'}
                      </div>
                    </td>
                    <td>
                      {item.due_date
                        ? format(new Date(item.due_date), 'dd.MM.yyyy', { locale: tr })
                        : '-'}
                    </td>
                    <td>
                      {item.calculated_total_balance
                        ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(item.calculated_total_balance)
                        : '-'}
                    </td>
                    <td>
                      <span className={`badge ${statusClass}`}>
                        {daysLeft === 0 ? 'Bugün' : `${daysLeft} gün`}
                      </span>
                    </td>
                    <td>
                      <Link
                        to={`/customers/${item.customer_id}`}
                        style={{ color: '#3498db', textDecoration: 'none' }}
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
            15 gün içinde vadesi dolacak bakiye bulunmuyor.
          </p>
        )}
      </div>
      
      {/* Son Eklenen Müşteriler */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
          Son Eklenen Müşteriler
        </h2>

        {stats.recentCustomers && stats.recentCustomers.length > 0 ? (
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
              {stats.recentCustomers.map((customer) => (
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
        ) : (
          <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
            Henüz müşteri kaydı bulunmuyor.
          </p>
        )}
      </div>
      
      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <p style={{ color: '#888', marginBottom: '10px' }}>
          Sistemde toplam {stats.totalCustomers} müşteri bulunuyor. 
          Daha fazla veri eklemek için Excel yükleyebilirsiniz.
        </p>
        <Link to="/import" className="btn btn-primary">Excel Veri İçe Aktarma</Link>
      </div>
    </div>
  );
};

export default Dashboard;