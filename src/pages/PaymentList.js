import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { format, addDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';

const PaymentList = () => {
  // URL parametre değerlerini al
  const [searchParams] = useSearchParams();
  const filterType = searchParams.get('filter') || 'all';
  
  const [balances, setBalances] = useState([]);
  const [allRecords, setAllRecords] = useState([]); // Tüm kayıtları sakla
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState(30); // Yaklaşan vadeler için 30 gün
  const [exporting, setExporting] = useState(false);
  
  // İstatistikler
  const [stats, setStats] = useState({
    total: 0,
    displayed: 0,
    allRecordsCount: 0 // Toplam tüm kayıt sayısı
  });

  // Vade aralığını değiştirme fonksiyonu
  const handleDateRangeChange = (days) => {
    setDateRange(days);
  };

  // Veri getirme fonksiyonu
  const fetchData = async () => {
    setLoading(true);
    try {
      // Test amaçlı olarak filtreleme öncesi tüm verileri alıyoruz
      console.log("Veri yükleniyor... Lütfen bekleyin.");
      
      // Tüm bakiyeleri ve müşteri bilgilerini getir
      const { data, error } = await supabase
        .from('customer_balances')
        .select(`
          *,
          customers (
            id, name, code, sector_code
          )
        `)
        .limit(100000); // Çok daha yüksek bir limit belirledik
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        setBalances([]);
        setStats({ total: 0, displayed: 0, allRecordsCount: 0 });
        setLoading(false);
        return;
      }
      
      // Hata ayıklama bilgisi
      console.log(`Veritabanından ${data.length} adet bakiye kaydı getirildi`);
      
      // Tüm kayıtları sakla (Excel dışa aktarımı için)
      setAllRecords(data);
      
      // Bugünün tarihi
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Vade aralığı için bitiş tarihi
      const futureDate = addDays(today, dateRange);
      
      let nonZeroBalanceCount = 0;
      
      // Gösterilecek bakiyeleri filtrele
      let filteredBalances = [];
      
      // Her bakiye için işlem yap
      data.forEach(balance => {
        // Müşteri bilgisi yoksa atla
        if (!balance.customers) return;
        
        try {
          // Bakiye değerlerini sayısal olarak kontrol et
          const pastDueBalance = parseFloat(balance.past_due_balance || 0);
          const notDueBalance = parseFloat(balance.not_due_balance || 0);
          const totalBalance = parseFloat(balance.total_balance || 0) || (pastDueBalance + notDueBalance);
          
          // Sıfır olmayan toplam bakiyeleri say
          if (Math.abs(totalBalance) >= 0.01) {
            nonZeroBalanceCount++;
          }
          
          // Toplam bakiye sıfır veya çok küçük miktarsa kayıtı tamamen atla 
          // (yuvarlama hatalarını önlemek için 0.01'den küçük kontrol ediyoruz)
          if (Math.abs(totalBalance) < 0.01) {
            return;
          }
          
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
          let shouldInclude = false;
          
          if (filterType === 'all') {
            shouldInclude = true;
          } else if (filterType === 'upcoming') {
            // Yaklaşan vadesi olan ve bakiyesi pozitif olan
            if (isUpcoming) {
              // Yaklaşan vadeler için: 
              // - Vadesi geçmemiş bakiyesi varsa (vadesi geçmemiş pozitif bakiye)
              // - veya toplam bakiyesi varsa (herhangi bir bakiye türü)
              shouldInclude = (notDueBalance > 0) || (totalBalance > 0);
            }
          } else if (filterType === 'overdue') {
            // Vadesi geçmiş ve vadesi geçmiş bakiyesi olan kayıtlar
            shouldInclude = isPastDue && pastDueBalance > 0;
            
            // Vade tarihi belirsiz ama vadesi geçmiş bakiyesi olan kayıtlar 
            if (!isPastDue && !effectiveDueDate && pastDueBalance > 0) {
              shouldInclude = true;
              isPastDue = true; // Vade tarihi olmayan ama vadesi geçen bakiyesi olanlar 
            }
          }
          
          if (shouldInclude) {
            filteredBalances.push({
              ...balance,
              effective_due_date: effectiveDueDate ? effectiveDueDate.toISOString() : null,
              is_past_due: isPastDue,
              is_upcoming: isUpcoming,
              calculated_past_due: pastDueBalance,
              calculated_not_due: notDueBalance,
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
        total: nonZeroBalanceCount,
        displayed: filteredBalances.length,
        allRecordsCount: data.length
      });
      
      // Bakiyeleri ayarla
      setBalances(filteredBalances);
      
      console.log(`${filteredBalances.length} adet bakiye filtrelendi`);
      console.log(`Sıfır olmayan bakiye: ${nonZeroBalanceCount}`);
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
      // Vade tarihi belirsiz olan kayıtları vadesi geçmiş olarak işaretle
      return { text: 'Vadesi Geçmiş (Belirsiz)', class: 'badge-danger' };
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
        dataToExport = balances;
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
      
      {/* Excel'e aktar butonları */}
      <div className="card" style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#eaf7ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <p>
              <strong>Veritabanındaki Toplam Kayıt:</strong> {stats.allRecordsCount} | 
              <strong> Sıfır Olmayan Bakiye:</strong> {stats.total} | 
              <strong> Gösterilen:</strong> {stats.displayed} | 
              <strong> Filtre:</strong> {
                filterType === 'upcoming' ? 'Yaklaşanlar' : 
                filterType === 'overdue' ? 'Vadesi Geçmiş' : 'Tümü'
              }
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={() => exportToExcel('filtered')} 
              className="btn btn-success"
              disabled={exporting || balances.length === 0}
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
      </div>
      
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Yükleniyor...</div>
      ) : (
        <div className="card">
          {balances.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Müşteri</th>
                    <th>Vade Tarihi</th>
                    <th>Vadesi Geçmiş Bakiye</th>
                    <th>Vadesi Geçmemiş Bakiye</th>
                    <th>Toplam Bakiye</th>
                    <th>Durum</th>
                    <th>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((balance) => {
                    const status = getStatusBadge(balance);

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
                        <td style={{ color: balance.calculated_past_due > 0 ? '#e74c3c' : 'inherit' }}>
                          {formatCurrency(balance.calculated_past_due)}
                        </td>
                        <td>
                          {formatCurrency(balance.calculated_not_due)}
                        </td>
                        <td style={{ fontWeight: 'bold' }}>
                          {formatCurrency(balance.calculated_total)}
                        </td>
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
            </div>
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