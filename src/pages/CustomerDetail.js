import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import EnhancedCustomerNotes from '../components/EnhancedCustomerNotes';
import { toast } from 'react-toastify';
import CustomerNotes from '../components/CustomerNotes';
import { useUserAccess } from '../helpers/userAccess'; 

const CustomerDetail = () => {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  
  // User access control
  const { user, isAdmin, isMuhasebe, loading: accessLoading } = useUserAccess();

  const fetchCustomerData = useCallback(async () => {
    if (accessLoading) return; // Erişim kontrolü yüklenmeden devam etme
    
    setLoading(true);
    try {
      console.log('Müşteri detayı yükleniyor, ID:', id);
      console.log('Kullanıcı rolleri:', { isAdmin, isMuhasebe });
      
      // Önce müşteri bilgilerini getir
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();
      
      if (customerError) {
        console.error("Müşteri bilgisi alınamadı:", customerError);
        if (customerError.code === 'PGRST116') {
          toast.error('Müşteri bulunamadı');
          return; // Müşteri yoksa işlemi sonlandır
        }
        throw customerError;
      }
      
      // Müşteri varsa, erişim kontrolü yap - Admin ve muhasebe kullanıcılarına hemen erişim ver
      console.log('Müşteri bulundu:', customerData);
      console.log('isAdmin:', isAdmin, 'isMuhasebe:', isMuhasebe);
      
      // Admin veya muhasebe değilse erişim kontrolü yap
      if (!isAdmin && !isMuhasebe) {
        if (!user) {
          setAccessDenied(true);
          return;
        }
        
        console.log('Kullanıcı erişimi kontrol ediliyor...');
        
        // Bu kullanıcının bu müşteriye erişimi var mı kontrol et
        const { data, error } = await supabase
          .from('user_customer_assignments')
          .select('id')
          .eq('user_id', user.id)
          .eq('customer_id', id)
          .single();
          
        if (error) {
          if (error.code !== 'PGRST116') {
            console.error("Erişim kontrolü hatası:", error);
          }
          console.log('Erişim reddedildi');
          setAccessDenied(true);
          return;
        }
        
        if (!data) {
          console.log('Erişim reddedildi - müşteri ataması yok');
          setAccessDenied(true);
          return;
        }
        
        console.log('Erişim onaylandı');
      } else {
        console.log('Admin veya muhasebe kullanıcısı, tüm müşterilere erişim var');
      }

      // Erişim varsa müşteri bakiyesini getir
      const { data: balanceData, error: balanceError } = await supabase
        .from('customer_balances')
        .select('*')
        .eq('customer_id', id)
        .single();
      
      if (balanceError && balanceError.code !== 'PGRST116') {
        console.error("Bakiye hatası:", balanceError);
      }

      setCustomer(customerData);
      setBalance(balanceData || null);
    } catch (error) {
      toast.error('Müşteri bilgileri yüklenirken bir hata oluştu');
      console.error('Error loading customer data:', error);
    } finally {
      setLoading(false);
    }
  }, [id, user, isAdmin, isMuhasebe, accessLoading]);

  useEffect(() => {
    if (id && !accessLoading) {
      fetchCustomerData();
    }
  }, [id, fetchCustomerData, accessLoading]);

  if (loading || accessLoading) {
    return <div style={{ textAlign: 'center', padding: '40px' }}>Yükleniyor...</div>;
  }

  if (accessDenied) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div className="card" style={{ padding: '20px', marginBottom: '20px', backgroundColor: '#fff3cd', color: '#856404' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
            Erişim Reddedildi
          </h2>
          <p>Bu müşteriye erişim izniniz bulunmuyor. Sadece size atanan müşterileri görüntüleyebilirsiniz.</p>
          <Link to="/customers" className="btn btn-warning" style={{ marginTop: '15px' }}>
            Müşteri Listesine Dön
          </Link>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <p>Müşteri bulunamadı</p>
        <Link to="/customers" className="btn btn-primary">
          Müşteri Listesine Dön
        </Link>
      </div>
    );
  }

  // Check if we have any balance data
  const hasBalance = balance !== null;
  
  // Bakiye değerlerini hesapla - parse etme kontrollerini güçlendir
  const pastDueBalance = hasBalance ? (
    balance.past_due_balance !== null && balance.past_due_balance !== undefined
      ? parseFloat(balance.past_due_balance)
      : 0
  ) : 0;
  
  const notDueBalance = hasBalance ? (
    balance.not_due_balance !== null && balance.not_due_balance !== undefined
      ? parseFloat(balance.not_due_balance)
      : 0
  ) : 0;
  
  // Toplam bakiye: 1. total_balance alanı, 2. past_due + not_due toplamı
  const totalBalance = hasBalance ? (
    balance.total_balance !== null && balance.total_balance !== undefined 
      ? parseFloat(balance.total_balance) 
      : (pastDueBalance + notDueBalance)
  ) : 0;

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <Link
          to="/customers"
          style={{ display: 'inline-flex', alignItems: 'center', color: '#3498db', textDecoration: 'none' }}
        >
          ← Müşteri Listesine Dön
        </Link>
      </div>
      
      {/* Customer Info Card */}
      <div className="card">
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
          {customer.name}
        </h1>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px',
            marginBottom: '20px'
          }}
        >
          <div>
            <p style={{ fontSize: '14px', color: '#888' }}>Müşteri Kodu</p>
            <p style={{ fontWeight: 'bold' }}>{customer.code || '-'}</p>
          </div>
          <div>
            <p style={{ fontSize: '14px', color: '#888' }}>Sektör</p>
            <p style={{ fontWeight: 'bold' }}>{customer.sector_code || '-'}</p>
          </div>
          <div>
            <p style={{ fontSize: '14px', color: '#888' }}>Grup</p>
            <p style={{ fontWeight: 'bold' }}>{customer.group_code || '-'}</p>
          </div>
          <div>
            <p style={{ fontSize: '14px', color: '#888' }}>Bölge</p>
            <p style={{ fontWeight: 'bold' }}>{customer.region_code || '-'}</p>
          </div>
          <div>
            <p style={{ fontSize: '14px', color: '#888' }}>Ödeme Vadesi</p>
            <p style={{ fontWeight: 'bold' }}>{customer.payment_term || '-'}</p>
          </div>
        </div>
      </div>
      
      {/* Balance Info Card */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>Bakiye Bilgileri</h2>
        
        {hasBalance ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
              marginBottom: '20px'
            }}
          >
            <div>
              <p style={{ fontSize: '14px', color: '#888' }}>Toplam Bakiye</p>
              <p style={{ fontWeight: 'bold', fontSize: '18px' }}>
                {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(totalBalance)}
              </p>
            </div>
            
            <div>
              <p style={{ fontSize: '14px', color: '#888' }}>Vadesi Geçen Bakiye</p>
              <p style={{ fontWeight: 'bold', fontSize: '18px', color: pastDueBalance > 0 ? '#e74c3c' : 'inherit' }}>
                {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(pastDueBalance)}
              </p>
              {balance.past_due_date && (
                <p style={{ fontSize: '12px', color: '#666' }}>
                  Vade: {format(new Date(balance.past_due_date), 'dd.MM.yyyy', { locale: tr })}
                </p>
              )}
            </div>
            
            <div>
              <p style={{ fontSize: '14px', color: '#888' }}>Vadesi Geçmemiş Bakiye</p>
              <p style={{ fontWeight: 'bold', fontSize: '18px' }}>
                {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(notDueBalance)}
              </p>
              {balance.not_due_date && (
                <p style={{ fontSize: '12px', color: '#666' }}>
                  Vade: {format(new Date(balance.not_due_date), 'dd.MM.yyyy', { locale: tr })}
                </p>
              )}
            </div>
            
            {balance.reference_date && (
              <div>
                <p style={{ fontSize: '14px', color: '#888' }}>Bakiye Referans Tarihi</p>
                <p style={{ fontWeight: 'bold' }}>
                  {format(new Date(balance.reference_date), 'dd.MM.yyyy', { locale: tr })}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p style={{ color: '#888', textAlign: 'center', padding: '10px' }}>
            Bu müşteri için henüz bakiye bilgisi bulunmuyor
          </p>
        )}
      </div>
      
      {/* CustomerNotes component */}
      <EnhancedCustomerNotes 
        customerId={id} 
        customerName={customer.name}
        pastDueBalance={pastDueBalance}
        notDueBalance={notDueBalance}
        totalBalance={totalBalance}
      />
    </div>
  );
};

export default CustomerDetail;