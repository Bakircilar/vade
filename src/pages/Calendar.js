// src/pages/Calendar.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import CalendarView from '../components/CalendarView';
import { toast } from 'react-toastify'; // Toast import'u eklendi
import { format, startOfMonth, endOfMonth, addMonths, parseISO, isSameDay } from 'date-fns';
import { tr } from 'date-fns/locale';

const Calendar = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [customerMap, setCustomerMap] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const [dayEvents, setDayEvents] = useState([]);

  // Ay değiştirme
  const handlePrevMonth = () => {
    setCurrentMonth(prevMonth => addMonths(prevMonth, -1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prevMonth => addMonths(prevMonth, 1));
  };

  // Etkinlikleri getir
  useEffect(() => {
    fetchEvents();
  }, [currentMonth]);

  // Bir güne tıklandığında
  const handleDayClick = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    // O güne ait etkinlikleri filtrele
    const filteredEvents = events.filter(event => {
      try {
        const eventDate = parseISO(event.date);
        return isSameDay(eventDate, date);
      } catch (error) {
        return false;
      }
    });
    
    setSelectedDate(date);
    setDayEvents(filteredEvents);
  };

  // Modal kapatma
  const handleCloseModal = () => {
    setSelectedDate(null);
    setDayEvents([]);
  };

  // Kullanıcı hatırlatıcılarını getir
  const fetchEvents = async () => {
    setLoading(true);
    try {
      // Güncel kullanıcıyı al
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('Kullanıcı bulunamadı');
        setLoading(false);
        return;
      }

      // Ayın başlangıç ve bitiş tarihlerini hesapla
      const startDate = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

      // Hatırlatıcıları getir
      const { data: reminderNotes, error: reminderError } = await supabase
        .from('customer_notes')
        .select('id, customer_id, note_content, reminder_date, reminder_note, reminder_completed, promise_date, created_at')
        .eq('user_id', user.id)
        .or(`reminder_date.gte.${startDate},promise_date.gte.${startDate}`)
        .or(`reminder_date.lte.${endDate},promise_date.lte.${endDate}`)
        .order('reminder_date', { ascending: true });

      if (reminderError) {
        console.error('Hatırlatıcılar getirilemedi:', reminderError);
        setLoading(false);
        return;
      }

      // Müşteri ID'lerini topla
      const customerIds = reminderNotes
        .filter(note => note.customer_id)
        .map(note => note.customer_id);

      // Benzersiz ID'leri al
      const uniqueCustomerIds = [...new Set(customerIds)];

      // Müşteri bilgilerini getir
      let newCustomerMap = {};
      
      if (uniqueCustomerIds.length > 0) {
        const { data: customers, error: customerError } = await supabase
          .from('customers')
          .select('id, name, code')
          .in('id', uniqueCustomerIds);

        if (!customerError && customers) {
          // Müşteri ID -> İsim eşleştirme tablosu oluştur
          customers.forEach(customer => {
            newCustomerMap[customer.id] = {
              name: customer.name || 'İsimsiz Müşteri',
              code: customer.code || ''
            };
          });
        }
      }
      
      // Müşteri haritasını ayarla
      setCustomerMap(newCustomerMap);
      
      // Etkinlik formatına dönüştür
      const formattedEvents = reminderNotes.map(note => {
        // Etkinlik tarihi olarak reminder_date veya promise_date kullan
        const eventDate = note.reminder_date || note.promise_date;
        if (!eventDate) return null;
        
        // Müşteri bilgilerini al
        const customerInfo = newCustomerMap[note.customer_id] || { name: 'Müşteri', code: '' };
        const customerName = customerInfo.name;
        const customerCode = customerInfo.code;
        
        return {
          id: note.id,
          title: note.reminder_note || 
                (note.reminder_date ? 'Hatırlatıcı' : 'Ödeme Sözü'),
          date: eventDate,
          type: note.reminder_date ? 'reminder' : 'promise',
          completed: note.reminder_completed || false,
          customerId: note.customer_id,
          customerName: customerName,
          customerCode: customerCode,
          note: note.note_content,
          created_at: note.created_at
        };
      }).filter(Boolean);

      setEvents(formattedEvents);
    } catch (error) {
      console.error('Takvim etkinlikleri yüklenirken hata:', error);
    } finally {
      setLoading(false);
    }
  };

  // Etkinliği tamamlandı olarak işaretle
  const markEventAsCompleted = async (eventId) => {
    try {
      const { error } = await supabase
        .from('customer_notes')
        .update({ reminder_completed: true })
        .eq('id', eventId);
        
      if (error) throw error;
      
      // Etkinlikleri güncelle
      setEvents(events.map(event => 
        event.id === eventId 
          ? { ...event, completed: true } 
          : event
      ));
      
      // Seçili gün etkinliklerini de güncelle
      if (selectedDate) {
        setDayEvents(dayEvents.map(event =>
          event.id === eventId
            ? { ...event, completed: true }
            : event
        ));
      }
      
      toast.success('Hatırlatıcı tamamlandı olarak işaretlendi');
    } catch (error) {
      console.error('Etkinlik güncelleme hatası:', error);
      toast.error('Hatırlatıcı güncellenirken bir hata oluştu');
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

  return (
    <div className="calendar-page">
      <h1>Hatırlatıcı Takvimi</h1>
      
      <div className="calendar-controls" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '20px' 
      }}>
        <button onClick={handlePrevMonth} className="btn">Önceki Ay</button>
        <h2 style={{ margin: 0, textTransform: 'capitalize' }}>
          {format(currentMonth, 'MMMM yyyy', { locale: tr })}
        </h2>
        <button onClick={handleNextMonth} className="btn">Sonraki Ay</button>
      </div>
      
      {loading ? (
        <div className="loading">Yükleniyor...</div>
      ) : (
        <CalendarView 
          events={events} 
          currentMonth={currentMonth}
          onMarkCompleted={markEventAsCompleted}
          customerMap={customerMap}
          onDayClick={handleDayClick}
        />
      )}
      
      {/* Gün Detayları Modal */}
      {selectedDate && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>
                {format(selectedDate, 'd MMMM yyyy', { locale: tr })} Tarihi Hatırlatıcıları
              </h3>
              <button
                onClick={handleCloseModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer'
                }}
              >
                &times;
              </button>
            </div>
            
            {dayEvents.length === 0 ? (
              <p>Bu tarih için hatırlatıcı bulunamadı.</p>
            ) : (
              <div>
                {dayEvents.map(event => (
                  <div 
                    key={event.id}
                    style={{
                      marginBottom: '15px',
                      padding: '15px',
                      backgroundColor: event.type === 'reminder' ? '#e3f2fd' : '#fff3cd',
                      borderRadius: '4px',
                      border: '1px solid #eee',
                      opacity: event.completed ? 0.7 : 1
                    }}
                  >
                    <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <h4 style={{ margin: '0 0 5px 0' }}>
                          {event.title} {event.completed && '(Tamamlandı)'}
                        </h4>
                        <div style={{ fontWeight: 'bold' }}>
                          {event.customerCode && `[${event.customerCode}] `}
                          {event.customerName || 'Müşteri'}
                        </div>
                      </div>
                      
                      {event.type === 'reminder' && !event.completed && (
                        <button
                          onClick={() => markEventAsCompleted(event.id)}
                          className="btn btn-success"
                          style={{ padding: '4px 8px', fontSize: '12px', height: 'fit-content' }}
                        >
                          Tamamla
                        </button>
                      )}
                    </div>
                    
                    <div style={{ marginTop: '10px', fontSize: '14px' }}>
                      <strong>Not:</strong>
                      <p style={{ margin: '5px 0', whiteSpace: 'pre-wrap' }}>{event.note}</p>
                    </div>
                    
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                      Oluşturulma Tarihi: {formatDate(event.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;