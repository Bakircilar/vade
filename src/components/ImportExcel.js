import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';

const ImportExcel = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(0);
  const [recordsProcessed, setRecordsProcessed] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [importSummary, setImportSummary] = useState(null);
  const [customersCreated, setCustomersCreated] = useState(0);
  const [customersUpdated, setCustomersUpdated] = useState(0);
  const [balancesCreated, setBalancesCreated] = useState(0);
  const [balancesUpdated, setBalancesUpdated] = useState(0);
  const [debugInfo, setDebugInfo] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const fileType = selectedFile.name.split('.').pop().toLowerCase();
      if (fileType !== 'xlsx' && fileType !== 'xls') {
        toast.error('Lütfen geçerli bir Excel dosyası yükleyin (.xlsx, .xls)');
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Lütfen bir Excel dosyası seçin');
      return;
    }
    setUploading(true);
    setProgress(10);
    setCustomersCreated(0);
    setCustomersUpdated(0);
    setBalancesCreated(0);
    setBalancesUpdated(0);
    setImportSummary(null);
    setDebugInfo(null);
    
    try {
      const data = await readExcelFile(file);
      setProgress(30);
      
      // İlk satırları ve değerleri debug için logla
      const firstFewRows = data.slice(0, 3); // İlk 3 satırı al
      console.log("Excel başlıkları:", data[0]);
      console.log("İlk satırlar örneği:", firstFewRows);
      
      const customers = processExcelData(data);
      
      // Debug için müşteri verilerini göster
      const customerKeys = Object.keys(customers);
      if (customerKeys.length > 0) {
        const firstCustomerExample = customers[customerKeys[0]];
        console.log("İlk müşteri örneği:", firstCustomerExample);
        setDebugInfo({
          firstRowExample: firstFewRows[1],
          firstCustomerExample
        });
      }
      
      setProgress(50);
      const keys = Object.keys(customers);
      setTotalRecords(keys.length);
      await uploadToSupabaseBulk(customers);
      setProgress(100);
      
      // İşlem özetini hazırla
      const summary = {
        totalProcessed: recordsProcessed,
        customersCreated,
        customersUpdated,
        balancesCreated,
        balancesUpdated
      };
      setImportSummary(summary);
      
      toast.success('Veriler başarıyla içe aktarıldı');
      setFile(null);
    } catch (error) {
      console.error('Import error:', error);
      toast.error(`Veri içe aktarma hatası: ${error.message}`);
    } finally {
      // Hata durumunda da özet gösterebiliriz
      if (!importSummary) {
        setImportSummary({
          totalProcessed: recordsProcessed,
          customersCreated,
          customersUpdated,
          balancesCreated,
          balancesUpdated
        });
      }
      setUploading(false);
    }
  };

  // Excel tarihini işleme yardımcı fonksiyonu - Kapsamlı düzeltmeler
const parseDateValue = (value) => {
  if (!value) return null;
  
  try {
    console.log("Tarih dönüştürme - Orijinal değer:", value, "Türü:", typeof value);
    
    // Excel tarihi numarik mi kontrol et (1900 tarih sistemi)
    if (typeof value === 'number') {
      // Excel tarihi işleme - manuel olarak düzeltme uygula
      // 25569: 1 Ocak 1970 - 1 Ocak 1900 arası gün farkı
      
      // ÖZEL DÜZELTME: Tarih başına bir gün ekle (+1)
      // Bu, Excel'den yükleme sırasında oluşan 1 günlük kaymayı telafi eder
      const excelDate = value + 1;
      
      // JavaScript tarihi oluştur
      const msDate = (excelDate - 25569) * 86400 * 1000;
      const date = new Date(msDate);
      
      // Saat dilimi farkını düzelt
      const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
      
      console.log("Tarih dönüştürme - Sayısal değer:", value, "→ Düzeltilmiş Tarih:", utcDate.toISOString());
      return utcDate;
    }
    
    // Tarih string formatında ise
    if (typeof value === 'string') {
      // Türkçe format (gg.aa.yyyy) kontrolü
      const dateParts = value.split('.');
      if (dateParts.length === 3) {
        // Direkt olarak Date nesnesini oluştur
        const day = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1; // Aylar 0-11 arasında
        const year = parseInt(dateParts[2], 10);
        
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          // Kesin tarih manipülasyonu
          const date = new Date(Date.UTC(year, month, day));
          console.log("Tarih dönüştürme - Türkçe format:", value, "→", date.toISOString());
          return date;
        }
      }
      
      // ISO format (yyyy-mm-dd) kontrolü
      if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = value.split('-').map(Number);
        // Kesin tarih oluşturma, UTC kullanarak
        const date = new Date(Date.UTC(year, month - 1, day));
        console.log("Tarih dönüştürme - ISO format:", value, "→", date.toISOString());
        return date;
      }
      
      // Excel formatlı tarih string değeri (örn: "44197" string olarak)
      if (/^\d+$/.test(value)) {
        // String'i sayıya çevir ve manuel Excel tarihi düzeltmesini uygula
        const excelDate = Number(value) + 1; // +1 düzeltme uygula
        const msDate = (excelDate - 25569) * 86400 * 1000;
        const date = new Date(msDate);
        console.log("Tarih dönüştürme - Sayısal string:", value, "→", date.toISOString());
        return date;
      }
      
      // Genel date parsing denemesi
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        console.log("Tarih dönüştürme - Genel string:", value, "→", date.toISOString());
        return date;
      }
    }
    
    // Date nesnesi kontrolü
    if (value instanceof Date && !isNaN(value.getTime())) {
      // Date nesnesini olduğu gibi kullan ama 1 gün ekle
      const correctedDate = new Date(value);
      correctedDate.setDate(correctedDate.getDate() + 1);
      console.log("Tarih dönüştürme - Date nesnesi:", value, "→", correctedDate.toISOString());
      return correctedDate;
    }
    
    // Hiçbir formatta işlenemiyorsa
    console.warn("Tarih dönüştürme - Bilinmeyen format:", value);
    return null;
    
  } catch (error) {
    console.error("Tarih ayrıştırma hatası:", error, "Değer:", value);
    return null;
  }
};

// Excel dosyası okuma fonksiyonu - Geliştirilmiş
const readExcelFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        
        // Excel'i okurken tarih formatlarına özel önem ver
        const workbook = XLSX.read(data, { 
          type: 'array',
          cellDates: true,       // Tarihleri Date nesnesi olarak al
          dateNF: 'dd.mm.yyyy',  // Türkiye tarih formatı
          cellNF: true,          // Sayı formatını koru
          cellStyles: true,      // Hücre stillerini oku (tarih stili tespiti için)
          WTF: true              // Hata toleransını artır
        });
        
        // İlk çalışma sayfasını al
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        
        // Daha kapsamlı ayarlarla JSON dönüşümü
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,              // Başlık satırı belirt
          raw: false,             // Değerleri işlenmemiş olarak al
          dateNF: 'dd.mm.yyyy',  // Tarihler için Türkiye formatı
          defval: ''              // Boş hücreler için varsayılan
        });
        
        console.log("Excel okuma başlıkları:", jsonData[0]);
        console.log("Excel okuma ilk satır:", jsonData[1]);
        
        resolve(jsonData);
        
      } catch (error) {
        console.error("Excel okuma hatası:", error);
        reject(new Error('Excel dosyası okunamadı: ' + error.message));
      }
    };
    reader.onerror = () => reject(new Error('Dosya okunamadı'));
    reader.readAsArrayBuffer(file);
  });
};

  // Geliştirilmiş Excel değerini sayıya çevirme fonksiyonu
  const parseNumericValue = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    
    // Zaten sayısal değerse doğrudan döndür
    if (typeof value === 'number') return value;
    
    let strValue = String(value).trim();
    
    // Türkçe formatı kontrol et (1.234,56 şeklinde)
    if (/^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(strValue)) {
      // Binlik ayırıcıları kaldır, virgülü noktaya çevir
      strValue = strValue.replace(/\./g, '').replace(',', '.');
    } 
    // İngilizce formatı kontrol et (1,234.56 şeklinde)
    else if (/^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(strValue)) {
      // Binlik ayırıcıları kaldır
      strValue = strValue.replace(/,/g, '');
    }
    // Tek virgüllü format (1234,56 şeklinde)
    else if (/^-?\d+,\d+$/.test(strValue)) {
      // Virgülü noktaya çevir
      strValue = strValue.replace(',', '.');
    }
    
    const result = parseFloat(strValue);
    return isNaN(result) ? 0 : result;
  };
  
  // Excel tarihini işleme yardımcı fonksiyonu
const parseDateValue = (value) => {
  if (!value) return null;
  
  try {
    // Debug: Orijinal tarih değerini logla
    console.log("Tarih dönüştürme - Orijinal değer:", value, "Türü:", typeof value);
    
    // Excel tarihi numarik mi kontrol et (1900 tarih sistemi)
    if (typeof value === 'number') {
      // Excel tarihi (1900 sistemi) - 1 Ocak 1900'den itibaren gün sayısı
      // NOT: Excel ve JavaScript'in tarih hesaplamasındaki farkları düzelt
      // JavaScript Date: milisaniye cinsinden 1 Ocak 1970'den itibaren
      // Excel: 1 Ocak 1900'den itibaren gün sayısı
      // Excel 60. günü 29 Şubat 1900 kabul eder ama bu tarih gerçekte yoktur
      // Bu yüzden 1 Mart 1900'den sonraki tarihler için 1 gün çıkarmak gerekir
      
      let excelDate = value;
      
      // Tarih Lotus 1-2-3 bug düzeltmesi (1900 yılı için yanlış artık yıl hesabı)
      if (excelDate > 59) {
        excelDate -= 1; // 29 Şubat 1900 tarihini düzelt (gerçekte olmayan tarih)
      }
      
      // JavaScript tarihi: (Excel günü - 25569) * 86400000
      // 25569: 1 Ocak 1970 - 1 Ocak 1900 arası gün farkı
      const jsDate = new Date((excelDate - 25569) * 86400000);
      
      // UTC zaman dilimi sorununu düzelt - yerel saat dilimine çevir
      const utcDate = new Date(jsDate.getTime() + jsDate.getTimezoneOffset() * 60000);
      
      console.log("Tarih dönüştürme - Hesaplanan tarih:", utcDate.toISOString());
      return utcDate;
    }
    
    // Tarih string formatında
    if (typeof value === 'string') {
      // Türkçe format (gg.aa.yyyy) kontrolü
      const dateParts = value.split('.');
      if (dateParts.length === 3) {
        // Ay değerini 0-11 aralığına çevir (JavaScript Date)
        const month = parseInt(dateParts[1], 10) - 1;
        const day = parseInt(dateParts[0], 10);
        const year = parseInt(dateParts[2], 10);
        
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          const date = new Date(year, month, day);
          console.log("Tarih dönüştürme - Türkçe format:", date.toISOString());
          return date;
        }
      }
      
      // ISO format denemesi (yyyy-mm-dd)
      const isoDate = new Date(value);
      if (!isNaN(isoDate.getTime())) {
        console.log("Tarih dönüştürme - ISO format:", isoDate.toISOString());
        return isoDate;
      }
    }
    
    // Tarih objesi kontrolü
    if (value instanceof Date && !isNaN(value.getTime())) {
      console.log("Tarih dönüştürme - Date nesnesi:", value.toISOString());
      return value;
    }
  } catch (error) {
    console.error("Tarih ayrıştırma hatası:", error, "Değer:", value);
  }
  
  return null;
};

  // Excel verilerini işleme - düzeltilmiş
const processExcelData = (data) => {
  const headers = data[0];
  const customers = {};
  
  // Kolon indekslerini bul
  const findColumnIndex = (name) => {
    // Daha esnek sütun başlığı eşleştirme
    return headers.findIndex(header => {
      if (!header) return false;
      const headerStr = header.toString().toLowerCase().trim();
      const searchStr = name.toLowerCase().trim();
      return headerStr.includes(searchStr);
    });
  };
  
  // Sütun indekslerini bul
  const codeIndex = findColumnIndex('cari hesap kodu');
  const nameIndex = findColumnIndex('cari hesap adı');
  const sectorIndex = findColumnIndex('sektör kodu');
  const groupIndex = findColumnIndex('grup kodu');
  const regionIndex = findColumnIndex('bölge kodu');
  const paymentTermIndex = findColumnIndex('cari ödeme vadesi');
  const pastDueBalanceIndex = findColumnIndex('vadesi geçen bakiye');
  const pastDueDateIndex = findColumnIndex('vadesi geçen bakiye vadesi');
  const notDueBalanceIndex = findColumnIndex('vadesi geçmemiş bakiye');
  const notDueDateIndex = findColumnIndex('vadesi geçmemiş bakiye vadesi'); 
  const valorIndex = findColumnIndex('valör');
  const totalBalanceIndex = findColumnIndex('toplam bakiye');
  const refDateIndex = findColumnIndex('bakiyeye konu ilk evrak');
  
  // Debug için indeksleri yazdır
  console.log("Bulunan sütun indeksleri:", {
    codeIndex,
    nameIndex,
    pastDueBalanceIndex,
    pastDueDateIndex,
    notDueDateIndex,
    totalBalanceIndex
  });
  
  if (codeIndex === -1 || nameIndex === -1) {
    throw new Error('Gerekli sütunlar bulunamadı. Excel formatınızı kontrol edin.');
  }
  
  // Veri satırlarını işle (başlık satırını atla)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    // Boş satırları atla
    if (!row[codeIndex]) continue;
    
    const customerCode = row[codeIndex].toString().trim();
    
    // Aynı müşteri kodunu tekrar işleme
    if (customers[customerCode]) {
      console.warn(`Müşteri kodu '${customerCode}' birden fazla satırda bulundu. Sadece ilk satır işlenecek.`);
      continue;
    }
    
    // TARİH ALANI - Vadesi geçmiş bakiye vadesi - DÜZELTME
    let pastDueDate = null;
    if (pastDueDateIndex !== -1 && row[pastDueDateIndex]) {
      pastDueDate = parseDateValue(row[pastDueDateIndex]);
      console.log(`Müşteri ${row[nameIndex]} - Vadesi geçmiş vade tarihi - Orijinal:`, row[pastDueDateIndex], "Dönüştürülmüş:", pastDueDate);
    }
    
    // TARİH ALANI - Vadesi geçmemiş bakiye vadesi - DÜZELTME
    let notDueDate = null;
    if (notDueDateIndex !== -1 && row[notDueDateIndex]) {
      notDueDate = parseDateValue(row[notDueDateIndex]);
      console.log(`Müşteri ${row[nameIndex]} - Vadesi geçmemiş vade tarihi - Orijinal:`, row[notDueDateIndex], "Dönüştürülmüş:", notDueDate);
    }
    
    // TARİH ALANI - Referans tarihi - DÜZELTME
    let refDate = null;
    if (refDateIndex !== -1 && row[refDateIndex]) {
      refDate = parseDateValue(row[refDateIndex]);
      console.log(`Müşteri ${row[nameIndex]} - Referans tarihi - Orijinal:`, row[refDateIndex], "Dönüştürülmüş:", refDate);
    }
    
    // Sektör kodunu al
    const sectorCode = sectorIndex !== -1 && row[sectorIndex] ? row[sectorIndex].toString().trim() : null;
    
    // Bakiye değerlerini sayıya çevir
    const pastDueBalance = pastDueBalanceIndex !== -1 ? parseNumericValue(row[pastDueBalanceIndex]) : 0;
    const notDueBalance = notDueBalanceIndex !== -1 ? parseNumericValue(row[notDueBalanceIndex]) : 0;
    const totalBalance = totalBalanceIndex !== -1 ? parseNumericValue(row[totalBalanceIndex]) : 0;
    const valor = valorIndex !== -1 ? parseInt(parseNumericValue(row[valorIndex]) || 0) : 0;
    
    // Müşteri ve bakiye verisini oluştur
    customers[customerCode] = {
      customer: {
        code: customerCode,
        name: row[nameIndex] ? row[nameIndex].toString().trim() : '',
        sector_code: sectorCode,
        group_code: groupIndex !== -1 && row[groupIndex] ? row[groupIndex].toString().trim() : null,
        region_code: regionIndex !== -1 && row[regionIndex] ? row[regionIndex].toString().trim() : null,
        payment_term: paymentTermIndex !== -1 && row[paymentTermIndex] ? row[paymentTermIndex].toString().trim() : null
      },
      balance: {
        past_due_balance: pastDueBalance,
        past_due_date: pastDueDate ? pastDueDate.toISOString().split('T')[0] : null,
        not_due_balance: notDueBalance,
        not_due_date: notDueDate ? notDueDate.toISOString().split('T')[0] : null,
        valor: valor,
        total_balance: totalBalance,
        reference_date: refDate ? refDate.toISOString().split('T')[0] : null
      }
    };
    
    // Tarih alanlarını özel olarak logla
    console.log(`Müşteri #${i} (${customerCode}):`, {
      past_due_date: customers[customerCode].balance.past_due_date,
      not_due_date: customers[customerCode].balance.not_due_date,
      reference_date: customers[customerCode].balance.reference_date
    });
  }
  
  return customers;
};

  const uploadToSupabaseBulk = async (customers) => {
    const keys = Object.keys(customers);
    const CHUNK_SIZE = 50; // Daha küçük parçalar halinde işlem yap
    
    // İlerleme takibi için
    let processedCount = 0;
    let customersCreatedCount = 0;
    let customersUpdatedCount = 0;
    let balancesCreatedCount = 0;
    let balancesUpdatedCount = 0;
    
    setTotalRecords(keys.length);
    
    try {
      // Müşteri kodu-ID eşleşmelerini saklamak için
      const existingCustomers = new Set();
      
      // Mevcut müşteri kodlarını kontrol etmek için önce bir sorgu yapalım
      const { data: existingData, error: existingError } = await supabase
        .from('customers')
        .select('id, code');
        
      if (existingError) throw existingError;
      
      // Mevcut müşteri kodlarını bir set'e ekleyelim
      const customerIdMap = {};
      if (existingData && existingData.length > 0) {
        existingData.forEach(customer => {
          existingCustomers.add(customer.code);
          customerIdMap[customer.code] = customer.id;
        });
      }
      
      // Müşteri verilerini parçalara bölerek işle
      for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
        const chunkKeys = keys.slice(i, i + CHUNK_SIZE);
        
        // Bu parça için müşteri verilerini oluştur
        const customersChunk = chunkKeys.map(code => ({
          code: customers[code].customer.code,
          name: customers[code].customer.name,
          sector_code: customers[code].customer.sector_code,
          group_code: customers[code].customer.group_code,
          region_code: customers[code].customer.region_code,
          payment_term: customers[code].customer.payment_term,
          updated_at: new Date().toISOString()
        }));
        
        // Her müşteri için yeni mi güncelleme mi olduğunu kontrol et
        customersChunk.forEach(customer => {
          if (existingCustomers.has(customer.code)) {
            customersUpdatedCount++;
          } else {
            customersCreatedCount++;
            existingCustomers.add(customer.code); // Yeni eklenen müşteriyi set'e ekle
          }
        });
        
        // Bulk upsert ile müşterileri ekle/güncelle
        const { data: upsertedCustomers, error: upsertError } = await supabase
          .from('customers')
          .upsert(customersChunk, { onConflict: 'code', returning: 'representation' });
        
        if (upsertError) throw upsertError;
        
        // Müşteri kodundan id'leri eşle
        let chunkCustomerMap = {};
        if (upsertedCustomers && upsertedCustomers.length > 0) {
          upsertedCustomers.forEach(customer => {
            chunkCustomerMap[customer.code] = customer.id;
            customerIdMap[customer.code] = customer.id; // Ana haritayı da güncelle
          });
        } else {
          // Eğer upsert sonucu boş geldiyse, yeniden sorgula
          const { data: fetchedCustomers, error: fetchError } = await supabase
            .from('customers')
            .select('id, code')
            .in('code', chunkKeys);
          
          if (fetchError) throw fetchError;
          
          fetchedCustomers.forEach(customer => {
            chunkCustomerMap[customer.code] = customer.id;
            customerIdMap[customer.code] = customer.id; // Ana haritayı da güncelle
          });
        }
        
        // Mevcut müşteri bakiyelerini kontrol etmek için
        const customerIds = Object.values(chunkCustomerMap).filter(id => id);
        const { data: existingBalances, error: balanceError } = await supabase
          .from('customer_balances')
          .select('customer_id')
          .in('customer_id', customerIds);
          
        if (balanceError) throw balanceError;
        
        // Mevcut bakiyeleri bir set'e ekleyelim
        const existingBalanceIds = new Set();
        if (existingBalances && existingBalances.length > 0) {
          existingBalances.forEach(balance => {
            existingBalanceIds.add(balance.customer_id);
          });
        }
        
        // Bakiye verilerini diziye dönüştür; geçerli customer_id olanları dahil et
        const balancesChunk = chunkKeys.map(code => {
          const cid = chunkCustomerMap[code];
          if (!cid) {
            console.warn(`${code} kodlu müşteri için ID bulunamadı`);
            return null;
          }
          
          // Bakiye yeni mi güncelleme mi kontrol et
          if (existingBalanceIds.has(cid)) {
            balancesUpdatedCount++;
          } else {
            balancesCreatedCount++;
          }
          
          // YENİ: Güncellenen bakiye verileri - İki vade tarihi de ekleniyor
          return {
            customer_id: cid,
            past_due_balance: customers[code].balance.past_due_balance,
            past_due_date: customers[code].balance.past_due_date,
            not_due_balance: customers[code].balance.not_due_balance,
            not_due_date: customers[code].balance.not_due_date, // YENİ: Vadesi geçmemiş bakiye vadesi
            valor: customers[code].balance.valor,
            total_balance: customers[code].balance.total_balance,
            reference_date: customers[code].balance.reference_date,
            updated_at: new Date().toISOString()
          };
        }).filter(row => row !== null);

        // İlk bakiye verisini logla
        if (balancesChunk.length > 0) {
          console.log("İlk bakiye verisi:", balancesChunk[0]);
        }
        
        // Eğer balancesChunk boşsa, upsert yapmaya çalışmayın
        if (balancesChunk.length > 0) {
          const { error: balanceUpsertError } = await supabase
            .from('customer_balances')
            .upsert(balancesChunk, { onConflict: 'customer_id', returning: 'minimal' });
          
          if (balanceUpsertError) throw balanceUpsertError;
        } else {
          console.warn("Bu parça için geçerli bakiye kaydı bulunamadı. Upsert atlanıyor.");
        }
        
        // İstatistikleri güncelle
        setCustomersCreated(customersCreatedCount);
        setCustomersUpdated(customersUpdatedCount);
        setBalancesCreated(balancesCreatedCount);
        setBalancesUpdated(balancesUpdatedCount);
        
        // İlerleme durumunu güncelle
        processedCount += chunkKeys.length;
        setRecordsProcessed(processedCount);
        setProgress(50 + Math.floor((processedCount / keys.length) * 40));
        
        // İstek yoğunluğunu azaltmak için kısa bir bekleme
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error("Veri yükleme hatası:", error);
      throw error;
    }
  };

  return (
    <div className="card">
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        Excel Veri İçe Aktarma
      </h1>
      <p style={{ marginBottom: '20px' }}>
        Bu araç ile Excel dosyanızdaki müşteri ve vade bilgilerini sisteme aktarabilirsiniz.
        Her müşteri kodu sadece bir kez bulunmalıdır. Excel dosyanızın aşağıdaki sütunları içerdiğinden emin olun:
      </p>
      <ul style={{ marginBottom: '20px', marginLeft: '20px', listStyleType: 'disc' }}>
        <li>Cari hesap kodu</li>
        <li>Cari hesap adı</li>
        <li>Sektör kodu</li>
        <li>Grup kodu</li>
        <li>Bölge kodu</li>
        <li>Cari Ödeme Vadesi</li>
        <li>Vadesi geçen bakiye</li>
        <li>Vadesi geçen bakiye vadesi</li>
        <li>Vadesi geçmemiş bakiye</li>
        <li>Vadesi geçmemiş bakiye vadesi</li>
        <li>Valör</li>
        <li>Toplam bakiye</li>
        <li>Bakiyeye konu ilk evrak tarihi</li>
      </ul>
      <div className="form-group">
        <label htmlFor="excelFile">Excel Dosyası Seçin</label>
        <input
          type="file"
          id="excelFile"
          accept=".xlsx, .xls"
          onChange={handleFileChange}
          style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
        />
      </div>
      {uploading && (
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              height: '10px',
              backgroundColor: '#e0e0e0',
              borderRadius: '5px',
              overflow: 'hidden',
              marginBottom: '5px'
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                backgroundColor: '#3498db',
                borderRadius: '5px'
              }}
            />
          </div>
          <p style={{ fontSize: '14px', color: '#666' }}>
            İçe aktarılıyor... {progress}% (İşlenen kayıt: {recordsProcessed} / {totalRecords}) {estimatedTime > 0 && `(Kalan süre: ${estimatedTime} dk)`}
          </p>
        </div>
      )}
      <button
        onClick={handleImport}
        disabled={!file || uploading}
        className="btn btn-primary"
        style={{ marginTop: '10px' }}
      >
        {uploading ? 'İşleniyor...' : 'İçe Aktar'}
      </button>
      
      {importSummary && (
        <div className="card" style={{ marginTop: '20px', backgroundColor: '#f9f9f9' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
            İçe Aktarma Özeti
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
            <div>
              <p style={{ fontSize: '14px', color: '#888' }}>İşlenen Toplam Kayıt</p>
              <p style={{ fontWeight: 'bold', fontSize: '18px' }}>{importSummary.totalProcessed}</p>
            </div>
            <div>
              <p style={{ fontSize: '14px', color: '#888' }}>Eklenen Müşteriler</p>
              <p style={{ fontWeight: 'bold', fontSize: '18px', color: '#2ecc71' }}>{importSummary.customersCreated}</p>
            </div>
            <div>
              <p style={{ fontSize: '14px', color: '#888' }}>Güncellenen Müşteriler</p>
              <p style={{ fontWeight: 'bold', fontSize: '18px', color: '#3498db' }}>{importSummary.customersUpdated}</p>
            </div>
            <div>
              <p style={{ fontSize: '14px', color: '#888' }}>Eklenen Bakiyeler</p>
              <p style={{ fontWeight: 'bold', fontSize: '18px', color: '#2ecc71' }}>{importSummary.balancesCreated}</p>
            </div>
            <div>
              <p style={{ fontSize: '14px', color: '#888' }}>Güncellenen Bakiyeler</p>
              <p style={{ fontWeight: 'bold', fontSize: '18px', color: '#3498db' }}>{importSummary.balancesUpdated}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Debug bilgileri (geliştiriciler için) */}
      {debugInfo && (
        <div className="card" style={{ marginTop: '20px', backgroundColor: '#f0f8ff', padding: '10px', fontSize: '12px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '5px' }}>Debug Bilgisi (Geliştirici Modu)</h3>
          <p style={{ marginBottom: '10px' }}>İlk Excel satırı ve işlenmiş müşteri örneği:</p>
          <pre style={{ 
            backgroundColor: '#f5f5f5', 
            padding: '8px', 
            borderRadius: '4px', 
            overflow: 'auto',
            maxHeight: '200px'
          }}>
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default ImportExcel;