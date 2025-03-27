// src/pages/EnhancedCustomerDetail.js
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'react-toastify';
import EnhancedCustomerNotes from '../components/EnhancedCustomerNotes';
import CustomerTimeline from '../components/CustomerTimeline';
import CustomerClassification from '../components/CustomerClassification';
import { useUserAccess } from '../helpers/userAccess';
import VadeHelper from '../helpers/VadeHelper';

const EnhancedCustomerDetail = () => {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  
  // User access control - include loading state
  const { user, isAdmin, isMuhasebe, loading: accessLoading } = useUserAccess();

  // Fetch customer data - memoized to prevent recreating the function
  const fetchCustomerData = useCallback(async () => {
    // Don't proceed if access control is still loading
    if (accessLoading) return;
    
    setLoading(true);
    try {
      console.log('Müşteri detayı yükleniyor, ID:', id);
      console.log('Kullanıcı rolleri:', { isAdmin, isMuhasebe });
      
      // First get customer information
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*, customer_classifications(*)')
        .eq('id', id)
        .single();
      
      if (customerError) {
        console.error("Müşteri bilgisi alınamadı:", customerError);
        if (customerError.code === 'PGRST116') {
          toast.error('Müşteri bulunamadı');
          return; // Stop if customer not found
        }
        throw customerError;
      }
      
      // Customer exists, check access control - give immediate access to admin and muhasebe users
      console.log('Müşteri bulundu:', customerData);
      console.log('isAdmin:', isAdmin, 'isMuhasebe:', isMuhasebe);
      
      // If not admin or muhasebe, check access control
      if (!isAdmin && !isMuhasebe) {
        if (!user) {
          setAccessDenied(true);
          return;
        }
        
        console.log('Kullanıcı erişimi kontrol ediliyor...');
        
        // Check if this user has access to this customer
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

      // If we have access, get customer balance
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

  // Initial data load - wait for access control to be ready
  useEffect(() => {
    if (id && !accessLoading) {
      fetchCustomerData();
    }
  }, [id, fetchCustomerData, accessLoading]);

  // Loading state
  if (loading || accessLoading) {
    return <div style={{ textAlign: 'center', padding: '40px' }}>Yükleniyor...</div>;
  }

  // Access denied state
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

  // No customer found state
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
  
  // Calculate balance values using VadeHelper
  const pastDueBalance = hasBalance ? VadeHelper.parseAmount(balance.past_due_balance) : 0;
  const notDueBalance = hasBalance ? VadeHelper.parseAmount(balance.not_due_balance) : 0;
  const totalBalance = hasBalance ? VadeHelper.calculateTotal(balance) : 0;
  
  // Balance analysis
  const balanceAnalysis = VadeHelper.analyzeBalance(balance);
  
  // Customer classification
  const classification = customer.customer_classifications && customer.customer_classifications.length > 0 
    ? customer.customer_classifications[0] 
    : null;
  
  // Classification color
  const getClassificationColor = (classification) => {
    if (!classification) return '#f8f9fa';
    
    switch(classification.classification) {
      case 'green': return '#2ecc71';
      case 'yellow': return '#f39c12';
      case 'red': return '#e74c3c';
      case 'black': return '#2c3e50';
      case 'special': return '#3498db';
      case 'custom': return '#9b59b6';
      default: return '#f8f9fa';
    }
  };
  
  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', { 
      style: 'currency', 
      currency: 'TRY' 
    }).format(amount);
  };

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
      
      {/* Müşteri Başlık Kartı - İçinde sınıflandırma bilgisi de var */}
      <div className="card" style={{ 
        marginBottom: '20px', 
        borderLeft: classification ? `5px solid ${getClassificationColor(classification)}` : 'none' 
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '5px' }}>
              {customer.name}
            </h1>
            <div style={{ color: '#666', fontSize: '14px' }}>
              Müşteri Kodu: {customer.code || '-'} | 
              Sektör: {customer.sector_code || '-'} | 
              Bölge: {customer.region_code || '-'}
            </div>
          </div>
          
          {classification && (
            <div style={{ 
              padding: '5px 15px',
              backgroundColor: getClassificationColor(classification),
              color: ['green', 'yellow', 'special'].includes(classification.classification) ? '#333' : 'white',
              borderRadius: '20px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center'
            }}>
              {classification.classification === 'custom' 
                ? classification.custom_classification 
                : ['green', 'yellow', 'red', 'black'].includes(classification.classification)
                  ? `${classification.classification === 'green' ? '🟢' : 
                      classification.classification === 'yellow' ? '🟡' : 
                      classification.classification === 'red' ? '🔴' : '⚫'} ${
                      classification.classification === 'green' ? 'Düşük Risk' : 
                      classification.classification === 'yellow' ? 'Orta Risk' : 
                      classification.classification === 'red' ? 'Yüksek Risk' : 'Çok Yüksek Risk'}`
                  : '🔵 Özel Durum'
              }
            </div>
          )}
        </div>
      </div>
      
      {/* Müşteri Sınıflandırması */}
      <CustomerClassification customerId={id} refresh={fetchCustomerData} />
      
      {/* Bakiye Bilgileri Kartı */}
      <div className="card" style={{ marginBottom: '20px' }}>
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
            <div style={{ 
              backgroundColor: '#f8f9fa', 
              padding: '15px', 
              borderRadius: '8px',
              textAlign: 'center' 
            }}>
              <div style={{ fontSize: '14px', color: '#777', marginBottom: '5px' }}>
                Toplam Bakiye
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {formatCurrency(totalBalance)}
              </div>
            </div>
            
            <div style={{ 
              backgroundColor: pastDueBalance > 0 ? '#fff3cd' : '#f8f9fa', 
              padding: '15px', 
              borderRadius: '8px',
              textAlign: 'center' 
            }}>
              <div style={{ fontSize: '14px', color: '#777', marginBottom: '5px' }}>
                Vadesi Geçen Bakiye
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: pastDueBalance > 0 ? '#e74c3c' : 'inherit' }}>
                {formatCurrency(pastDueBalance)}
              </div>
              {balance.past_due_date && (
                <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                  Vade: {format(new Date(balance.past_due_date), 'dd.MM.yyyy', { locale: tr })}
                </div>
              )}
            </div>
            
            <div style={{ 
              backgroundColor: '#f8f9fa', 
              padding: '15px', 
              borderRadius: '8px',
              textAlign: 'center' 
            }}>
              <div style={{ fontSize: '14px', color: '#777', marginBottom: '5px' }}>
                Vadesi Geçmemiş Bakiye
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {formatCurrency(notDueBalance)}
              </div>
              {balance.not_due_date && (
                <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                  Vade: {format(new Date(balance.not_due_date), 'dd.MM.yyyy', { locale: tr })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p style={{ color: '#888', textAlign: 'center', padding: '10px' }}>
            Bu müşteri için henüz bakiye bilgisi bulunmuyor
          </p>
        )}
      </div>
      
      {/* Sekmeler */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #ddd' }}>
          <button 
            className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
            style={{ 
              padding: '10px 20px', 
              border: 'none', 
              background: 'none', 
              borderBottom: activeTab === 'overview' ? '2px solid #3498db' : 'none',
              fontWeight: activeTab === 'overview' ? 'bold' : 'normal',
              color: activeTab === 'overview' ? '#3498db' : '#333',
              cursor: 'pointer'
            }}
          >
            Genel Bilgiler
          </button>
          <button 
            className={`tab-button ${activeTab === 'timeline' ? 'active' : ''}`}
            onClick={() => setActiveTab('timeline')}
            style={{ 
              padding: '10px 20px', 
              border: 'none', 
              background: 'none', 
              borderBottom: activeTab === 'timeline' ? '2px solid #3498db' : 'none',
              fontWeight: activeTab === 'timeline' ? 'bold' : 'normal',
              color: activeTab === 'timeline' ? '#3498db' : '#333',
              cursor: 'pointer'
            }}
          >
            Zaman Çizelgesi
          </button>
          <button 
            className={`tab-button ${activeTab === 'notes' ? 'active' : ''}`}
            onClick={() => setActiveTab('notes')}
            style={{ 
              padding: '10px 20px', 
              border: 'none', 
              background: 'none', 
              borderBottom: activeTab === 'notes' ? '2px solid #3498db' : 'none',
              fontWeight: activeTab === 'notes' ? 'bold' : 'normal',
              color: activeTab === 'notes' ? '#3498db' : '#333',
              cursor: 'pointer'
            }}
          >
            Notlar
          </button>
        </div>
      </div>
      
      {/* Sekme İçerikleri */}
      {activeTab === 'overview' && (
        <div className="overview-tab">
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
              Müşteri Detayları
            </h2>
            
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px'
            }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
                  Temel Bilgiler
                </h3>
                
                <table style={{ width: '100%' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '8px 0', fontWeight: 'bold', color: '#777', width: '40%' }}>Müşteri Adı</td>
                      <td style={{ padding: '8px 0' }}>{customer.name}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '8px 0', fontWeight: 'bold', color: '#777' }}>Müşteri Kodu</td>
                      <td style={{ padding: '8px 0' }}>{customer.code || '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '8px 0', fontWeight: 'bold', color: '#777' }}>Sektör</td>
                      <td style={{ padding: '8px 0' }}>{customer.sector_code || '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '8px 0', fontWeight: 'bold', color: '#777' }}>Bölge</td>
                      <td style={{ padding: '8px 0' }}>{customer.region_code || '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '8px 0', fontWeight: 'bold', color: '#777' }}>Grup</td>
                      <td style={{ padding: '8px 0' }}>{customer.group_code || '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '8px 0', fontWeight: 'bold', color: '#777' }}>Ödeme Vadesi</td>
                      <td style={{ padding: '8px 0' }}>{customer.payment_term || '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '8px 0', fontWeight: 'bold', color: '#777' }}>Kayıt Tarihi</td>
                      <td style={{ padding: '8px 0' }}>{customer.created_at ? format(new Date(customer.created_at), 'dd.MM.yyyy', { locale: tr }) : '-'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
                  Bakiye Durumu
                </h3>
                
                <table style={{ width: '100%' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '8px 0', fontWeight: 'bold', color: '#777', width: '40%' }}>Toplam Bakiye</td>
                      <td style={{ padding: '8px 0', fontWeight: 'bold' }}>{formatCurrency(totalBalance)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '8px 0', fontWeight: 'bold', color: '#777' }}>Vadesi Geçmiş</td>
                      <td style={{ padding: '8px 0', color: pastDueBalance > 0 ? '#e74c3c' : 'inherit' }}>{formatCurrency(pastDueBalance)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '8px 0', fontWeight: 'bold', color: '#777' }}>Vadesi Geçmemiş</td>
                      <td style={{ padding: '8px 0' }}>{formatCurrency(notDueBalance)}</td>
                    </tr>
                    {balance && balance.past_due_date && (
                      <tr>
                        <td style={{ padding: '8px 0', fontWeight: 'bold', color: '#777' }}>Vadesi Geçmiş Tarihi</td>
                        <td style={{ padding: '8px 0' }}>{format(new Date(balance.past_due_date), 'dd.MM.yyyy', { locale: tr })}</td>
                      </tr>
                    )}
                    {balance && balance.not_due_date && (
                      <tr>
                        <td style={{ padding: '8px 0', fontWeight: 'bold', color: '#777' }}>Yaklaşan Vade Tarihi</td>
                        <td style={{ padding: '8px 0' }}>{format(new Date(balance.not_due_date), 'dd.MM.yyyy', { locale: tr })}</td>
                      </tr>
                    )}
                    {balance && balance.reference_date && (
                      <tr>
                        <td style={{ padding: '8px 0', fontWeight: 'bold', color: '#777' }}>Referans Tarihi</td>
                        <td style={{ padding: '8px 0' }}>{format(new Date(balance.reference_date), 'dd.MM.yyyy', { locale: tr })}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {activeTab === 'timeline' && (
        <div className="timeline-tab">
          <CustomerTimeline customerId={id} />
        </div>
      )}
      
      {activeTab === 'notes' && (
        <div className="notes-tab">
          <EnhancedCustomerNotes 
            customerId={id} 
            customerName={customer.name}
            pastDueBalance={pastDueBalance}
            notDueBalance={notDueBalance}
            totalBalance={totalBalance}
          />
        </div>
      )}
    </div>
  );
};

export default EnhancedCustomerDetail;