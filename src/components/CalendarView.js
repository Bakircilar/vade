// src/components/CalendarView.js
import React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameMonth, isWeekend, parseISO, isSameDay } from 'date-fns';
import { tr } from 'date-fns/locale';

const CalendarView = ({ events, currentMonth, onMarkCompleted, customerMap, onDayClick }) => {
  // Takvim dağılımını oluştur
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  // Haftanın günleri
  const weekDays = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  
  // Tarihe göre etkinlikleri grupla
  const eventsByDate = days.reduce((acc, day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    acc[dateStr] = events.filter(event => {
      try {
        const eventDate = parseISO(event.date);
        return isSameDay(eventDate, day);
      } catch (error) {
        return false;
      }
    });
    return acc;
  }, {});
  
  // Etkinliğe tıklama
  const handleEventClick = (e, event) => {
    e.stopPropagation(); // Günün tıklama olayını engelle
    
    if (event.type === 'reminder' && !event.completed) {
      if (window.confirm('Bu hatırlatıcıyı tamamlandı olarak işaretlemek istiyor musunuz?')) {
        onMarkCompleted(event.id);
      }
    }
  };
  
  // Güne tıklama
  const handleDayClick = (day) => {
    if (onDayClick) {
      onDayClick(day);
    }
  };
  
  return (
    <div style={{
      border: '1px solid #ddd',
      borderRadius: '4px',
      overflow: 'hidden'
    }}>
      {/* Haftanın günleri */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        backgroundColor: '#f8f9fa',
        borderBottom: '1px solid #ddd'
      }}>
        {weekDays.map(day => (
          <div 
            key={day} 
            style={{
              textAlign: 'center',
              padding: '10px',
              fontWeight: 'bold'
            }}
          >
            {day}
          </div>
        ))}
      </div>
      
      {/* Takvim Günleri */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        minHeight: '600px'
      }}>
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDate[dateStr] || [];
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isWeekendDay = isWeekend(day);
          
          return (
            <div 
              key={dateStr} 
              style={{
                border: '1px solid #eee',
                padding: '5px',
                minHeight: '100px',
                position: 'relative',
                backgroundColor: isToday(day) 
                  ? '#e8f5e9' 
                  : isWeekendDay 
                    ? '#f8f8f8' 
                    : isCurrentMonth 
                      ? 'white' 
                      : '#f9f9f9',
                color: isCurrentMonth ? 'inherit' : '#ccc',
                cursor: 'pointer'
              }}
              onClick={() => handleDayClick(day)}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                {format(day, 'd')}
              </div>
              
              {dayEvents.map(event => {
                // Müşteri bilgileri
                const customerInfo = event.customerName ? 
                  `${event.customerCode ? `[${event.customerCode}] ` : ''}${event.customerName}` : 
                  'Müşteri';
                  
                return (
                  <div 
                    key={`${event.id}-${event.type}`}
                    onClick={(e) => handleEventClick(e, event)}
                    style={{
                      backgroundColor: event.type === 'reminder' 
                        ? '#e3f2fd' 
                        : '#fff3cd',
                      padding: '5px',
                      borderRadius: '4px',
                      margin: '2px 0',
                      cursor: 'pointer',
                      textDecoration: event.completed ? 'line-through' : 'none',
                      opacity: event.completed ? 0.7 : 1,
                      fontSize: '12px',
                      overflow: 'hidden'
                    }}
                  >
                    <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {event.title}
                    </div>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {customerInfo}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarView;