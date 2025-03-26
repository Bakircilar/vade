import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';

const QuickNoteComponent = ({ customerId, customerName, refreshData }) => {
  const [note, setNote] = useState('');
  const [promiseDate, setPromiseDate] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle note submission
  const handleSubmitNote = async (e) => {
    e.preventDefault();
    
    if (!note.trim()) {
      toast.warning('Not içeriği boş olamaz');
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Get customer balance information
      const { data: balanceData, error: balanceError } = await supabase
        .from('customer_balances')
        .select('past_due_balance, not_due_balance, total_balance')
        .eq('customer_id', customerId)
        .single();
      
      // Debug için bakiye verisini loglayalım
      console.log('Müşteri ID:', customerId);
      console.log('Veritabanından alınan bakiye bilgisi:', balanceData);
      
      if (balanceError) {
        console.error("Bakiye bilgisi alınamadı:", balanceError);
        // Bakiye bilgisi alınamazsa ayrı bir sorgu deneyelim - customer_id ile değil müşteri koduyla deneme
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('code')
          .eq('id', customerId)
          .single();
          
        if (!customerError && customerData) {
          console.log("Müşteri kodu:", customerData.code);
          
          // Alternatif olarak müşteri koduyla sorgulayalım
          const { data: altBalanceData, error: altBalanceError } = await supabase
            .from('customer_balances')
            .select('past_due_balance, not_due_balance, total_balance')
            .eq('customer_code', customerData.code) // Eğer ilişki customer_code üzerinden kurulmuşsa
            .single();
            
          if (!altBalanceError && altBalanceData) {
            console.log("Alternatif yöntemle alınan bakiye bilgisi:", altBalanceData);
            // Alternatif yöntemle alınan veriyi kullan
            balanceData = altBalanceData;
          }
        }
      }
      
      // Bakiye değerlerini hazırla - çok katı kontroller yapalım
      let pastDueBalance = null;
      let notDueBalance = null;
      let totalBalance = null;
      
      if (balanceData) {
        // past_due_balance kontrolü
        if (balanceData.past_due_balance !== null && balanceData.past_due_balance !== undefined) {
          const parsedValue = parseFloat(balanceData.past_due_balance);
          if (!isNaN(parsedValue)) {
            pastDueBalance = parsedValue;
          }
        }
        
        // not_due_balance kontrolü
        if (balanceData.not_due_balance !== null && balanceData.not_due_balance !== undefined) {
          const parsedValue = parseFloat(balanceData.not_due_balance);
          if (!isNaN(parsedValue)) {
            notDueBalance = parsedValue;
          }
        }
        
        // total_balance kontrolü
        if (balanceData.total_balance !== null && balanceData.total_balance !== undefined) {
          const parsedValue = parseFloat(balanceData.total_balance);
          if (!isNaN(parsedValue)) {
            totalBalance = parsedValue;
          }
        }
      }
      
      // Eğer total_balance yoksa ve diğer iki değer varsa toplam hesaplayalım
      if (totalBalance === null && pastDueBalance !== null && notDueBalance !== null) {
        totalBalance = pastDueBalance + notDueBalance;
      }
      
      // Debug için hesaplanan değerleri kontrol edelim
      console.log("Hesaplanan bakiye değerleri:", {
        pastDueBalance,
        notDueBalance,
        totalBalance
      });
      
      // Yeni notu oluştur
      const newNoteData = {
        customer_id: customerId,
        note_content: note.trim(),
        promise_date: promiseDate || null,
        balance_at_time: totalBalance,
        past_due_balance: pastDueBalance,
        not_due_balance: notDueBalance
      };
      
      console.log("Kaydedilecek not verisi:", newNoteData);
      
      // Notu veritabanına ekle
      const { error } = await supabase
        .from('customer_notes')
        .insert([newNoteData]);
      
      if (error) throw error;
      
      toast.success('Not başarıyla eklendi');
      setNote('');
      setPromiseDate('');
      setIsExpanded(false);
      
      // Refresh parent component data if callback provided
      if (typeof refreshData === 'function') {
        refreshData();
      }
    } catch (error) {
      console.error('Not ekleme hatası:', error);
      toast.error('Not eklenirken bir hata oluştu');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="quick-note-component" style={{ marginTop: '10px' }}>
      {!isExpanded ? (
        <button
          onClick={() => setIsExpanded(true)}
          className="btn btn-primary"
          style={{ padding: '4px 8px', fontSize: '12px' }}
        >
          Not Ekle
        </button>
      ) : (
        <div style={{ 
          border: '1px solid #ddd', 
          borderRadius: '4px', 
          padding: '10px',
          backgroundColor: '#f9f9f9'
        }}>
          <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>
            {customerName} için hızlı not ekle:
          </div>
          
          <form onSubmit={handleSubmitNote}>
            <div style={{ marginBottom: '8px' }}>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Not içeriği..."
                style={{ 
                  width: '100%', 
                  padding: '6px', 
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  minHeight: '60px'
                }}
              ></textarea>
            </div>
            
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '3px' }}>
                Söz Verilen Ödeme Tarihi (Opsiyonel):
              </label>
              <input
                type="date"
                value={promiseDate}
                onChange={(e) => setPromiseDate(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '6px', 
                  borderRadius: '4px',
                  border: '1px solid #ddd'
                }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="submit"
                disabled={isSubmitting || !note.trim()}
                className="btn btn-success"
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                {isSubmitting ? 'Ekleniyor...' : 'Kaydet'}
              </button>
              
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="btn"
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default QuickNoteComponent;