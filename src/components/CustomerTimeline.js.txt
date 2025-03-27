// src/components/CustomerTimeline.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { format, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'react-toastify';

const CustomerTimeline = ({ customerId }) => {
  const [timelineItems, setTimelineItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (customerId) {
      fetchTimelineData();
    }
  }, [customerId]);

  // Zaman çizelgesi verilerini getir
  const fetchTimelineData = async () => {
    setLoading(true);
    try {
      // Notlar, vadeler ve bakiye geçmişini getir
      
      // 1. Müşteri notlarını getir
      const { data: notesData, error: notesError } = await supabase
        .from('customer_notes')
        .select(`
          *,
          profiles (full_name)
        `)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
        
      if (notesError) throw notesError;
      
      // 2. Müşteri bakiyelerini getir
      const { data: balance, error: balanceError } = await supabase
        .from('customer_balances')
        .select('*')
        .eq('customer_id', customerId)
        .single();
        
      if (balanceError && balanceError.code !== 'PGRST116') {
        console.error('Bakiye getirme hatası:', balanceError);
      }
      
      // Zaman çizelgesi öğelerini oluştur
      const timelineData = [];
      
      // Notları zaman çizelgesine ekle
      if (notesData && notesData.length > 0) {
        notesData.forEach(note => {
          timelineData.push({
            id: `note_${note.id}`,
            type: 'note',
            date: note.created_at,
            content: note.note_content,
            user: note.profiles?.full_name || 'Kullanıcı',
            promise_date: note.promise_date,
            tags: note.tags || [],
            reminder_date: note.reminder_date,
            reminder_completed: note.reminder_completed
          });
        });
      }
      
      // Vadesi geçmiş bakiyeyi zaman çizelgesine ekle
      if (balance && balance.past_due_date) {
        timelineData.push({
          id: `past_due_${balance.id}`,
          type: 'past_due',
          date: balance.past_due_date,
          amount: parseFloat(balance.past_due_balance || 0),
          status: 'overdue'
        });
      }
      
      // Vadesi geçmemiş bakiyeyi zaman çizelgesine ekle
      if (balance && balance.not_due_date) {
        timelineData.push({
          id: `not_due_${balance.id}`,
          type: 'not_due',
          date: balance.not_due_date,
          amount: parseFloat(balance.not_due_balance || 0),
          status: new Date(balance.not_due_date) > new Date() ? 'upcoming' : 'overdue'
        });
      }
      
      // Tarihe göre sırala (en yeni en üstte)
      timelineData.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      setTimelineItems(timelineData);
    } catch (error) {
      console.error('Zaman çizelgesi yükleme hatası:', error);
      toast.error('Zaman çizelgesi yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };
  
  // Tarih formatla
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd MMM yyyy', { locale: tr });
    } catch (error) {
      return dateString;
    }
  };
  
  // Gün farkını hesapla
  const getDayDifference = (dateString) => {
    if (!dateString) return null;
    
    try {
      const date = new Date(dateString);
      const today = new Date();
      
      // Saatleri sıfırla
      date.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      
      return differenceInDays(date, today);
    } catch (error) {
      console.error('Gün farkı hesaplama hatası:', error);
      return null;
    }
  };
  
  // Gün farkını formatla
  const formatDayDifference = (dayDiff) => {
    if (dayDiff === null) return '';
    
    if (dayDiff === 0) return '(Bugün)';
    if (dayDiff === 1) return '(Yarın)';
    if (dayDiff === -1) return '(Dün)';
    
    return dayDiff > 0
      ? `(${dayDiff} gün sonra)`
      : `(${Math.abs(dayDiff)} gün önce)`;
  };
  
  // Para birimi formatla
  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '-';
    try {
      return new Intl.NumberFormat('tr-TR', { 
        style: 'currency', 
        currency: 'TRY'
      }).format(amount);
    } catch (error) {
      return amount.toString();
    }
  };
  
  // Not için grafik öğesi
  const NoteItem = ({ item }) => {
    const dayDiff = item.promise_date ? getDayDifference(item.promise_date) : null;
    const dayText = formatDayDifference(dayDiff);
    
    return (
      <div className="timeline-item-content">
        <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
          {item.user} tarafından not eklendi
        </div>
        <div style={{ whiteSpace: 'pre-wrap', marginBottom: '5px' }}>
          {item.content}
        </div>
        
        {/* Etiketler */}
        {item.tags && item.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '5px' }}>
            {item.tags.map((tag, index) => (
              <span 
                key={index} 
                style={{ 
                  backgroundColor: '#f0f0f0', 
                  padding: '2px 8px', 
                  borderRadius: '12px', 
                  fontSize: '12px' 
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        
        {/* Söz verilen ödeme tarihi */}
        {item.promise_date && (
          <div style={{ 
            marginTop: '5px',
            padding: '5px',
            backgroundColor: dayDiff < 0 ? '#ffecb3' : '#e3f2fd',
            borderRadius: '4px',
            fontSize: '13px'
          }}>
            <strong>Söz Verilen Ödeme:</strong> {formatDate(item.promise_date)} {dayText}
          </div>
        )}
        
        {/* Hatırlatıcı */}
        {item.reminder_date && (
          <div style={{ 
            marginTop: '5px',
            padding: '5px',
            backgroundColor: item.reminder_completed ? '#e8f5e9' : '#e3f2fd',
            borderRadius: '4px',
            fontSize: '13px'
          }}>
            <strong>{item.reminder_completed ? '✓ Tamamlandı:' : 'Hatırlatıcı:'}</strong> {formatDate(item.reminder_date)}
          </div>
        )}
      </div>
    );
  };
  
  // Vade öğesi
  const DueItem = ({ item }) => {
    const isOverdue = item.status === 'overdue';
    const dayDiff = getDayDifference(item.date);
    const dayText = formatDayDifference(dayDiff);
    
    return (
      <div className="timeline-item-content">
        <div style={{ fontWeight: 'bold', marginBottom: '5px', color: isOverdue ? '#e74c3c' : '#3498db' }}>
          {isOverdue ? 'Vadesi Geçmiş Bakiye' : 'Yaklaşan Vade'}
        </div>
        <div style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '5px' }}>
          {formatCurrency(item.amount)}
        </div>
        <div style={{ 
          padding: '5px',
          backgroundColor: isOverdue ? '#ffecb3' : '#e3f2fd',
          borderRadius: '4px',
          fontSize: '13px'
        }}>
          <strong>Vade Tarihi:</strong> {formatDate(item.date)} {dayText}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        Zaman çizelgesi yükleniyor...
      </div>
    );
  }

  return (
    <div className="customer-timeline">
      <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
        Müşteri Zaman Çizelgesi
      </h2>
      
      {timelineItems.length > 0 ? (
        <div className="timeline">
          {timelineItems.map((item, index) => (
            <div 
              key={item.id} 
              className="timeline-item"
              style={{ 
                display: 'flex',
                marginBottom: '20px',
                position: 'relative',
                paddingLeft: '30px'
              }}
            >
              {/* Tarih göstergesi */}
              <div style={{ 
                position: 'absolute',
                left: 0,
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor: item.type === 'note' ? '#3498db' : 
                                item.status === 'overdue' ? '#e74c3c' : '#2ecc71',
                zIndex: 1
              }}></div>
              
              {/* Dikey çizgi */}
              {index < timelineItems.length - 1 && (
                <div style={{ 
                  position: 'absolute',
                  left: '10px',
                  top: '20px',
                  width: '2px',
                  height: 'calc(100% + 10px)',
                  backgroundColor: '#eee',
                  zIndex: 0
                }}></div>
              )}
              
              <div style={{ 
                backgroundColor: 'white',
                padding: '15px',
                borderRadius: '4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                width: '100%'
              }}>
                {/* Tarih başlığı */}
                <div style={{ 
                  marginBottom: '10px',
                  color: '#888',
                  fontSize: '14px'
                }}>
                  {formatDate(item.date)}
                </div>
                
                {/* İçerik tipine göre render */}
                {item.type === 'note' ? (
                  <NoteItem item={item} />
                ) : (
                  <DueItem item={item} />
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
          Bu müşteri için zaman çizelgesi öğesi bulunmuyor
        </p>
      )}
    </div>
  );
};

export default CustomerTimeline;