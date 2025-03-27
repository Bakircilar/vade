import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { format, differenceInDays, addDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'react-toastify';
import VadeHelper from '../helpers/VadeHelper';
import { useUserAccess } from '../helpers/userAccess';

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
  
  // User access control
  const { isAdmin, isMuhasebe, filterCustomersByAccess, assignedCustomerIds } = useUserAccess();

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Adım 1: Müşteri sayısını al
        let query = supabase.from('customers').select('*', { count: 'exact', head: true });
        
        // Kullanıcı erişim kontrolü
        query = await filterCustomersByAccess(query);
        
        const { count, error: countError } = await query;
        
        if (countError) throw countError;
        
        // Adım 2: Son eklenen müşterileri al (en son 10 tane)
        let recentQuery = supabase
          .from('customers')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);
          
        // Kullanıcı erişim kontrolü
        recentQuery = await filterCustomersByAccess(recentQuery);
        
        const { data: recentCustomers, error: recentError } = await recentQuery;
        
        if (recentError) throw recentError;
        
        // Adım 3: Tüm bakiyeleri getir - Sayfalama ile
        // Sayfalama ile tüm verileri çek
        let allBalances = [];
        let page = 0;
        const pageSize = 1000; // Her seferde 1000 kayıt
        let hasMoreData = true;

        while (hasMoreData) {
          // Sayfa sınırlarını hesapla
          const from = page * pageSize;
          
          // Sorguyu oluştur
          let balanceQuery = supabase
            .from('customer_balances')
            .select(`
              *,
              customers (
                id, name, code
              )
            `)
            .range(from, from + pageSize - 1);
          
          // Erişim kontrolü - eğer admin veya muhasebe değilse, sadece atanmış müşterileri getir
          if (!isAdmin && !isMuhasebe && assignedCustomerIds.length > 0) {
            balanceQuery = balanceQuery.in('customer_id', assignedCustomerIds);
          } else if (!isAdmin && !isMuhasebe) {
            // Hiç atanmış müşteri yoksa ve admin veya muhasebe değilse
            balanceQuery = balanceQuery.eq('customer_id', '00000000-0000-0000-0000-000000000000');
          }
          
          const { data: pageData, error: pageError } = await balanceQuery;
          
          if (pageError) {
            console.error(`Sayfa ${page+1} yüklenirken hata:`, pageError);
            throw pageError;
          }
          
          // Eğer boş veri döndüyse veya pageSize'dan az veri döndüyse, tüm verileri çektik demektir
          if (!pageData || pageData.length === 0) {
            hasMoreData = false;
          } else {
            // Verileri ana diziye ekle
            allBalances = [...allBalances, ...pageData];
            
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
        
        // Bugünün tarihi
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // 15 gün sonrası
        const fifteenDaysLater = new Date(today);
        fifteenDaysLater.setDate(today.getDate() + 15);
        
        // İstatistikler
        let upcomingCount = 0;
        let overdueCount = 0;
        const upcomingBalances = [];
        
        // Bakiyeleri analiz et
        if (balances && balances.length > 0) {
          balances.forEach(balance => {
            try {
              // Müşteri bilgisi yoksa atla
              if (!balance.customers) return;
              
              // Bakiye değerlerini parse et
              const pastDueBalance = VadeHelper.parseAmount(balance.past_due_balance);
              const notDueBalance = VadeHelper.parseAmount(balance.not_due_balance);
              const totalBalance = VadeHelper.calculateTotal(balance);
              
              // ÖNEMLİ: VADESİ GEÇMİŞ KONTROLÜ
              // past_due_balance > 100₺ ve past_due_date bugünden önceyse vadesi geçmiş say
              const isPastDue = pastDueBalance > VadeHelper.MIN_BALANCE;
              
              if (isPastDue) {
                overdueCount++;
              }
              
              // ÖNEMLİ: YAKLAŞAN VADE KONTROLÜ
              // not_due_balance > 100₺ olmalı ve not_due_date bugünden 15 güne kadar olmalı
              if (balance.not_due_date && notDueBalance > VadeHelper.MIN_BALANCE) {
                try {
                  const dueDate = new Date(balance.not_due_date);
                  dueDate.setHours(0, 0, 0, 0);
                  
                  // Tarih kontrolü - daha açık ve karşılaştırılabilir
                  const todayWithoutTime = new Date();
                  todayWithoutTime.setHours(0, 0, 0, 0);
                  
                  const fifteenDaysLaterWithoutTime = new Date(todayWithoutTime);
                  fifteenDaysLaterWithoutTime.setDate(todayWithoutTime.getDate() + 15);
                  
                  // Tarih kontrolünü logla
                  console.log(`Vadesi yaklaşan kontrolü - Müşteri: ${balance.customers?.name}, Vade tarihi: ${dueDate.toISOString()}`);
                  console.log(`Tarih aralığı: ${todayWithoutTime.toISOString()} ile ${fifteenDaysLaterWithoutTime.toISOString()} arası`);
                  
                  const isInFuturePeriod = dueDate >= todayWithoutTime && dueDate <= fifteenDaysLaterWithoutTime;
                  
                  if (isInFuturePeriod) {
                    upcomingCount++;
                    
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
        }
        
        // Yaklaşan vadeleri tarihe göre sırala
        upcomingBalances.sort((a, b) => {
          if (!a.vade_tarihi || !b.vade_tarihi) return 0;
          return new Date(a.vade_tarihi) - new Date(b.vade_tarihi);
        });
        
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
  }, [isAdmin, isMuhasebe, filterCustomersByAccess, assignedCustomerIds]);

  // Kalan gün hesapla - DÜZELTME YAPILDI
  const calculateDaysLeft = (dueDateStr) => {
    if (!dueDateStr) return null;
    
    try {
      // Vade tarihini doğru formatta çöz
      const dueDate = new Date(dueDateStr);
      // Saat bilgilerini sıfırla
      dueDate.setHours(0, 0, 0, 0);
      
      // Bugünün tarihini al ve saat bilgilerini sıfırla
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Tarih farkını hesapla (gün cinsinden)
      // Math.floor ile tam gün farkını hesaplıyoruz
      const diffMs = dueDate.getTime() - today.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      // Debug: Tarih bilgilerini konsola yaz
      console.log(`[Dashboard] Kalan gün hesaplaması (DÜZELTME SONRASI): Vade=${dueDate.toISOString()}, Bugün=${today.toISOString()}, Fark=${diffDays} gün`);
      
      return diffDays;
    } catch (err) {
      console.error("Tarih hesaplama hatası:", err, dueDateStr);
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
            onClick={() => window.location.reload()}
            className="btn"
            style={{ padding: '6px 12px' }}
          >
            Yenile
          </button>
        </div>
      </div>
      
      <div className="stats-grid">
        <div className="stat-card">
          <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>
            Toplam Müşteri
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
          Vadesi Yaklaşan Müşteri Bakiyeleri (15 gün içinde)
        </h2>

        {stats.upcomingBalances && stats.upcomingBalances.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Müşteri</th>
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
                        {daysLeft === 0 ? 'Bugün' : 
                         daysLeft === 1 ? 'Yarın' : 
                         daysLeft > 0 ? `${daysLeft} gün kaldı` : 
                         `${Math.abs(daysLeft)} gün gecikmiş`}
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
          {(isAdmin || isMuhasebe) && "Daha fazla veri eklemek için Excel yükleyebilirsiniz."}
        </p>
        {(isAdmin || isMuhasebe) && (
          <Link to="/import" className="btn btn-primary">Excel Veri İçe Aktarma</Link>
        )}
      </div>
    </div>
  );
};

export default Dashboard;