// src/components/NotificationCenter.js
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'react-toastify';
import { supabase } from '../services/supabase';
import { 
  getUserNotifications, 
  markNotificationAsRead,
  markAllNotificationsAsRead
} from '../services/notificationService';

const NotificationCenter = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const notificationRef = useRef(null);
  
  useEffect(() => {
    loadNotifications();
    
    // Düzenli aralıklarla bildirimleri kontrol et (5 dakikada bir)
    const interval = setInterval(() => {
      loadNotifications();
    }, 5 * 60 * 1000);
    
    // Dropdown dışına tıklandığında kapat
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Bildirimleri getir
  const loadNotifications = async () => {
    try {
      setLoading(true);
      
      // Kullanıcı ID'sini al
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;
      
      // Bildirimleri getir
      const notifications = await getUserNotifications(user.id);
      
      setNotifications(notifications);
      setUnreadCount(notifications.length);
    } catch (error) {
      console.error('Bildirim yükleme hatası:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Bildirimi okundu olarak işaretle
  const handleMarkAsRead = async (notificationId) => {
    try {
      await markNotificationAsRead(notificationId);
      
      // Bildirimleri güncelle
      setNotifications(notifications.map(notification => 
        notification.id === notificationId 
          ? { ...notification, is_read: true } 
          : notification
      ));
      
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Bildirim güncelleme hatası:', error);
      toast.error('Bildirim güncellenirken bir hata oluştu');
    }
  };
  
  // Tüm bildirimleri okundu olarak işaretle
  const handleMarkAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;
      
      await markAllNotificationsAsRead(user.id);
      
      // Bildirimleri güncelle
      setNotifications(notifications.map(notification => ({ ...notification, is_read: true })));
      setUnreadCount(0);
      
      toast.success('Tüm bildirimler okundu olarak işaretlendi');
    } catch (error) {
      console.error('Bildirim güncelleme hatası:', error);
      toast.error('Bildirimler güncellenirken bir hata oluştu');
    }
  };
  
  // Bildirim ikonu - zil ikonu
  const NotificationIcon = ({ count }) => (
    <div 
      className="notification-icon" 
      style={{ 
        position: 'relative', 
        cursor: 'pointer',
        width: '24px',
        height: '24px'
      }}
      onClick={() => setIsOpen(!isOpen)}
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
      </svg>
      
      {count > 0 && (
        <div 
          style={{ 
            position: 'absolute', 
            top: '-5px', 
            right: '-5px', 
            backgroundColor: '#e74c3c', 
            color: 'white', 
            borderRadius: '50%', 
            width: '16px', 
            height: '16px', 
            fontSize: '10px', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center' 
          }}
        >
          {count > 9 ? '9+' : count}
        </div>
      )}
    </div>
  );
  
  // Tarih formatla
  const formatDate = (dateString) => {
    try {
      return format(new Date(dateString), 'dd MMM, HH:mm', { locale: tr });
    } catch (error) {
      return dateString;
    }
  };
  
  // Bildirimin ikonunu getir
  const getNotificationIcon = (type) => {
    switch (type) {
      case 'upcoming_payment':
        return '📅'; // Takvim ikonu
      case 'overdue_payment':
        return '⚠️'; // Uyarı ikonu
      case 'note_reminder':
        return '📝'; // Not ikonu
      case 'system_notification':
        return '🔔'; // Zil ikonu
      default:
        return '📌'; // Varsayılan ikon
    }
  };

  return (
    <div className="notification-center" ref={notificationRef}>
      <NotificationIcon count={unreadCount} />
      
      {isOpen && (
        <div 
          className="notification-dropdown" 
          style={{ 
            position: 'absolute', 
            top: '40px', 
            right: '0', 
            width: '350px', 
            maxHeight: '400px', 
            backgroundColor: 'white', 
            border: '1px solid #ddd', 
            borderRadius: '4px', 
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)', 
            zIndex: 1000,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div 
            className="notification-header" 
            style={{ 
              padding: '12px', 
              borderBottom: '1px solid #eee', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center'
            }}
          >
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
              Bildirimler {unreadCount > 0 && `(${unreadCount})`}
            </h3>
            
            {unreadCount > 0 && (
              <button 
                onClick={handleMarkAllAsRead}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#3498db', 
                  cursor: 'pointer', 
                  fontSize: '12px' 
                }}
              >
                Tümünü Okundu İşaretle
              </button>
            )}
          </div>
          
          <div 
            className="notification-list" 
            style={{ 
              overflow: 'auto',
              maxHeight: '350px',
              padding: '0',
              margin: '0',
              listStyle: 'none'
            }}
          >
            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center' }}>Yükleniyor...</div>
            ) : notifications.length > 0 ? (
              <ul style={{ padding: 0, margin: 0, listStyle: 'none' }}>
                {notifications.map(notification => (
                  <li 
                    key={notification.id} 
                    style={{ 
                      padding: '12px 16px', 
                      borderBottom: '1px solid #eee',
                      backgroundColor: notification.is_read ? 'white' : '#f0f8ff',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onClick={() => !notification.is_read && handleMarkAsRead(notification.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ fontSize: '20px' }}>
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: notification.is_read ? 'normal' : 'bold' }}>
                          {notification.title}
                        </div>
                        <div style={{ fontSize: '14px', color: '#666', marginTop: '3px' }}>
                          {notification.message}
                        </div>
                        {notification.customers && (
                          <div style={{ fontSize: '12px', color: '#666', marginTop: '3px' }}>
                            Müşteri: {notification.customers.name}
                          </div>
                        )}
                        <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
                          {formatDate(notification.created_at)}
                        </div>
                      </div>
                    </div>
                    
                    {notification.link && (
                      <Link 
                        to={notification.link}
                        onClick={(e) => e.stopPropagation()}
                        style={{ 
                          display: 'block', 
                          fontSize: '12px', 
                          color: '#3498db', 
                          marginTop: '5px',
                          textAlign: 'right'
                        }}
                      >
                        Detayları Görüntüle →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                Bildirim bulunmuyor
              </div>
            )}
          </div>
          
          <div 
            className="notification-footer" 
            style={{ 
              padding: '10px', 
              borderTop: '1px solid #eee',
              textAlign: 'center'
            }}
          >
            <Link 
              to="/notifications"
              style={{ fontSize: '14px', color: '#3498db', textDecoration: 'none' }}
              onClick={() => setIsOpen(false)}
            >
              Tüm Bildirimleri Görüntüle
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;