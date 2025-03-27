// src/components/LoginNotifications.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { supabase } from '../services/supabase';
import { useUserAccess } from '../helpers/userAccess';

const LoginNotifications = () => {
  const [overduePayments, setOverduePayments] = useState([]);
  const [upcomingPayments, setUpcomingPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(true);
  
  // User access control
  const { isAdmin, isMuhasebe, filterCustomersByAccess } = useUserAccess();

  useEffect(() => {
    fetchLoginAlerts();
  }, []);

  // Giriş uyarılarını getir
  const fetchLoginAlerts = async () => {
    try {
      setLoading(true);
      
      // Kullanıcı ID'sini al
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;
      
      // Bildirim tercihlerini kontrol et
      const { data: preferences, error: prefError } = await supabase
        .from('notification_preferences')
        .select('show_on_login')
        .eq('user_id', user.id)
        .single();
        
      // Kullanıcı giriş bildirimlerini kapatmışsa gösterme
      if (preferences && preferences.show_on_login === false) {
        setShowNotifications(false);
        return;
      }
      
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
      
      const { data: balances, error } = await query;
      if (error) throw error;
      
      // Bugünün tarihi
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const overdue = [];
      const upcoming = [];
      
      if (balances && balances.length > 0) {
        balances.forEach(balance => {
          if (!balance.customers) return;
          
          // Vadesi geçmiş bakiye
          if (balance.past_due_balance && parseFloat(balance.past_due_balance) > 100) {
            overdue.push({
              id: balance.id,
              customer_id: balance.customer_id,
              name: balance.customers.name,
              code: balance.customers.code,
              amount: parseFloat(balance.past_due_balance),
              date: balance.past_due_date || null,
              days_overdue: balance.past_due_date ? differenceInDays(today, new Date(balance.past_due_date)) : null
            });
          }
          
          // Yaklaşan vadeler
          if (balance.not_due_balance && balance.not_due_date && parseFloat(balance.not_due_balance) > 100) {
            try {
              const dueDate = new Date(balance.not_due_date);
              dueDate.setHours(0, 0, 0, 0);
              
              // 7 gün içinde vadesi dolacak mı?
              const diffDays = differenceInDays(dueDate, today);
              
              if (diffDays >= 0 && diffDays <= 7) {
                upcoming.push({
                  id: balance.id,
                  customer_id: balance.customer_id,
                  name: balance.customers.name,
                  code: balance.customers.code,
                  amount: parseFloat(balance.not_due_balance),
                  date: balance.not_due_date,
                  days_left: diffDays
                });
              }
            } catch (err) {
              console.error('Tarih işleme hatası:', err);
            }
          }
        });
      }
      
      // Vadesi en çok geçenler önce
      overdue.sort((a, b) => (b.days_overdue || 0) - (a.days_overdue || 0));
      
      // Vadesi en yakın olanlar önce
      upcoming.sort((a, b) => (a.days_left || 0) - (b.days_left || 0));
      
      // En fazla 5 tane göster
      setOverduePayments(overdue.slice(0, 5));
      setUpcomingPayments(upcoming.slice(0, 5));
    } catch (error) {
      console.error('Giriş uyarıları yükleme hatası:', error);
    } finally {
      setLoading(false);
    }
  };

  // Para birimi formatla
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', { 
      style: 'currency', 
      currency: 'TRY' 
    }).format(amount);
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
  
  // Bildirimleri kapat
  const handleClose = () => {
    setShowNotifications(false);
  };

  // Hiç bildirim yoksa veya kapatılmışsa gösterme
  if (!showNotifications || (overduePayments.length === 0 && upcomingPayments.length === 0 && !loading)) {
    return null;
  }

  return (
    <div 
      className="login-notifications" 
      style={{ 
        margin: '0 0 20px 0',
        backgroundColor: '#f8f9fa',
        border: '1px solid #e9ecef',
        borderRadius: '8px',
        padding: '16px',
        position: 'relative'
      }}
    >
      <button 
        onClick={handleClose}
        style={{ 
          position: 'absolute', 
          top: '10px', 
          right: '10px',
          background: 'none',
          border: 'none',
          fontSize: '18px',
          cursor: 'pointer',
          color: '#aaa'
        }}
      >
        ×
      </button>
      
      <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px' }}>
        Vade Takip Bildirimleri
      </h2>
      
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px' }}>Bildirimler yükleniyor...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          {/* Vadesi geçen ödemeler */}
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#e74c3c', marginBottom: '10px' }}>
              Vadesi Geçen Ödemeler {overduePayments.length > 0 && `(${overduePayments.length})`}
            </h3>
            
            {overduePayments.length > 0 ? (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {overduePayments.map((payment) => (
                  <li 
                    key={payment.id} 
                    style={{ 
                      padding: '10px', 
                      marginBottom: '8px', 
                      backgroundColor: 'white', 
                      borderLeft: '3px solid #e74c3c',
                      borderRadius: '4px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 'bold' }}>{payment.name}</div>
                      <div style={{ color: '#e74c3c', fontWeight: 'bold' }}>
                        {formatCurrency(payment.amount)}
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontSize: '14px', color: '#666' }}>
                      <div>{payment.code}</div>
                      <div>
                        Vade: {formatDate(payment.date)}
                        {payment.days_overdue !== null && (
                          <span style={{ marginLeft: '5px', color: '#e74c3c' }}>
                            ({payment.days_overdue} gün gecikmiş)
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div style={{ marginTop: '8px', textAlign: 'right' }}>
                      <Link 
                        to={`/customers/${payment.customer_id}`}
                        style={{ 
                          fontSize: '12px', 
                          color: '#3498db', 
                          textDecoration: 'none'
                        }}
                      >
                        Detayları Görüntüle →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: '#888', textAlign: 'center' }}>
                Vadesi geçen ödeme bulunmuyor
              </p>
            )}
            
            {overduePayments.length > 0 && (
              <div style={{ marginTop: '10px', textAlign: 'center' }}>
                <Link 
                  to="/payments?filter=overdue"
                  style={{ 
                    color: '#e74c3c', 
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                >
                  Tüm Vadesi Geçenleri Görüntüle →
                </Link>
              </div>
            )}
          </div>
          
          {/* Yaklaşan ödemeler */}
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#3498db', marginBottom: '10px' }}>
              Yaklaşan Ödemeler {upcomingPayments.length > 0 && `(${upcomingPayments.length})`}
            </h3>
            
            {upcomingPayments.length > 0 ? (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {upcomingPayments.map((payment) => (
                  <li 
                    key={payment.id} 
                    style={{ 
                      padding: '10px', 
                      marginBottom: '8px', 
                      backgroundColor: 'white', 
                      borderLeft: '3px solid #3498db',
                      borderRadius: '4px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 'bold' }}>{payment.name}</div>
                      <div style={{ color: '#3498db', fontWeight: 'bold' }}>
                        {formatCurrency(payment.amount)}
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontSize: '14px', color: '#666' }}>
                      <div>{payment.code}</div>
                      <div>
                        Vade: {formatDate(payment.date)}
                        {payment.days_left !== null && (
                          <span style={{ marginLeft: '5px', color: payment.days_left <= 2 ? '#e74c3c' : '#3498db' }}>
                            ({payment.days_left === 0 ? 'Bugün' : 
                              payment.days_left === 1 ? 'Yarın' : 
                              `${payment.days_left} gün kaldı`})
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div style={{ marginTop: '8px', textAlign: 'right' }}>
                      <Link 
                        to={`/customers/${payment.customer_id}`}
                        style={{ 
                          fontSize: '12px', 
                          color: '#3498db', 
                          textDecoration: 'none'
                        }}
                      >
                        Detayları Görüntüle →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: '#888', textAlign: 'center' }}>
                Yaklaşan ödeme bulunmuyor
              </p>
            )}
            
            {upcomingPayments.length > 0 && (
              <div style={{ marginTop: '10px', textAlign: 'center' }}>
                <Link 
                  to="/payments?filter=upcoming"
                  style={{ 
                    color: '#3498db', 
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                >
                  Tüm Yaklaşan Ödemeleri Görüntüle →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginNotifications;