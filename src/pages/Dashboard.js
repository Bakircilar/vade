// src/pages/Dashboard.js
import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell 
} from 'recharts';
import { supabase } from '../services/supabase';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useUserAccess } from '../helpers/userAccess';
// Import LoginNotifications component
import LoginNotifications from '../components/LoginNotifications';

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
  
  // User access control - added loading state
  const { isAdmin, isMuhasebe, filterCustomersByAccess, loading: accessLoading } = useUserAccess();
  
  // COLORS for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
  const OVERDUE_COLOR = '#FF8042';
  const UPCOMING_COLOR = '#0088FE';
  
  // KEY FIX: Check if accessLoading is complete before fetching data
  useEffect(() => {
    if (!accessLoading) {
      fetchMetaData();
      fetchDashboardData();
    }
  }, [filterDateRange, filterSector, filterRegion, accessLoading]);

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
      {/* LoginNotifications bileşeni eklendi */}
      <LoginNotifications />
      
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
      </div>
    </div>
  );
};

export default EnhancedDashboard;