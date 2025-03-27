// src/pages/Analytics.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';
import { format, parseISO, differenceInDays, startOfMonth, endOfMonth, subMonths, addDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { useUserAccess } from '../helpers/userAccess';

const Analytics = () => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [reportType, setReportType] = useState('customer_performance');
  const [reportData, setReportData] = useState([]);
  const [dateRange, setDateRange] = useState(6); // Son 6 ay
  const [filterSector, setFilterSector] = useState('all');
  const [filterRegion, setFilterRegion] = useState('all');
  const [sectors, setSectors] = useState([]);
  const [regions, setRegions] = useState([]);
  const [exporting, setExporting] = useState(false);
  
  // Müşteri davranış analizi verileri
  const [customerBehaviorData, setCustomerBehaviorData] = useState([]);
  
  // Satıcı performans verileri
  const [sellerPerformanceData, setSellerPerformanceData] = useState([]);
  
  // User access control
  const { isAdmin, isMuhasebe, filterCustomersByAccess } = useUserAccess();
  
  // COLORS for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#e74c3c', '#3498db', '#9b59b6', '#1abc9c'];
  
  useEffect(() => {
    fetchMetaData();
    
    // Aktif sekmeye göre veri getir
    switch (activeTab) {
      case 'overview':
        fetchOverviewData();
        break;
      case 'customer':
        fetchCustomerData();
        break;
      case 'seller':
        fetchSellerData();
        break;
      case 'reports':
        fetchReportData();
        break;
      default:
        fetchOverviewData();
    }
  }, [activeTab, dateRange, filterSector, filterRegion, reportType]);
  
  // Meta verileri getir (sektörler, bölgeler)
  const fetchMetaData = async () => {
    try {
      // Sektörleri getir
      const { data: sectorData, error: sectorError } = await supabase
        .from('customers')
        .select('sector_code')
        .not('sector_code', 'is', null);
        
      if (sectorError) throw sectorError;
      
      // Benzersiz sektörleri bul
      const uniqueSectors = [...new Set(sectorData.map(item => item.sector_code))]
        .filter(Boolean)
        .sort();
        
      setSectors(uniqueSectors);
      
      // Bölgeleri getir
      const { data: regionData, error: regionError } = await supabase
        .from('customers')
        .select('region_code')
        .not('region_code', 'is', null);
        
      if (regionError) throw regionError;
      
      // Benzersiz bölgeleri bul
      const uniqueRegions = [...new Set(regionData.map(item => item.region_code))]
        .filter(Boolean)
        .sort();
        
      setRegions(uniqueRegions);
    } catch (error) {
      console.error('Meta veri yükleme hatası:', error);
    }
  };
  
  // Genel bakış verileri
  const fetchOverviewData = async () => {
    setLoading(true);
    try {
      // Son X ay için veri hazırla
      const endDate = endOfMonth(new Date());
      const startDate = startOfMonth(subMonths(new Date(), dateRange));
      
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
        // Verileri işle ve düzenle
        processOverviewData(balances);
      }
    } catch (error) {
      console.error('Genel bakış verileri yükleme hatası:', error);
      toast.error('Veriler yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };
  
  // Müşteri verileri
  const fetchCustomerData = async () => {
    setLoading(true);
    try {
      // Son X ay için veri hazırla
      const endDate = new Date();
      const startDate = subMonths(new Date(), dateRange);
      
      // CUSTOMER_NOTES tablosundan notları getir
      let query = supabase
        .from('customer_notes')
        .select(`
          *,
          customers (
            id, name, code, sector_code, region_code
          )
        `)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      // Erişim kontrolü uygula - Yönetici/Muhasebe için tüm müşteriler, diğerleri için sadece atanmış müşteriler
      if (!isAdmin && !isMuhasebe) {
        // TODO: Kullanıcıya atanan müşterileri filtrele
        // Bu kısım useUserAccess hook'una göre düzenlenebilir
      }
      
      // Sektör filtresi
      if (filterSector !== 'all') {
        query = query.eq('customers.sector_code', filterSector);
      }
      
      // Bölge filtresi
      if (filterRegion !== 'all') {
        query = query.eq('customers.region_code', filterRegion);
      }
      
      const { data: notes, error } = await query;
      if (error) throw error;
      
      if (notes && notes.length > 0) {
        // Müşteri davranış verilerini işle
        processCustomerBehaviorData(notes);
      }
    } catch (error) {
      console.error('Müşteri verileri yükleme hatası:', error);
      toast.error('Müşteri verileri yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };
  
  // Satıcı verileri
  const fetchSellerData = async () => {
    setLoading(true);
    try {
      // Son X ay için veri hazırla
      const endDate = new Date();
      const startDate = subMonths(new Date(), dateRange);
      
      // Kullanıcı listesini getir
      const { data: users, error: userError } = await supabase
        .from('profiles')
        .select('id, full_name, role');
        
      if (userError) throw userError;
      
      // Her kullanıcı için not sayılarını getir
      const sellerData = [];
      
      for (const user of users) {
        // Kullanıcının notlarını getir
        const { data: userNotes, error: notesError } = await supabase
          .from('customer_notes')
          .select('id, created_at, customer_id, promise_date, tags')
          .eq('user_id', user.id)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString());
          
        if (notesError && notesError.code !== 'PGRST116') {
          console.error(`${user.id} kullanıcısı için not getirme hatası:`, notesError);
          continue;
        }
        
        // Kullanıcı notlarını işle
        const notes = userNotes || [];
        const promiseNotes = notes.filter(note => note.promise_date);
        const taggedNotes = notes.filter(note => note.tags && note.tags.length > 0);
        
        // Benzersiz müşteri sayısını bul
        const uniqueCustomers = new Set(notes.map(note => note.customer_id));
        
        sellerData.push({
          id: user.id,
          name: user.full_name || 'İsimsiz Kullanıcı',
          role: user.role || 'user',
          totalNotes: notes.length,
          promiseNotes: promiseNotes.length,
          taggedNotes: taggedNotes.length,
          uniqueCustomers: uniqueCustomers.size,
          averageNotesPerCustomer: uniqueCustomers.size > 0 ? notes.length / uniqueCustomers.size : 0
        });
      }
      
      // En çok not girenden en aza sırala
      sellerData.sort((a, b) => b.totalNotes - a.totalNotes);
      
      setSellerPerformanceData(sellerData);
    } catch (error) {
      console.error('Satıcı verileri yükleme hatası:', error);
      toast.error('Satıcı verileri yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };
  
  // Rapor verileri
  const fetchReportData = async () => {
    setLoading(true);
    try {
      // Rapor tipine göre veri getir
      switch (reportType) {
        case 'customer_performance':
          await fetchCustomerPerformanceReport();
          break;
        case 'sector_analysis':
          await fetchSectorAnalysisReport();
          break;
        case 'region_analysis':
          await fetchRegionAnalysisReport();
          break;
        default:
          await fetchCustomerPerformanceReport();
      }
    } catch (error) {
      console.error('Rapor verileri yükleme hatası:', error);
      toast.error('Rapor verileri yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };
  
  // Müşteri performans raporu
  const fetchCustomerPerformanceReport = async () => {
    try {
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
      
      // Her müşteri için notları getir
      const customerPerformance = [];
      
      if (balances && balances.length > 0) {
        for (const balance of balances) {
          if (!balance.customers) continue;
          
          // Müşterinin notlarını getir
          const { data: customerNotes, error: notesError } = await supabase
            .from('customer_notes')
            .select('created_at, promise_date, tags')
            .eq('customer_id', balance.customer_id)
            .order('created_at', { ascending: false });
            
          if (notesError && notesError.code !== 'PGRST116') {
            console.error(`${balance.customer_id} müşterisi için not getirme hatası:`, notesError);
            continue;
          }
          
          const notes = customerNotes || [];
          
          // En son vade tarihi ve ödeme sözü
          let lastPromiseDate = null;
          
          if (notes.length > 0) {
            const latestNoteWithPromise = notes.find(note => note.promise_date);
            if (latestNoteWithPromise) {
              lastPromiseDate = latestNoteWithPromise.promise_date;
            }
          }
          
          // Vade tarihi geçmiş mi kontrol et
          const today = new Date();
          const pastDueDate = balance.past_due_date ? new Date(balance.past_due_date) : null;
          const daysOverdue = pastDueDate ? differenceInDays(today, pastDueDate) : null;
          
          customerPerformance.push({
            id: balance.customer_id,
            name: balance.customers.name,
            code: balance.customers.code,
            sector: balance.customers.sector_code || '-',
            region: balance.customers.region_code || '-',
            pastDueBalance: parseFloat(balance.past_due_balance || 0),
            notDueBalance: parseFloat(balance.not_due_balance || 0),
            totalBalance: parseFloat(balance.total_balance || 0) || 
                         (parseFloat(balance.past_due_balance || 0) + parseFloat(balance.not_due_balance || 0)),
            pastDueDate: balance.past_due_date,
            daysOverdue: daysOverdue > 0 ? daysOverdue : 0,
            notCount: notes.length,
            lastNotDate: notes.length > 0 ? notes[0].created_at : null,
            lastPromiseDate: lastPromiseDate,
            paymentRisk: calculatePaymentRisk(
              parseFloat(balance.past_due_balance || 0),
              daysOverdue,
              notes.length
            )
          });
        }
      }
      
      // En yüksek vadesi geçmiş bakiyeden başlayarak sırala
      customerPerformance.sort((a, b) => b.pastDueBalance - a.pastDueBalance);
      
      setReportData(customerPerformance);
    } catch (error) {
      console.error('Müşteri performans raporu hatası:', error);
      throw error;
    }
  };
  
  // Sektör analiz raporu
  const fetchSectorAnalysisReport = async () => {
    try {
      // Ana sorguyu oluştur
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
      
      const { data: balances, error } = await query;
      if (error) throw error;
      
      // Sektör bazlı toplamları hesapla
      const sectorTotals = {};
      
      if (balances && balances.length > 0) {
        balances.forEach(balance => {
          if (!balance.customers || !balance.customers.sector_code) return;
          
          const sector = balance.customers.sector_code;
          const pastDueBalance = parseFloat(balance.past_due_balance || 0);
          const notDueBalance = parseFloat(balance.not_due_balance || 0);
          const totalBalance = parseFloat(balance.total_balance || 0) || (pastDueBalance + notDueBalance);
          
          if (!sectorTotals[sector]) {
            sectorTotals[sector] = {
              sector: sector,
              customerCount: 0,
              pastDueTotal: 0,
              notDueTotal: 0,
              total: 0,
              pastDuePercentage: 0
            };
          }
          
          sectorTotals[sector].customerCount++;
          sectorTotals[sector].pastDueTotal += pastDueBalance;
          sectorTotals[sector].notDueTotal += notDueBalance;
          sectorTotals[sector].total += totalBalance;
        });
      }
      
      // Yüzdeleri hesapla ve diziye çevir
      const sectorReport = Object.values(sectorTotals).map(sector => {
        return {
          ...sector,
          pastDuePercentage: sector.total > 0 ? (sector.pastDueTotal / sector.total) * 100 : 0,
          averagePerCustomer: sector.customerCount > 0 ? sector.total / sector.customerCount : 0
        };
      });
      
      // En yüksek toplam bakiyeden en düşüğe sırala
      sectorReport.sort((a, b) => b.total - a.total);
      
      setReportData(sectorReport);
    } catch (error) {
      console.error('Sektör analiz raporu hatası:', error);
      throw error;
    }
  };
  
  // Bölge analiz raporu
  const fetchRegionAnalysisReport = async () => {
    try {
      // Ana sorguyu oluştur
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
      
      const { data: balances, error } = await query;
      if (error) throw error;
      
      // Bölge bazlı toplamları hesapla
      const regionTotals = {};
      
      if (balances && balances.length > 0) {
        balances.forEach(balance => {
          if (!balance.customers) return;
          
          const region = balance.customers.region_code || 'Tanımsız';
          const pastDueBalance = parseFloat(balance.past_due_balance || 0);
          const notDueBalance = parseFloat(balance.not_due_balance || 0);
          const totalBalance = parseFloat(balance.total_balance || 0) || (pastDueBalance + notDueBalance);
          
          if (!regionTotals[region]) {
            regionTotals[region] = {
              region: region,
              customerCount: 0,
              pastDueTotal: 0,
              notDueTotal: 0,
              total: 0,
              pastDuePercentage: 0
            };
          }
          
          regionTotals[region].customerCount++;
          regionTotals[region].pastDueTotal += pastDueBalance;
          regionTotals[region].notDueTotal += notDueBalance;
          regionTotals[region].total += totalBalance;
        });
      }
      
      // Yüzdeleri hesapla ve diziye çevir
      const regionReport = Object.values(regionTotals).map(region => {
        return {
          ...region,
          pastDuePercentage: region.total > 0 ? (region.pastDueTotal / region.total) * 100 : 0,
          averagePerCustomer: region.customerCount > 0 ? region.total / region.customerCount : 0
        };
      });
      
      // En yüksek toplam bakiyeden en düşüğe sırala
      regionReport.sort((a, b) => b.total - a.total);
      
      setReportData(regionReport);
    } catch (error) {
      console.error('Bölge analiz raporu hatası:', error);
      throw error;
    }
  };
  
  // Ödeme risk skoru hesapla (0-100 arası)
  const calculatePaymentRisk = (pastDueBalance, daysOverdue, notCount) => {
    // Basit bir risk skoru hesaplama
    let riskScore = 0;
    
    // Vadesi geçmiş bakiye faktörü (max 50 puan)
    if (pastDueBalance > 0) {
      // Bakiyeye göre 0-50 arası puan
      const balanceFactor = Math.min(pastDueBalance / 10000, 1) * 50;
      riskScore += balanceFactor;
    }
    
    // Gecikme gün faktörü (max 30 puan)
    if (daysOverdue > 0) {
      // Gecikme gününe göre 0-30 arası puan
      const overdueFactor = Math.min(daysOverdue / 90, 1) * 30;
      riskScore += overdueFactor;
    }
    
    // Not sayısı faktörü (max 20 puan) - çok not daha yüksek risk
    if (notCount > 3) {
      // 3'ten fazla not varsa 0-20 arası puan
      const noteFactor = Math.min((notCount - 3) / 7, 1) * 20;
      riskScore += noteFactor;
    }
    
    return Math.round(riskScore);
  };
  
  // Genel bakış verilerini işle
  const processOverviewData = (balances) => {
    // Burada genel bakış verilerini işleyebilirsiniz
    // Örneğin sektör bazlı pasta grafiği verileri vb.
  };
  
  // Müşteri davranış verilerini işle
  const processCustomerBehaviorData = (notes) => {
    // Müşteri bazlı not/iletişim analizi
    const customerNotesMap = {};
    
    notes.forEach(note => {
      if (!note.customers) return;
      
      const customerId = note.customer_id;
      
      if (!customerNotesMap[customerId]) {
        customerNotesMap[customerId] = {
          id: customerId,
          name: note.customers.name,
          code: note.customers.code,
          sector: note.customers.sector_code || '-',
          region: note.customers.region_code || '-',
          noteCount: 0,
          promiseCount: 0,
          completedPromises: 0,
          lastNoteDate: null,
          tags: {}
        };
      }
      
      // Not sayısını artır
      customerNotesMap[customerId].noteCount++;
      
      // Son not tarihini güncelle
      if (!customerNotesMap[customerId].lastNoteDate || 
          new Date(note.created_at) > new Date(customerNotesMap[customerId].lastNoteDate)) {
        customerNotesMap[customerId].lastNoteDate = note.created_at;
      }
      
      // Söz verilen ödeme bilgisi
      if (note.promise_date) {
        customerNotesMap[customerId].promiseCount++;
        
        // Vade sözü geçmiş ve ödendi mi? (basit varsayım - not.tags içinde 'payment' varsa)
        if (new Date(note.promise_date) < new Date() && 
            note.tags && note.tags.includes('payment')) {
          customerNotesMap[customerId].completedPromises++;
        }
      }
      
      // Etiketleri say
      if (note.tags && note.tags.length) {
        note.tags.forEach(tag => {
          if (!customerNotesMap[customerId].tags[tag]) {
            customerNotesMap[customerId].tags[tag] = 0;
          }
          customerNotesMap[customerId].tags[tag]++;
        });
      }
    });
    
    // Müşteri verileri dizisine dönüştür
    const customerBehavior = Object.values(customerNotesMap).map(customer => {
      // Söz tutma oranı hesapla
      let promiseKeepRate = 0;
      if (customer.promiseCount > 0) {
        promiseKeepRate = (customer.completedPromises / customer.promiseCount) * 100;
      }
      
      // En çok kullanılan etiketi bul
      let mostUsedTag = null;
      let mostUsedTagCount = 0;
      
      Object.entries(customer.tags).forEach(([tag, count]) => {
        if (count > mostUsedTagCount) {
          mostUsedTag = tag;
          mostUsedTagCount = count;
        }
      });
      
      return {
        ...customer,
        promiseKeepRate,
        mostUsedTag,
        mostUsedTagCount
      };
    });
    
    // En çok nota göre sırala
    customerBehavior.sort((a, b) => b.noteCount - a.noteCount);
    
    setCustomerBehaviorData(customerBehavior);
  };
  
  // Raporu Excel'e dışa aktar
  const exportToExcel = () => {
    setExporting(true);
    try {
      let dataToExport = [];
      let filename = '';
      
      // Rapor türüne göre veri formatla
      if (reportType === 'customer_performance') {
        filename = `musteri-performans-${new Date().toISOString().slice(0,10)}.xlsx`;
        
        dataToExport = reportData.map(customer => ({
          'Müşteri Kodu': customer.code,
          'Müşteri Adı': customer.name,
          'Sektör': customer.sector,
          'Bölge': customer.region,
          'Vadesi Geçmiş Bakiye': customer.pastDueBalance,
          'Vadesi Geçmemiş Bakiye': customer.notDueBalance,
          'Toplam Bakiye': customer.totalBalance,
          'Vadesi Geçen Gün': customer.daysOverdue,
          'Not Sayısı': customer.notCount,
          'Son Not Tarihi': customer.lastNotDate ? formatDate(customer.lastNotDate) : '-',
          'Son Söz Verilen Tarih': customer.lastPromiseDate ? formatDate(customer.lastPromiseDate) : '-',
          'Ödeme Risk Skoru': customer.paymentRisk
        }));
      } else if (reportType === 'sector_analysis') {
        filename = `sektor-analiz-${new Date().toISOString().slice(0,10)}.xlsx`;
        
        dataToExport = reportData.map(sector => ({
          'Sektör': sector.sector,
          'Müşteri Sayısı': sector.customerCount,
          'Vadesi Geçmiş Toplam': sector.pastDueTotal,
          'Vadesi Geçmemiş Toplam': sector.notDueTotal,
          'Toplam Bakiye': sector.total,
          'Vadesi Geçmiş Yüzde': sector.pastDuePercentage.toFixed(2) + '%',
          'Müşteri Başına Ortalama': sector.averagePerCustomer
        }));
      } else if (reportType === 'region_analysis') {
        filename = `bolge-analiz-${new Date().toISOString().slice(0,10)}.xlsx`;
        
        dataToExport = reportData.map(region => ({
          'Bölge': region.region,
          'Müşteri Sayısı': region.customerCount,
          'Vadesi Geçmiş Toplam': region.pastDueTotal,
          'Vadesi Geçmemiş Toplam': region.notDueTotal,
          'Toplam Bakiye': region.total,
          'Vadesi Geçmiş Yüzde': region.pastDuePercentage.toFixed(2) + '%',
          'Müşteri Başına Ortalama': region.averagePerCustomer
        }));
      }
      
      // Excel oluştur
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Rapor');
      
      // Excel dosyasını indir
      XLSX.writeFile(workbook, filename);
      
      toast.success('Rapor başarıyla indirildi');
    } catch (error) {
      console.error('Excel dışa aktarma hatası:', error);
      toast.error('Rapor oluşturulurken bir hata oluştu');
    } finally {
      setExporting(false);
    }
  };
  
  // Tarih formatla
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd.MM.yyyy', { locale: tr });
    } catch (error) {
      return dateString;
    }
  };
  
  // Para birimi formatla
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', { 
      style: 'currency', 
      currency: 'TRY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0 
    }).format(amount);
  };
  
  // Risk skoru rengini belirle
  const getRiskColor = (score) => {
    if (score < 30) return '#2ecc71'; // Yeşil - Düşük risk
    if (score < 60) return '#f39c12'; // Sarı - Orta risk
    return '#e74c3c'; // Kırmızı - Yüksek risk
  };

  // Admin/muhasebe kontrolü - diğer kullanıcılar için erişimi engelle
  if (!isAdmin && !isMuhasebe) {
    return (
      <div className="card">
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
          Erişim Engellendi
        </h2>
        <p>Bu sayfaya erişmek için yönetici veya muhasebe yetkileri gerekiyor.</p>
      </div>
    );
  }

  return (
    <div className="analytics-page">
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        Vade Analizi ve Raporlama
      </h1>
      
      {/* Filtreler */}
      <div className="card" style={{ marginBottom: '20px', padding: '15px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
          {/* Tarih aralığı filtresi */}
          <div style={{ minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Tarih Aralığı:</label>
            <select 
              value={dateRange} 
              onChange={(e) => setDateRange(Number(e.target.value))}
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
      
      {/* Tabs */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #ddd' }}>
          <button 
            className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
            style={{ 
              padding: '10px 20px', 
              border: 'none', 
              background: 'none', 
              borderBottom: activeTab === 'overview' ? '2px solid #3498db' : 'none',
              fontWeight: activeTab === 'overview' ? 'bold' : 'normal',
              color: activeTab === 'overview' ? '#3498db' : '#333',
              cursor: 'pointer'
            }}
          >
            Genel Bakış
          </button>
          <button 
            className={`tab-button ${activeTab === 'customer' ? 'active' : ''}`}
            onClick={() => setActiveTab('customer')}
            style={{ 
              padding: '10px 20px', 
              border: 'none', 
              background: 'none', 
              borderBottom: activeTab === 'customer' ? '2px solid #3498db' : 'none',
              fontWeight: activeTab === 'customer' ? 'bold' : 'normal',
              color: activeTab === 'customer' ? '#3498db' : '#333',
              cursor: 'pointer'
            }}
          >
            Müşteri Analizi
          </button>
          <button 
            className={`tab-button ${activeTab === 'seller' ? 'active' : ''}`}
            onClick={() => setActiveTab('seller')}
            style={{ 
              padding: '10px 20px', 
              border: 'none', 
              background: 'none', 
              borderBottom: activeTab === 'seller' ? '2px solid #3498db' : 'none',
              fontWeight: activeTab === 'seller' ? 'bold' : 'normal',
              color: activeTab === 'seller' ? '#3498db' : '#333',
              cursor: 'pointer'
            }}
          >
            Satıcı Performansı
          </button>
          <button 
            className={`tab-button ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
            style={{ 
              padding: '10px 20px', 
              border: 'none', 
              background: 'none', 
              borderBottom: activeTab === 'reports' ? '2px solid #3498db' : 'none',
              fontWeight: activeTab === 'reports' ? 'bold' : 'normal',
              color: activeTab === 'reports' ? '#3498db' : '#333',
              cursor: 'pointer'
            }}
          >
            Raporlar
          </button>
        </div>
      </div>
      
      {/* Tab içerikleri */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Veriler yükleniyor...</div>
      ) : (
        <>
          {/* Genel Bakış Sekmesi */}
          {activeTab === 'overview' && (
            <div className="overview-tab">
              {/* Burada genel bakış grafikleri ve özet istatistikler gösterilir */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                {/* Buraya Dashboard.js'deki gibi grafikler eklenebilir */}
              </div>
            </div>
          )}
          
          {/* Müşteri Analizi Sekmesi */}
          {activeTab === 'customer' && (
            <div className="customer-tab">
              <div className="card">
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
                  Müşteri İletişim Analizi
                </h2>
                
                {customerBehaviorData.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left' }}>Müşteri</th>
                          <th style={{ textAlign: 'center' }}>Not Sayısı</th>
                          <th style={{ textAlign: 'center' }}>Söz Sayısı</th>
                          <th style={{ textAlign: 'center' }}>Söz Tutma %</th>
                          <th style={{ textAlign: 'center' }}>Son Not</th>
                          <th style={{ textAlign: 'left' }}>En Sık Etiket</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerBehaviorData.map((customer) => (
                          <tr key={customer.id}>
                            <td>
                              <div style={{ fontWeight: 'bold' }}>{customer.name}</div>
                              <div style={{ fontSize: '12px', color: '#888' }}>{customer.code}</div>
                            </td>
                            <td style={{ textAlign: 'center' }}>{customer.noteCount}</td>
                            <td style={{ textAlign: 'center' }}>{customer.promiseCount}</td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ 
                                fontWeight: 'bold',
                                color: customer.promiseKeepRate >= 70 ? '#2ecc71' : 
                                       customer.promiseKeepRate >= 30 ? '#f39c12' : '#e74c3c'
                              }}>
                                {customer.promiseKeepRate.toFixed(0)}%
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {customer.lastNoteDate ? formatDate(customer.lastNoteDate) : '-'}
                            </td>
                            <td>
                              {customer.mostUsedTag ? (
                                <span style={{ 
                                  backgroundColor: '#f0f0f0', 
                                  padding: '3px 8px', 
                                  borderRadius: '12px', 
                                  fontSize: '12px' 
                                }}>
                                  {customer.mostUsedTag} ({customer.mostUsedTagCount})
                                </span>
                              ) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                    Müşteri verisi bulunamadı
                  </p>
                )}
              </div>
            </div>
          )}
          
          {/* Satıcı Performansı Sekmesi */}
          {activeTab === 'seller' && (
            <div className="seller-tab">
              <div className="card">
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
                  Satıcı Not Takip Performansı
                </h2>
                
                {sellerPerformanceData.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left' }}>Satıcı</th>
                          <th style={{ textAlign: 'center' }}>Toplam Not</th>
                          <th style={{ textAlign: 'center' }}>Söz Notları</th>
                          <th style={{ textAlign: 'center' }}>Etiketli Notlar</th>
                          <th style={{ textAlign: 'center' }}>Benzersiz Müşteri</th>
                          <th style={{ textAlign: 'center' }}>Müşteri Başına Not</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sellerPerformanceData.map((seller) => (
                          <tr key={seller.id}>
                            <td>
                              <div style={{ fontWeight: 'bold' }}>{seller.name}</div>
                              <div style={{ fontSize: '12px', color: '#888' }}>
                                {seller.role === 'admin' ? 'Yönetici' : 
                                 seller.role === 'muhasebe' ? 'Muhasebe' : 'Satıcı'}
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>{seller.totalNotes}</td>
                            <td style={{ textAlign: 'center' }}>{seller.promiseNotes}</td>
                            <td style={{ textAlign: 'center' }}>{seller.taggedNotes}</td>
                            <td style={{ textAlign: 'center' }}>{seller.uniqueCustomers}</td>
                            <td style={{ textAlign: 'center' }}>
                              {seller.averageNotesPerCustomer.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                    Satıcı performans verisi bulunamadı
                  </p>
                )}
              </div>
            </div>
          )}
          
          {/* Raporlar Sekmesi */}
          {activeTab === 'reports' && (
            <div className="reports-tab">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                  <label style={{ marginRight: '10px' }}>Rapor Tipi:</label>
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                  >
                    <option value="customer_performance">Müşteri Performans Raporu</option>
                    <option value="sector_analysis">Sektör Analiz Raporu</option>
                    <option value="region_analysis">Bölge Analiz Raporu</option>
                  </select>
                </div>
                
                <button
                  onClick={exportToExcel}
                  disabled={exporting || reportData.length === 0}
                  className="btn btn-success"
                >
                  {exporting ? 'İndiriliyor...' : 'Excel Olarak İndir'}
                </button>
              </div>
              
              <div className="card">
                {reportType === 'customer_performance' && (
                  <>
                    <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
                      Müşteri Performans Raporu
                    </h2>
                    
                    {reportData.length > 0 ? (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left' }}>Müşteri</th>
                              <th style={{ textAlign: 'right' }}>Vadesi Geçmiş</th>
                              <th style={{ textAlign: 'right' }}>Toplam Bakiye</th>
                              <th style={{ textAlign: 'center' }}>Gecikme (Gün)</th>
                              <th style={{ textAlign: 'center' }}>Not Sayısı</th>
                              <th style={{ textAlign: 'center' }}>Son Söz</th>
                              <th style={{ textAlign: 'center' }}>Risk Skoru</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.map((customer) => (
                              <tr key={customer.id}>
                                <td>
                                  <div style={{ fontWeight: 'bold' }}>{customer.name}</div>
                                  <div style={{ fontSize: '12px', color: '#888' }}>
                                    {customer.code} | {customer.sector}
                                  </div>
                                </td>
                                <td style={{ textAlign: 'right', color: customer.pastDueBalance > 0 ? '#e74c3c' : 'inherit' }}>
                                  {formatCurrency(customer.pastDueBalance)}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                  {formatCurrency(customer.totalBalance)}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {customer.daysOverdue > 0 ? (
                                    <span style={{ 
                                      color: customer.daysOverdue > 30 ? '#e74c3c' : 
                                             customer.daysOverdue > 15 ? '#f39c12' : '#2ecc71'
                                    }}>
                                      {customer.daysOverdue} gün
                                    </span>
                                  ) : '-'}
                                </td>
                                <td style={{ textAlign: 'center' }}>{customer.notCount}</td>
                                <td style={{ textAlign: 'center' }}>
                                  {customer.lastPromiseDate ? formatDate(customer.lastPromiseDate) : '-'}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <div style={{ 
                                    display: 'inline-block',
                                    width: '30px',
                                    height: '30px',
                                    borderRadius: '50%',
                                    backgroundColor: getRiskColor(customer.paymentRisk),
                                    color: 'white',
                                    fontWeight: 'bold',
                                    lineHeight: '30px'
                                  }}>
                                    {customer.paymentRisk}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                        Rapor verisi bulunamadı
                      </p>
                    )}
                  </>
                )}
                
                {reportType === 'sector_analysis' && (
                  <>
                    <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
                      Sektör Analiz Raporu
                    </h2>
                    
                    {reportData.length > 0 ? (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left' }}>Sektör</th>
                              <th style={{ textAlign: 'center' }}>Müşteri Sayısı</th>
                              <th style={{ textAlign: 'right' }}>Vadesi Geçmiş</th>
                              <th style={{ textAlign: 'right' }}>Toplam Bakiye</th>
                              <th style={{ textAlign: 'center' }}>Vadesi Geçmiş %</th>
                              <th style={{ textAlign: 'right' }}>Müşteri Başına</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.map((sector, index) => (
                              <tr key={index}>
                                <td style={{ fontWeight: 'bold' }}>{sector.sector}</td>
                                <td style={{ textAlign: 'center' }}>{sector.customerCount}</td>
                                <td style={{ textAlign: 'right', color: '#e74c3c' }}>
                                  {formatCurrency(sector.pastDueTotal)}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                  {formatCurrency(sector.total)}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <div style={{ 
                                    color: sector.pastDuePercentage > 50 ? '#e74c3c' : 
                                           sector.pastDuePercentage > 25 ? '#f39c12' : '#2ecc71',
                                    fontWeight: 'bold'
                                  }}>
                                    {sector.pastDuePercentage.toFixed(1)}%
                                  </div>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  {formatCurrency(sector.averagePerCustomer)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                        Rapor verisi bulunamadı
                      </p>
                    )}
                  </>
                )}
                
                {reportType === 'region_analysis' && (
                  <>
                    <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
                      Bölge Analiz Raporu
                    </h2>
                    
                    {reportData.length > 0 ? (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left' }}>Bölge</th>
                              <th style={{ textAlign: 'center' }}>Müşteri Sayısı</th>
                              <th style={{ textAlign: 'right' }}>Vadesi Geçmiş</th>
                              <th style={{ textAlign: 'right' }}>Toplam Bakiye</th>
                              <th style={{ textAlign: 'center' }}>Vadesi Geçmiş %</th>
                              <th style={{ textAlign: 'right' }}>Müşteri Başına</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.map((region, index) => (
                              <tr key={index}>
                                <td style={{ fontWeight: 'bold' }}>{region.region}</td>
                                <td style={{ textAlign: 'center' }}>{region.customerCount}</td>
                                <td style={{ textAlign: 'right', color: '#e74c3c' }}>
                                  {formatCurrency(region.pastDueTotal)}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                  {formatCurrency(region.total)}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <div style={{ 
                                    color: region.pastDuePercentage > 50 ? '#e74c3c' : 
                                           region.pastDuePercentage > 25 ? '#f39c12' : '#2ecc71',
                                    fontWeight: 'bold'
                                  }}>
                                    {region.pastDuePercentage.toFixed(1)}%
                                  </div>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  {formatCurrency(region.averagePerCustomer)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                        Rapor verisi bulunamadı
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Analytics;