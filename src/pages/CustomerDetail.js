import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { format, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'react-toastify';
import CustomerNotes from '../components/CustomerNotes'; // CustomerNotes bileşenini import ediyoruz

const CustomerDetail = () => {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCustomerData = useCallback(async () => {
    setLoading(true);
    try {
      // Get customer info
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();
      
      if (customerError) throw customerError;

      // Get customer balance
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
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchCustomerData();
    }
  }, [id, fetchCustomerData]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px' }}>Yükleniyor...</div>;
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

  // Debug için bakiye değerlerini console'a yazdır
  console.log('CustomerDetail.js - Hesaplanan değerler:', {
    pastDueBalance,
    notDueBalance,
    totalBalance
  });

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
      
      {/* CustomerNotes bileşenini çağırırken - SADECE BU BÖLÜM KALACAK */}
      <CustomerNotes 
        customerId={id} 
        customerBalance={totalBalance}
        pastDueBalance={pastDueBalance}
        notDueBalance={notDueBalance}
      />
      
      {/* Customer Notes Section - BU BÖLÜMÜ KALDIRIYORUZ */}
      {/* Eskiden burada bir not ekleme formu vardı, artık kullanılmıyor */}
    </div>
  );
};

export default CustomerDetail;