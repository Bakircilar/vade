import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { format, differenceInDays, isValid } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'react-toastify';

const Dashboard = () => {
  // Müşteri/Tedarikçi seçimi için state
  const [viewMode, setViewMode] = useState('customer'); // 'customer' veya 'supplier'
  
  const [stats, setStats] = useState({
    totalCustomers: 0,
    upcomingPayments: 0,
    overduePayments: 0,
    totalAmount: 0
  });
  
  const [upcomingBalances, setUpcomingBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [debug, setDebug] = useState({
    customers: null,
    balances: null,
    error: null,
    overdueItems: [],
    upcomingItems: [],
    customerCount: 0,
    supplierCount: 0
  });

  // Görünüm modunu değiştirme fonksiyonu
  const toggleViewMode = (mode) => {
    setViewMode(mode);
  };

  useEffect(() => {
    fetchDashboardData();
  }, [viewMode]); // viewMode değiştiğinde verileri yeniden yükle

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      console.log("Görünüm modu:", viewMode);
      
      // Tüm müşterileri getir - sayfalama yok, tümünü al
      let { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('*');
      
      if (customersError) {
        setDebug(prev => ({ ...prev, error: customersError }));
        throw customersError;
      }
      
      console.log("Müşteriler:", customers?.length || 0);
      setDebug(prev => ({ ...prev, customers: customers?.length || 0 }));
      
      // Tüm bakiyeleri getir - sayfalama yok, tümünü al
      let { data: balances, error: balancesError } = await supabase
        .from('customer_balances')
        .select('*');
      
      if (balancesError) {
        setDebug(prev => ({ ...prev, error: balancesError }));
        throw balancesError;
      }
      
      console.log("Bakiyeler:", balances?.length || 0);
      setDebug(prev => ({ ...prev, balances: balances?.length || 0 }));
      
      if (!customers || customers.length === 0) {
        toast.warning("Veritabanında hiç müşteri bulunamadı.");
        setLoading(false);
        return;
      }
      
      if (!balances || balances.length === 0) {
        toast.warning("Veritabanında hiç bakiye kaydı bulunamadı.");
        setLoading(false);
        return;
      }
      
      // Bakiyeleri normalleştir ve müşteri bilgileriyle birleştir
      const normalizedBalances = balances.map(balance => {
        // Müşteri bilgilerini bul
        const customer = customers.find(c => c.id === balance.customer_id);
        
        // Geriye dönük uyumluluk
        const hasDueDate = balance.due_date !== null && balance.due_date !== undefined;
        const hasPastDueDate = balance.past_due_date !== null && balance.past_due_date !== undefined;
        const hasNotDueDate = balance.not_due_date !== null && balance.not_due_date !== undefined;
        
        // Vade tarihlerini normalleştir
        const pastDueDate = hasPastDueDate && balance.past_due_date ? balance.past_due_date : 
                           (hasDueDate && balance.due_date ? balance.due_date : null);
                           
        // Bakiyeleri normalleştir
        const pastDueBalance = parseFloat(balance.past_due_balance) || 0;
        const notDueBalance = parseFloat(balance.not_due_balance) || 0;
        const totalBalance = parseFloat(balance.total_balance) || 0;
        
        // Hesaplanan toplam bakiye
        const calculatedTotalBalance = (pastDueBalance + notDueBalance) !== 0 ? 
                                    (pastDueBalance + notDueBalance) : totalBalance;
        
        return {
          ...balance,
          past_due_date: pastDueDate,
          not_due_date: hasNotDueDate && balance.not_due_date ? balance.not_due_date : null,
          past_due_balance: pastDueBalance,
          not_due_balance: notDueBalance,
          calculated_total_balance: calculatedTotalBalance,
          total_balance: calculatedTotalBalance,
          customer
        };
      }).filter(balance => balance.customer !== undefined);
      
      // Müşteri/Tedarikçi ayrımı yap - TOPLAM BAKİYE işaretine göre
      const customerBalances = normalizedBalances.filter(balance => balance.calculated_total_balance > 0);
      const supplierBalances = normalizedBalances.filter(balance => balance.calculated_total_balance < 0);
      
      console.log("Müşteri sayısı:", customerBalances.length);
      console.log("Tedarikçi sayısı:", supplierBalances.length);
      
      setDebug(prev => ({ 
        ...prev, 
        customerCount: customerBalances.length,
        supplierCount: supplierBalances.length
      }));
      
      // Seçilen görünüm moduna göre hangi verileri kullanacağımızı belirle
      const activeBalances = viewMode === 'customer' ? customerBalances : supplierBalances;
      
      // İstatistikleri hesapla
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Günü sıfırla - saat/dakika/saniye olmadan
      
      const fiveDaysLater = new Date(today);
      fiveDaysLater.setDate(today.getDate() + 5);
      
      console.log("Bugün:", today.toISOString().split('T')[0]);
      console.log("5 gün sonra:", fiveDaysLater.toISOString().split('T')[0]);
      
      // Vadesi geçenleri ve yaklaşanları hesapla
      let overdueCount = 0;
      let upcomingCount = 0;
      let totalAmount = 0;
      const overdueItems = [];
      const upcomingItems = [];
      
      activeBalances.forEach(balance => {
        // Toplam bakiye hesapla (mutlak değer olarak, çünkü tedarikçiler için eksi bakiyeyi pozitif göstermek istiyoruz)
        totalAmount += Math.abs(Number(balance.calculated_total_balance || 0));
        
        // Vade tarihlerini kontrol et
        if (balance.past_due_date || balance.due_date) {
          // Vade tarihini al (past_due_date öncelikli, sonra due_date)
          const dueDate = balance.past_due_date ? new Date(balance.past_due_date) : 
                         (balance.due_date ? new Date(balance.due_date) : null);
          
          if (dueDate) {
            dueDate.setHours(0, 0, 0, 0); // Saat bilgisini sıfırla
            
            // Vadesi geçmiş mi?
            const isOverdue = dueDate < today;
            
            // Debug bilgisi ekle
            if (isOverdue) {
              overdueItems.push({
                customer: balance.customer?.name || 'İsimsiz',
                due_date: balance.due_date,
                past_due_date: balance.past_due_date, 
                balance: balance.calculated_total_balance
              });
              
              // Bakiyesi pozitif ve vadesi geçmiş olanları say
              overdueCount++;
            }
            
            // Vadesi yaklaşıyor mu? (5 gün içerisinde)
            const isUpcoming = dueDate >= today && dueDate <= fiveDaysLater;
            
            if (isUpcoming) {
              upcomingCount++;
              upcomingItems.push({
                ...balance,
                due_date: dueDate.toISOString().split('T')[0],
                vade_tarihi: dueDate // Görüntüleme için
              });
            }
          }
        }
        
        // Vadesi geçmemiş bakiye tarihi yaklaşıyor mu?
        if (balance.not_due_date) {
          const notDueDate = new Date(balance.not_due_date);
          notDueDate.setHours(0, 0, 0, 0);
          
          // Vadesi yaklaşıyor mu?
          const isUpcoming = notDueDate >= today && notDueDate <= fiveDaysLater;
          
          // Eğer bu bakiye kaydı zaten yaklaşan vadelere eklenmemişse
          if (isUpcoming && !upcomingItems.some(item => item.id === balance.id)) {
            upcomingCount++;
            upcomingItems.push({
              ...balance,
              due_date: notDueDate.toISOString().split('T')[0],
              vade_tarihi: notDueDate // Görüntüleme için
            });
          }
        }
      });
      
      // Debug için vadesi geçen ve yaklaşan vadeler
      setDebug(prev => ({ 
        ...prev, 
        overdueItems: overdueItems.slice(0, 5), // İlk 5 örnek
        upcomingItems: upcomingItems.slice(0, 5)  // İlk 5 örnek
      }));
      
      console.log("Vadesi geçmiş sayısı:", overdueCount, "örnekler:", overdueItems.slice(0, 3));
      console.log("Yaklaşan vade sayısı:", upcomingCount, "örnekler:", upcomingItems.slice(0, 3));
      console.log("Toplam bakiye:", totalAmount);
      
      // İstatistikleri güncelle
      setStats({
        totalCustomers: activeBalances.length,
        upcomingPayments: upcomingCount,
        overduePayments: overdueCount,
        totalAmount
      });
      
      // Yaklaşan vadeleri set et ve sırala
      upcomingItems.sort((a, b) => {
        const aDate = a.vade_tarihi;
        const bDate = b.vade_tarihi;
        return aDate - bDate;
      });
      
      setUpcomingBalances(upcomingItems);
      
    } catch (error) {
      console.error('Dashboard veri hatası:', error);
      toast.error('Dashboard verileri yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  // İki vade tarihinden kalan günü hesapla
  const calculateDaysLeft = (item) => {
    if (!item.due_date) return null;
    try {
      const dueDate = new Date(item.due_date);
      if (!isValid(dueDate)) return null;
      return differenceInDays(dueDate, new Date());
    } catch (err) {
      console.error(`Gün hesaplama hatası: ${item.due_date}`, err);
      return null;
    }
  };

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px' 
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
            onClick={fetchDashboardData} 
            className="btn"
            style={{ padding: '6px 12px' }}
            disabled={loading}
          >
            {loading ? 'Yükleniyor...' : 'Yenile'}
          </button>
        </div>
      </div>
      
      {/* DEBUG BİLGİSİ */}
      <div className="card" style={{ marginBottom: '20px', backgroundColor: '#f8f9fa', padding: '15px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>Debug Bilgisi</h3>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Görünüm Modu:</strong> {viewMode === 'customer' ? 'Müşteriler' : 'Tedarikçiler'}
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Toplam Müşteri Sayısı:</strong> {debug.customerCount || 0}
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Toplam Tedarikçi Sayısı:</strong> {debug.supplierCount || 0}
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Müşteri Kaydı Sayısı:</strong> {debug.customers || 0}
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Bakiye Kaydı Sayısı:</strong> {debug.balances || 0}
        </div>
        
        {debug.error && (
          <div style={{ color: '#dc3545', marginBottom: '10px' }}>
            <strong>Hata:</strong> {debug.error.message}
          </div>
        )}
        
        <div>
          <strong>İstatistikler:</strong> 
          Toplam {viewMode === 'customer' ? 'Müşteri' : 'Tedarikçi'}: {stats.totalCustomers}, 
          Yakın Vadeli: {stats.upcomingPayments}, 
          Vadesi Geçmiş: {stats.overduePayments}, 
          Toplam Bakiye: {stats.totalAmount}
        </div>
        
        {debug.overdueItems && debug.overdueItems.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <strong>Vadesi Geçen Örnekler ({debug.overdueItems.length}):</strong>
            <ul style={{ marginTop: '5px', fontSize: '12px' }}>
              {debug.overdueItems.map((item, idx) => (
                <li key={idx} style={{ marginBottom: '5px' }}>
                  {item.customer} - Due Date: {item.due_date || 'Yok'} - Past Due Date: {item.past_due_date || 'Yok'} - Bakiye: {item.balance}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>
            Toplam {viewMode === 'customer' ? 'Müşteri' : 'Tedarikçi'}
          </h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.totalCustomers}</p>
          <Link to="/customers" style={{ fontSize: '14px', color: '#3498db', textDecoration: 'none' }}>
            Tümünü Görüntüle →
          </Link>
        </div>

        <div className="stat-card">
          <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Yakın Vadeli</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.upcomingPayments}</p>
          <Link to="/payments?filter=upcoming" style={{ fontSize: '14px', color: '#f39c12', textDecoration: 'none' }}>
            Tümünü Görüntüle →
          </Link>
        </div>

        <div className="stat-card">
          <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Vadesi Geçmiş</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.overduePayments}</p>
          <Link to="/payments?filter=overdue" style={{ fontSize: '14px', color: '#e74c3c', textDecoration: 'none' }}>
            Tümünü Görüntüle →
          </Link>
        </div>

        <div className="stat-card">
          <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Toplam Bakiye</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(stats.totalAmount)}
          </p>
          <Link to="/payments" style={{ fontSize: '14px', color: '#2ecc71', textDecoration: 'none' }}>
            Tümünü Görüntüle →
          </Link>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
          Vadesi Yaklaşan {viewMode === 'customer' ? 'Müşteri' : 'Tedarikçi'} Bakiyeleri (5 gün içinde)
        </h2>

        {upcomingBalances.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>{viewMode === 'customer' ? 'Müşteri' : 'Tedarikçi'}</th>
                <th>Vade Tarihi</th>
                <th>Tutar</th>
                <th>Kalan Gün</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {upcomingBalances.map((item, index) => {
                const daysLeft = calculateDaysLeft(item);
                const statusClass = daysLeft <= 2 ? 'badge-warning' : 'badge-info';

                return (
                  <tr key={`${item.id}-${index}`}>
                    <td>
                      <div style={{ fontWeight: 'bold' }}>
                        {item.customer?.name || '-'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#888' }}>
                        {item.customer?.code || '-'}
                      </div>
                    </td>
                    <td>
                      {item.due_date
                        ? format(new Date(item.due_date), 'dd.MM.yyyy', { locale: tr })
                        : '-'}
                    </td>
                    <td>
                      {item.calculated_total_balance
                        ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Math.abs(item.calculated_total_balance))
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
            5 gün içinde vadesi dolacak bakiye bulunmuyor.
          </p>
        )}
      </div>
      
      {upcomingBalances.length === 0 && stats.upcomingPayments === 0 && stats.overduePayments === 0 && (
        <div style={{ textAlign: 'center', marginTop: '20px', padding: '20px' }}>
          <p style={{ marginBottom: '10px', color: '#666' }}>
            Bakiye veya vade bilgisi bulunamadı. Excel veri yükleme sayfasından müşteri ve bakiye verilerinizi yükleyebilirsiniz.
          </p>
          <Link to="/import" className="btn btn-primary">Excel Veri İçe Aktarma</Link>
        </div>
      )}
    </div>
  );
};

export default Dashboard;