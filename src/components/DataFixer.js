import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';

const DataFixer = () => {
  const [repairing, setRepairing] = useState(false);
  const [results, setResults] = useState(null);
  const [detailedResults, setDetailedResults] = useState([]);

  // Sayısal değeri doğru formata çevir
  const correctNumericValue = (value) => {
    if (value === null || value === undefined) return 0;
    
    // Eğer zaten bir sayı ise direkt dön
    if (typeof value === 'number') return value;
    
    // String ise, Türkçe formatını düzelt
    if (typeof value === 'string') {
      // Binlik ayırıcıları (.) kaldır, ondalık ayırıcıyı (,) nokta (.) ile değiştir
      const normalizedValue = value.trim();
      
      // Türk formatı kontrolü
      if (normalizedValue.includes('.') && normalizedValue.includes(',') && 
          normalizedValue.lastIndexOf('.') < normalizedValue.lastIndexOf(',')) {
        // Binlik ayırıcıları (.) kaldır, ondalık ayırıcıyı (,) nokta (.) ile değiştir
        const parsedValue = normalizedValue.replace(/\./g, '').replace(',', '.');
        const result = parseFloat(parsedValue);
        return isNaN(result) ? 0 : result;
      } 
      // Eğer sadece virgül varsa, onu da noktaya çevir
      else if (!normalizedValue.includes('.') && normalizedValue.includes(',')) {
        const parsedValue = normalizedValue.replace(',', '.');
        const result = parseFloat(parsedValue);
        return isNaN(result) ? 0 : result;
      }
      
      // Normal sayı ise
      const result = parseFloat(normalizedValue);
      return isNaN(result) ? 0 : result;
    }
    
    // Diğer türler için varsayılan dönüşüm
    return 0;
  };

  // Veri düzeltme işlemi
  const repairData = async () => {
    if (!window.confirm('Bu işlem tüm müşteri bakiyelerini kontrol edecek ve yanlış aktarılmış sayısal değerleri düzeltecektir. Devam etmek istiyor musunuz?')) {
      return;
    }
    
    setRepairing(true);
    setResults(null);
    setDetailedResults([]);
    
    try {
      toast.info('Veri düzeltme işlemi başlatıldı. Bu işlem biraz zaman alabilir.');
      
      // Tüm bakiyeleri getir
      const { data: balances, error } = await supabase
        .from('customer_balances')
        .select('*,customers(name)');
        
      if (error) throw error;
      
      if (!balances || balances.length === 0) {
        toast.warning('Düzeltilecek bakiye bulunamadı');
        return;
      }
      
      console.log(`${balances.length} bakiye verisi yüklendi. Analiz ediliyor...`);
      
      const fixedBalances = [];
      const detailedChanges = [];
      
      // Düzeltilen toplam miktar (TL)
      let totalPastDueFixed = 0;
      let totalNotDueFixed = 0;
      let totalBalanceFixed = 0;
      
      // Her bakiyeyi kontrol et
      for (const balance of balances) {
        const original = {
          past_due_balance: balance.past_due_balance,
          not_due_balance: balance.not_due_balance,
          total_balance: balance.total_balance
        };
        
        // Türkçe formatında virgüllü değerler olabilir
        const fixed = {
          past_due_balance: correctNumericValue(balance.past_due_balance),
          not_due_balance: correctNumericValue(balance.not_due_balance),
          total_balance: correctNumericValue(balance.total_balance)
        };
        
        // İstatistikler için farkları hesapla
        const pastDueDiff = Math.abs(fixed.past_due_balance - original.past_due_balance);
        const notDueDiff = Math.abs(fixed.not_due_balance - original.not_due_balance);
        const totalDiff = Math.abs(fixed.total_balance - original.total_balance);
        
        // Değişiklik var mı?
        const hasChanges = 
          original.past_due_balance !== fixed.past_due_balance ||
          original.not_due_balance !== fixed.not_due_balance ||
          original.total_balance !== fixed.total_balance;
        
        // Değişiklik varsa veritabanını güncelle
        if (hasChanges) {
          // İstatistikler için toplamları güncelle
          totalPastDueFixed += pastDueDiff;
          totalNotDueFixed += notDueDiff;
          totalBalanceFixed += totalDiff;
          
          // Veritabanını güncelle
          const { error: updateError } = await supabase
            .from('customer_balances')
            .update({
              past_due_balance: fixed.past_due_balance,
              not_due_balance: fixed.not_due_balance,
              total_balance: fixed.total_balance,
              updated_at: new Date().toISOString()
            })
            .eq('id', balance.id);
            
          if (updateError) {
            console.error(`${balance.id} ID'li bakiye güncellenirken hata:`, updateError);
            continue;
          }
          
          fixedBalances.push({
            id: balance.id,
            customer_name: balance.customers?.name || '?',
            changes: {
              past_due_balance: {
                from: original.past_due_balance,
                to: fixed.past_due_balance
              },
              not_due_balance: {
                from: original.not_due_balance,
                to: fixed.not_due_balance
              },
              total_balance: {
                from: original.total_balance,
                to: fixed.total_balance
              }
            }
          });
          
          // Detaylı değişiklikleri kaydet
          detailedChanges.push({
            customer: balance.customers?.name || '?',
            id: balance.id,
            original,
            fixed,
            pastDueChange: original.past_due_balance !== fixed.past_due_balance,
            notDueChange: original.not_due_balance !== fixed.not_due_balance,
            totalChange: original.total_balance !== fixed.total_balance
          });
        }
      }
      
      // Sonuçları göster
      const summary = {
        totalBalances: balances.length,
        fixedBalances: fixedBalances.length,
        totalPastDueFixed: totalPastDueFixed.toFixed(2),
        totalNotDueFixed: totalNotDueFixed.toFixed(2),
        totalBalanceFixed: totalBalanceFixed.toFixed(2),
        details: fixedBalances
      };
      
      setResults(summary);
      setDetailedResults(detailedChanges);
      
      // Sonuçları consoleda göster
      console.log('Veri düzeltme sonuçları:', summary);
      console.log('Düzeltilen bakiyeler:', detailedChanges);
      
      toast.success(`${balances.length} bakiye kontrol edildi, ${fixedBalances.length} bakiye düzeltildi.`);
    } catch (err) {
      console.error("Veri düzeltme hatası:", err);
      toast.error(`Veri düzeltme işlemi başarısız: ${err.message}`);
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="card">
      <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
        Bakiye Verilerini Düzeltme Aracı
      </h2>
      
      <p style={{ marginBottom: '20px' }}>
        Bu araç, Excel'den aktarılan sayısal verilerdeki format sorunlarını düzeltir.
        Özellikle Türkçe formatındaki sayıların (örn: 16.612,48) yanlış yorumlanması sorununu çözer.
      </p>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={repairData} 
          className="btn btn-warning"
          disabled={repairing}
        >
          {repairing ? 'Düzeltiliyor...' : 'Bakiye Verilerini Düzelt'}
        </button>
      </div>
      
      {results && (
        <div>
          <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '4px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
              İşlem Sonuçları
            </h3>
            <p><strong>Toplam Bakiye:</strong> {results.totalBalances}</p>
            <p><strong>Düzeltilen Bakiye:</strong> {results.fixedBalances}</p>
            <p><strong>Düzeltilen Vadesi Geçmiş Bakiye Toplamı:</strong> {results.totalPastDueFixed} TL</p>
            <p><strong>Düzeltilen Vadesi Geçmemiş Bakiye Toplamı:</strong> {results.totalNotDueFixed} TL</p>
            <p><strong>Düzeltilen Toplam Bakiye:</strong> {results.totalBalanceFixed} TL</p>
          </div>
          
          {detailedResults.length > 0 && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
                Detaylı Değişiklikler
              </h3>
              
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Müşteri</th>
                      <th>Vadesi Geçmiş Bakiye</th>
                      <th>Vadesi Geçmemiş Bakiye</th>
                      <th>Toplam Bakiye</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailedResults.map((result, index) => (
                      <tr key={index}>
                        <td>{result.customer}</td>
                        <td style={{ backgroundColor: result.pastDueChange ? '#ffeeba' : 'inherit' }}>
                          {result.original.past_due_balance} → {result.fixed.past_due_balance}
                        </td>
                        <td style={{ backgroundColor: result.notDueChange ? '#ffeeba' : 'inherit' }}>
                          {result.original.not_due_balance} → {result.fixed.not_due_balance}
                        </td>
                        <td style={{ backgroundColor: result.totalChange ? '#ffeeba' : 'inherit' }}>
                          {result.original.total_balance} → {result.fixed.total_balance}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      
      <p style={{ marginTop: '20px', color: '#888', fontSize: '14px' }}>
        Not: Bu aracı kullandıktan sonra Dashboard ve Vade Takip sayfalarını yenilemeyi unutmayın.
      </p>
    </div>
  );
};

export default DataFixer;