// src/components/CustomerClassification.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';
import { differenceInDays } from 'date-fns';
import { useUserAccess } from '../helpers/userAccess';

const CustomerClassification = ({ customerId, refresh }) => {
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [riskScore, setRiskScore] = useState(0);
  const [classification, setClassification] = useState('');
  const [customClassification, setCustomClassification] = useState('');
  const [balance, setBalance] = useState(null);
  const [notes, setNotes] = useState([]);
  
  // Kullanıcı erişimi
  const { isAdmin, isMuhasebe } = useUserAccess();
  
  // Sınıflandırma seçenekleri
  const CLASSIFICATIONS = [
    { value: 'green', label: 'Yeşil - Düşük Risk', color: '#2ecc71' },
    { value: 'yellow', label: 'Sarı - Orta Risk', color: '#f39c12' },
    { value: 'red', label: 'Kırmızı - Yüksek Risk', color: '#e74c3c' },
    { value: 'black', label: 'Siyah - Çok Yüksek Risk', color: '#2c3e50' },
    { value: 'special', label: 'Özel Durum', color: '#3498db' },
    { value: 'custom', label: 'Özel Sınıflandırma...', color: '#9b59b6' }
  ];

  // Veri getirme
  useEffect(() => {
    if (customerId) {
      fetchCustomerData();
    }
  }, [customerId]);
  
  // Müşteri ve ilgili verileri getir
  const fetchCustomerData = async () => {
    setLoading(true);
    try {
      // Müşteri bilgilerini getir
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*, customer_classifications(*)')
        .eq('id', customerId)
        .single();
        
      if (customerError) throw customerError;
      setCustomer(customerData);
      
      // Mevcut sınıflandırmayı ayarla
      if (customerData.customer_classifications && customerData.customer_classifications.length > 0) {
        const currentClassification = customerData.customer_classifications[0];
        setClassification(currentClassification.classification || '');
        setCustomClassification(currentClassification.custom_classification || '');
      }
      
      // Bakiye bilgilerini getir
      const { data: balanceData, error: balanceError } = await supabase
        .from('customer_balances')
        .select('*')
        .eq('customer_id', customerId)
        .single();
        
      if (balanceError && balanceError.code !== 'PGRST116') {
        console.error("Bakiye bilgisi alınamadı:", balanceError);
      } else {
        setBalance(balanceData || null);
      }
      
      // Notları getir
      const { data: notesData, error: notesError } = await supabase
        .from('customer_notes')
        .select('created_at, promise_date, tags')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
        
      if (notesError) throw notesError;
      setNotes(notesData || []);
      
      // Risk skoru hesapla
      const score = calculateRiskScore(balanceData, notesData);
      setRiskScore(score);
      
      // Eğer sınıflandırma yoksa, risk skoruna göre otomatik sınıflandırma öner
      if (!customerData.customer_classifications || 
          customerData.customer_classifications.length === 0) {
        const suggestedClass = getSuggestedClassification(score);
        setClassification(suggestedClass);
      }
    } catch (error) {
      console.error('Müşteri verisi yükleme hatası:', error);
      toast.error('Müşteri verisi yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };
  
  // Risk skoruna göre önerilen sınıflandırma
  const getSuggestedClassification = (score) => {
    if (score < 30) return 'green';
    if (score < 60) return 'yellow';
    if (score < 80) return 'red';
    return 'black';
  };
  
  // Risk skoru hesapla
  const calculateRiskScore = (balance, notes) => {
    // Risk skoru başlangıcı
    let score = 0;
    
    // Bakiye ve vade bilgilerine dayalı risk faktörleri
    if (balance) {
      const pastDueBalance = parseFloat(balance.past_due_balance || 0);
      const totalBalance = parseFloat(balance.total_balance || 0) || 
                          (parseFloat(balance.past_due_balance || 0) + parseFloat(balance.not_due_balance || 0));
      
      // Vadesi geçmiş bakiye faktörü (max 45 puan)
      if (pastDueBalance > 0) {
        // Toplam bakiyenin %50'sinden fazlası vadesi geçmiş ise yüksek risk
        const pastDueRatio = totalBalance > 0 ? pastDueBalance / totalBalance : 0;
        const pastDueFactor = Math.min(pastDueRatio * 90, 45);
        score += pastDueFactor;
      }
      
      // Vade gecikmesi faktörü (max 35 puan)
      if (balance.past_due_date) {
        const today = new Date();
        const pastDueDate = new Date(balance.past_due_date);
        const daysOverdue = differenceInDays(today, pastDueDate);
        
        if (daysOverdue > 0) {
          // 90 günü aşan vadeler için maksimum risk puanı
          const delayFactor = Math.min(daysOverdue / 90, 1) * 35;
          score += delayFactor;
        }
      }
    }
    
    // Not bilgilerine dayalı risk faktörleri
    if (notes && notes.length > 0) {
      // Son 3 ayda çok fazla not varsa, takip sorunu olabilir (max 10 puan)
      const noteCount = notes.length;
      if (noteCount > 5) {
        const noteFactor = Math.min((noteCount - 5) / 10, 1) * 10;
        score += noteFactor;
      }
      
      // Söz verilen ödeme tarihleri geçmiş mi? (max 10 puan)
      const now = new Date();
      const missedPromises = notes.filter(note => 
        note.promise_date && new Date(note.promise_date) < now
      );
      
      if (missedPromises.length > 0) {
        const promiseFactor = Math.min(missedPromises.length / 3, 1) * 10;
        score += promiseFactor;
      }
    }
    
    return Math.round(score);
  };
  
  // Sınıflandırma değişikliği
  const handleClassificationChange = (e) => {
    setClassification(e.target.value);
    
    // Özel sınıflandırma seçilmediyse, özel sınıflandırma metnini temizle
    if (e.target.value !== 'custom') {
      setCustomClassification('');
    }
  };
  
  // Sınıflandırmayı kaydet
  const saveClassification = async () => {
    // Yönetici veya muhasebe değilse kaydetme yetkisi yok
    if (!isAdmin && !isMuhasebe) {
      toast.error('Sınıflandırma yapma yetkiniz bulunmuyor');
      return;
    }
    
    if (!classification) {
      toast.warning('Lütfen bir sınıflandırma seçin');
      return;
    }
    
    if (classification === 'custom' && !customClassification.trim()) {
      toast.warning('Lütfen özel sınıflandırma için bir açıklama girin');
      return;
    }
    
    setLoading(true);
    try {
      // Önce mevcut sınıflandırmayı kontrol et
      const { data: existingClassification, error: checkError } = await supabase
        .from('customer_classifications')
        .select('id')
        .eq('customer_id', customerId)
        .maybeSingle();
        
      if (checkError && checkError.code !== 'PGRST116') throw checkError;
      
      // Kullanıcı ID'sini al
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Oturum bilgisi alınamadı');
        return;
      }
      
      const classificationData = {
        customer_id: customerId,
        classification: classification,
        custom_classification: classification === 'custom' ? customClassification.trim() : null,
        risk_score: riskScore,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      };
      
      if (existingClassification) {
        // Mevcut sınıflandırmayı güncelle
        const { error: updateError } = await supabase
          .from('customer_classifications')
          .update(classificationData)
          .eq('id', existingClassification.id);
          
        if (updateError) throw updateError;
        
        toast.success('Müşteri sınıflandırması güncellendi');
      } else {
        // Yeni sınıflandırma oluştur
        classificationData.created_at = new Date().toISOString();
        classificationData.created_by = user.id;
        
        const { error: insertError } = await supabase
          .from('customer_classifications')
          .insert([classificationData]);
          
        if (insertError) throw insertError;
        
        toast.success('Müşteri sınıflandırması kaydedildi');
      }
      
      // Yenileme fonksiyonu varsa çağır
      if (typeof refresh === 'function') {
        refresh();
      }
    } catch (error) {
      console.error('Sınıflandırma kaydetme hatası:', error);
      toast.error('Sınıflandırma kaydedilirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };
  
  // Sınıflandırma rengini getir
  const getClassificationColor = (classVal) => {
    const classification = CLASSIFICATIONS.find(c => c.value === classVal);
    return classification ? classification.color : '#777';
  };
  
  // Sınıflandırma metnini getir
  const getClassificationLabel = (classVal) => {
    const classification = CLASSIFICATIONS.find(c => c.value === classVal);
    return classification ? classification.label.split(' - ')[0] : 'Belirsiz';
  };
  
  // Risk skoru arka plan rengi
  const getRiskScoreColor = (score) => {
    if (score < 30) return '#2ecc71'; // Yeşil - Düşük risk
    if (score < 60) return '#f39c12'; // Sarı - Orta risk
    if (score < 80) return '#e74c3c'; // Kırmızı - Yüksek risk
    return '#2c3e50'; // Siyah - Çok yüksek risk
  };

  return (
    <div className="card" style={{ marginBottom: '20px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px' }}>
        Müşteri Risk Analizi ve Sınıflandırma
      </h2>
      
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '20px' }}>
        {/* Risk Skoru */}
        <div style={{ flex: '1 1 200px' }}>
          <div style={{ 
            backgroundColor: '#f8f9fa', 
            padding: '15px', 
            borderRadius: '8px',
            textAlign: 'center' 
          }}>
            <div style={{ fontSize: '14px', color: '#777', marginBottom: '5px' }}>
              Risk Skoru
            </div>
            <div style={{ 
              display: 'inline-block',
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              backgroundColor: getRiskScoreColor(riskScore),
              color: 'white',
              lineHeight: '60px',
              fontSize: '24px',
              fontWeight: 'bold',
              marginBottom: '10px'
            }}>
              {riskScore}
            </div>
            <div style={{ 
              fontSize: '14px', 
              fontWeight: 'bold',
              color: getRiskScoreColor(riskScore) 
            }}>
              {riskScore < 30 ? 'Düşük Risk' : 
               riskScore < 60 ? 'Orta Risk' : 
               riskScore < 80 ? 'Yüksek Risk' : 'Çok Yüksek Risk'}
            </div>
          </div>
        </div>
        
        {/* Mevcut Sınıflandırma */}
        <div style={{ flex: '1 1 200px' }}>
          <div style={{ 
            padding: '15px', 
            borderRadius: '8px',
            backgroundColor: customer?.customer_classifications?.length > 0 ? 
              getClassificationColor(customer.customer_classifications[0].classification) : '#f8f9fa',
            color: customer?.customer_classifications?.length > 0 && 
                  customer.customer_classifications[0].classification !== 'custom' ? 'white' : '#333',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '14px', color: customer?.customer_classifications?.length > 0 && 
                           customer.customer_classifications[0].classification !== 'custom' ? 'rgba(255,255,255,0.8)' : '#777', 
                          marginBottom: '5px' }}>
              Mevcut Sınıflandırma
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '5px' }}>
              {customer?.customer_classifications?.length > 0 ? 
                customer.customer_classifications[0].classification === 'custom' ?
                  'Özel Sınıflandırma' :
                  getClassificationLabel(customer.customer_classifications[0].classification) : 
                'Henüz Sınıflandırılmamış'}
            </div>
            {customer?.customer_classifications?.length > 0 && 
             customer.customer_classifications[0].classification === 'custom' && 
             customer.customer_classifications[0].custom_classification && (
              <div style={{ fontSize: '14px' }}>
                {customer.customer_classifications[0].custom_classification}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Sınıflandırma Seçimi - Sadece admin/muhasebe için */}
      {(isAdmin || isMuhasebe) && (
        <div style={{ marginTop: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
            Sınıflandırma Güncelle
          </h3>
          
          <div style={{ marginBottom: '15px' }}>
            <label htmlFor="classification" style={{ display: 'block', marginBottom: '5px' }}>
              Sınıflandırma:
            </label>
            <select
              id="classification"
              value={classification}
              onChange={handleClassificationChange}
              style={{ 
                width: '100%', 
                padding: '8px', 
                borderRadius: '4px', 
                border: '1px solid #ddd' 
              }}
            >
              <option value="">-- Sınıflandırma Seçin --</option>
              {CLASSIFICATIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          
          {classification === 'custom' && (
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="customClassification" style={{ display: 'block', marginBottom: '5px' }}>
                Özel Sınıflandırma Açıklaması:
              </label>
              <input
                type="text"
                id="customClassification"
                value={customClassification}
                onChange={(e) => setCustomClassification(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  borderRadius: '4px', 
                  border: '1px solid #ddd' 
                }}
                placeholder="Müşteri için özel sınıflandırma açıklaması..."
              />
            </div>
          )}
          
          <button
            onClick={saveClassification}
            disabled={loading || !classification}
            className="btn btn-primary"
          >
            {loading ? 'Kaydediliyor...' : 'Sınıflandırmayı Kaydet'}
          </button>
        </div>
      )}
      
      {/* Sınıflandırma bilgileri - Yönetici/muhasebe olmayan kullanıcılar için özet */}
      {!isAdmin && !isMuhasebe && (
        <div style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
          <p>
            Bu müşterinin risk skoru ve sınıflandırması otomatik olarak sistem tarafından hesaplanarak, 
            yönetici veya muhasebe departmanı tarafından değerlendiriliyor.
            Yeni notlar ve vade bilgileri ekledikçe risk skoru güncellenecektir.
          </p>
        </div>
      )}
    </div>
  );
};

export default CustomerClassification;