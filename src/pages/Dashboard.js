<<<<<<< HEAD
// src/components/EnhancedDashboard.js
import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell 
} from 'recharts';
import { supabase } from '../services/supabase';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { tr } from 'date-fns/locale';
import LoginNotifications from '../components/LoginNotifications';
import { useUserAccess } from '../helpers/userAccess';

const EnhancedDashboard = () => {
  const [timelineData, setTimelineData] = useState([]);
  const [sectorData, setSectorData] = useState([]);
  const [regionData, setRegionData] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDateRange, setFilterDateRange] = useState(3); // 3 ay
  const [filterSector, setFilterSector] = useState('all');
  const [filterRegion, setFilterRegion] = useState('all');
  const [sectors, setSectors] = useState([]);
  const [regions, setRegions] = useState([]);
  
  // User access control
  const { isAdmin, isMuhasebe, filterCustomersByAccess } = useUserAccess();
  
  // COLORS for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
  const OVERDUE_COLOR = '#FF8042';
  const UPCOMING_COLOR = '#0088FE';
  
  useEffect(() => {
    fetchMetaData();
    fetchDashboardData();
  }, [filterDateRange, filterSector, filterRegion]);

  // Sektör ve bölge bilgilerini getir
  const fetchMetaData = async () => {
    try {
      // Sektörleri getir
      const { data: sectorData, error: sectorError } = await supabase
        .from('customers')
        .select('sector_code')
        .not('sector_code', 'is', null);
        
      if (sectorError) throw sectorError;
      
      // Benzersiz sektörleri bul
      const uniqueSectors = [...new Set(sectorData.map(item => item.sector_code))].filter(Boolean);
      setSectors(uniqueSectors.sort());
      
      // Bölgeleri getir
      const { data: regionData, error: regionError } = await supabase
        .from('customers')
        .select('region_code')
        .not('region_code', 'is', null);
        
      if (regionError) throw regionError;
      
      // Benzersiz bölgeleri bul
      const uniqueRegions = [...new Set(regionData.map(item => item.region_code))].filter(Boolean);
      setRegions(uniqueRegions.sort());
      
    } catch (error) {
      console.error('Meta veri yükleme hatası:', error);
    }
  };

  // Dashboard verilerini getir
  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Son X ay için veri hazırla
      const endDate = endOfMonth(new Date());
      const startDate = startOfMonth(subMonths(new Date(), filterDateRange));
      
      // Ana sorguyu oluştur - Tüm bakiyeleri getir
      let query = supabase
        .from('customer_balances')
        .select(`
          *,
          customers (
            id, name, code, sector_code, region_code
          )
        `);
      
      // Erişim kontrolü uygula
      if (!isAdmin && !isMuhasebe) {
        query = await filterCustomersByAccess(query);
      }
      
      // Sektör filtresi
      if (filterSector !== 'all') {
        query = query.eq('customers.sector_code', filterSector);
      }
      
      // Bölge filtresi
      if (filterRegion !== 'all') {
        query = query.eq('customers.region_code', filterRegion);
      }
      
      const { data: balances, error } = await query;
      if (error) throw error;
      
      if (balances && balances.length > 0) {
        // Verileri işle
        processTimelineData(balances);
        processSectorData(balances);
        processRegionData(balances);
        processTrendData(balances, startDate, endDate);
      }
    } catch (error) {
      console.error('Dashboard veri yükleme hatası:', error);
    } finally {
      setLoading(false);
    }
  };

  // Zaman çizelgesi verilerini işle
  const processTimelineData = (balances) => {
    // Bugünün tarihi
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Gelecek 30 gün için yeni bir dizi oluştur
    const nextDays = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      return {
        date,
        dateStr: format(date, 'dd MMM', { locale: tr }),
        overdue: 0,
        upcoming: 0
      };
    });
    
    // Her bakiye için zaman çizelgesine ekle
    balances.forEach(balance => {
      if (!balance.customers) return;
      
      // Vadesi geçmiş bakiye
      if (balance.past_due_balance && balance.past_due_balance > 0) {
        // Vadesi geçmiş tutarı bugüne ekle
        nextDays[0].overdue += parseFloat(balance.past_due_balance);
      }
      
      // Vadesi geçmemiş bakiye
      if (balance.not_due_balance && balance.not_due_balance > 0 && balance.not_due_date) {
        try {
          const dueDate = new Date(balance.not_due_date);
          dueDate.setHours(0, 0, 0, 0);
          
          // Vade tarihi bugünden sonraki 30 gün içinde mi?
          const diffDays = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));
          
          if (diffDays >= 0 && diffDays < 30) {
            nextDays[diffDays].upcoming += parseFloat(balance.not_due_balance);
          }
        } catch (err) {
          console.error('Tarih işleme hatası:', err);
        }
      }
    });
    
    // Zaman çizelgesi verilerini ayarla
    setTimelineData(nextDays);
  };

  // Sektör bazlı verileri işle
  const processSectorData = (balances) => {
    // Sektör bazlı toplam bakiyeleri hesapla
    const sectorTotals = {};
    
    balances.forEach(balance => {
      if (!balance.customers || !balance.customers.sector_code) return;
      
      const sector = balance.customers.sector_code;
      const pastDueBalance = parseFloat(balance.past_due_balance || 0);
      
      if (!sectorTotals[sector]) {
        sectorTotals[sector] = 0;
      }
      
      sectorTotals[sector] += pastDueBalance;
    });
    
    // Pasta grafik verisi oluştur
    const pieData = Object.entries(sectorTotals)
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
    
    setSectorData(pieData);
  };

  // Bölge bazlı verileri işle
  const processRegionData = (balances) => {
    // Bölge bazlı toplam bakiyeleri hesapla
    const regionTotals = {};
    
    balances.forEach(balance => {
      if (!balance.customers || !balance.customers.region_code) return;
      
      const region = balance.customers.region_code;
      const pastDueBalance = parseFloat(balance.past_due_balance || 0);
      
      if (!regionTotals[region]) {
        regionTotals[region] = 0;
      }
      
      regionTotals[region] += pastDueBalance;
    });
    
    // Pasta grafik verisi oluştur
    const pieData = Object.entries(regionTotals)
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
    
    setRegionData(pieData);
  };

  // Aylık trend verilerini işle
  const processTrendData = (balances, startDate, endDate) => {
    // Aylık bazda veri toplama
    const monthlyData = {};
    
    // Son X ay için aylık veri hazırla
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const yearMonth = format(currentDate, 'yyyy-MM');
      monthlyData[yearMonth] = { 
        month: format(currentDate, 'MMM yyyy', { locale: tr }),
        overdue: 0,
        upcoming: 0,
        total: 0
      };
      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    }
    
    // Bugünün tarihini al
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Veri doldur - bu kısım basitleştirilmiş, gerçek uygulamada daha karmaşık olabilir
    balances.forEach(balance => {
      if (!balance.customers) return;
      
      // Mevcut ayın verisi
      const currentYearMonth = format(today, 'yyyy-MM');
      
      // Vadesi geçmiş bakiye
      if (balance.past_due_balance && balance.past_due_balance > 0) {
        // Vadesi geçmiş bakiyeyi şu anki aya ekle
        if (monthlyData[currentYearMonth]) {
          monthlyData[currentYearMonth].overdue += parseFloat(balance.past_due_balance);
          monthlyData[currentYearMonth].total += parseFloat(balance.past_due_balance);
        }
      }
      
      // Vadesi geçmemiş bakiye
      if (balance.not_due_balance && balance.not_due_balance > 0 && balance.not_due_date) {
        try {
          const dueDate = new Date(balance.not_due_date);
          // Vade tarihinin ay-yıl'ını al
          const dueYearMonth = format(dueDate, 'yyyy-MM');
          
          // Vade tarihi takip edilen aylar içinde mi?
          if (monthlyData[dueYearMonth]) {
            monthlyData[dueYearMonth].upcoming += parseFloat(balance.not_due_balance);
            monthlyData[dueYearMonth].total += parseFloat(balance.not_due_balance);
          }
        } catch (err) {
          console.error('Tarih işleme hatası:', err);
        }
      }
    });
    
    // Grafik verisini oluştur
    const chartData = Object.values(monthlyData);
    setTrendData(chartData);
  };

  // Para birimi formatla
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('tr-TR', { 
      style: 'currency', 
      currency: 'TRY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  if (loading) {
    return <div className="loading">Veriler yükleniyor...</div>;
  }

  return (
    <div className="enhanced-dashboard">
      {/* Filtreler */}
      <div className="card" style={{ marginBottom: '20px', padding: '15px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
          Dashboard Filtreleri
        </h3>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
          {/* Tarih aralığı filtresi */}
          <div style={{ minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Tarih Aralığı:</label>
            <select 
              value={filterDateRange} 
              onChange={(e) => setFilterDateRange(Number(e.target.value))}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value={3}>Son 3 Ay</option>
              <option value={6}>Son 6 Ay</option>
              <option value={12}>Son 12 Ay</option>
            </select>
          </div>
          
          {/* Sektör filtresi */}
          <div style={{ minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Sektör:</label>
            <select 
              value={filterSector} 
              onChange={(e) => setFilterSector(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="all">Tüm Sektörler</option>
              {sectors.map(sector => (
                <option key={sector} value={sector}>{sector}</option>
              ))}
            </select>
          </div>
          
          {/* Bölge filtresi */}
          <div style={{ minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Bölge:</label>
            <select 
              value={filterRegion} 
              onChange={(e) => setFilterRegion(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="all">Tüm Bölgeler</option>
              {regions.map(region => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      {/* Zaman Çizelgesi Grafiği */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
          30 Günlük Vade Çizelgesi
        </h3>
        
        <div style={{ height: '300px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={timelineData}
              margin={{ top: 20, right: 30, left: 20, bottom: 50 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="dateStr" 
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={70}
              />
              <YAxis 
                tickFormatter={(value) => 
                  new Intl.NumberFormat('tr-TR', { 
                    notation: 'compact',
                    compactDisplay: 'short'
                  }).format(value)
                }
              />
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                labelFormatter={(label) => `Tarih: ${label}`}
              />
              <Legend />
              <Bar dataKey="overdue" name="Vadesi Geçmiş" fill={OVERDUE_COLOR} />
              <Bar dataKey="upcoming" name="Vadesi Yaklaşan" fill={UPCOMING_COLOR} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Sektör ve Bölge Pasta Grafikleri */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        {/* Sektör Pasta Grafiği */}
        <div className="card">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
            Sektör Bazlı Vadesi Geçen Bakiye Dağılımı
          </h3>
          
          <div style={{ height: '300px', width: '100%' }}>
            {sectorData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sectorData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {sectorData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                Gösterilecek veri bulunmuyor
              </div>
            )}
          </div>
        </div>
        
        {/* Bölge Pasta Grafiği */}
        <div className="card">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
            Bölge Bazlı Vadesi Geçen Bakiye Dağılımı
          </h3>
          
          <div style={{ height: '300px', width: '100%' }}>
            {regionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={regionData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {regionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                Gösterilecek veri bulunmuyor
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Aylık Trend Grafiği */}
      <div className="card">
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
          Aylık Vade Trendi
        </h3>
        
        <div style={{ height: '300px', width: '100%' }}>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={trendData}
                margin={{ top: 20, right: 30, left: 20, bottom: 30 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis 
                  tickFormatter={(value) => 
                    new Intl.NumberFormat('tr-TR', { 
                      notation: 'compact',
                      compactDisplay: 'short'
                    }).format(value)
                  }
                />
                <Tooltip 
                  formatter={(value) => formatCurrency(value)}
                  labelFormatter={(label) => `Ay: ${label}`}
                />
                <Legend />
                <Line type="monotone" dataKey="overdue" name="Vadesi Geçmiş" stroke={OVERDUE_COLOR} strokeWidth={2} />
                <Line type="monotone" dataKey="upcoming" name="Vadesi Yaklaşan" stroke={UPCOMING_COLOR} strokeWidth={2} />
                <Line type="monotone" dataKey="total" name="Toplam" stroke="#8884d8" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
              Gösterilecek veri bulunmuyor
            </div>
          )}
        </div>
=======
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
>>>>>>> 909a0b70d5a303564c50b7778de3f2c0e01d5749
      </div>
    </div>
  );
};

<<<<<<< HEAD
export default EnhancedDashboard;
=======
export default Dashboard;
>>>>>>> 909a0b70d5a303564c50b7778de3f2c0e01d5749
