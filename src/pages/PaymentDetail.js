import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { format, differenceInDays, addDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'react-toastify';

const PaymentDetail = () => {
  const { id } = useParams(); // Müşteri ID'si
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [balance, setBalance] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [promisedDate, setPromisedDate] = useState('');
  const [userInfo, setUserInfo] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Kullanıcı bilgisi ve müşteri+bakiye verilerini yükle
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserInfo(user);
          // Profil tablosundan rol bilgisini kontrol et
          const { data } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();
            
          setIsAdmin(data?.role === 'admin');
        }
      } catch (error) {
        console.error('Kullanıcı bilgisi alınamadı:', error);
      }
    };
    
    const fetchData = async () => {
      setLoading(true);
      try {
        // Müşteriyi getir
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('*')
          .eq('id', id)
          .single();
          
        if (customerError) throw customerError;
        
        // Müşterinin bakiye bilgisini getir
        const { data: balanceData, error: balanceError } = await supabase
          .from('customer_balances')
          .select('*')
          .eq('customer_id', id)
          .single();
          
        if (balanceError && balanceError.code !== 'PGRST116') throw balanceError;
        
        // Notları getir (payment_notes tablosu varsa)
        try {
          const { data: notesData } = await supabase
            .from('payment_notes')
            .select(`
              *,
              profiles (
                full_name
              )
            `)
            .eq('customer_id', id)
            .order('created_at', { ascending: false });
          
          setNotes(notesData || []);
        } catch (notesError) {
          console.error('Notlar yüklenemedi:', notesError);
          setNotes([]);
        }
        
        setCustomer(customerData);
        setBalance(balanceData || null);
      } catch (error) {
        console.error('Veri yükleme hatası:', error);
        toast.error('Müşteri bilgileri yüklenirken bir hata oluştu');
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserInfo();
    fetchData();
  }, [id]);

  // Not ekleme fonksiyonu
  const handleAddNote = async (e) => {
    e.preventDefault();
    
    if (!newNote.trim()) {
      toast.warning('Lütfen bir not giriniz');
      return;
    }
    
    try {
      // payment_notes tablosu oluşturulmuş mu kontrol et
      const { data: tableExists } = await supabase
        .from('payment_notes')
        .select('id')
        .limit(1);
      
      // Eğer tablo yoksa kullanıcıyı bilgilendir
      if (tableExists === null) {
        toast.error('payment_notes tablosu oluşturulmamış. Lütfen SQL kodlarını çalıştırın.');
        return;
      }
      
      // Not ekle
      const { data, error } = await supabase
        .from('payment_notes')
        .insert({
          customer_id: id,
          user_id: userInfo.id,
          note: newNote,
          promised_payment_date: promisedDate || null,
          past_due_balance: balance?.past_due_balance || 0,
          not_due_balance: balance?.not_due_balance || 0,
          total_balance: balance?.total_balance || 0
        })
        .select();
        
      if (error) throw error;
      
      // Not listesini güncelle
      if (data && data.length > 0) {
        const newNoteWithUser = {
          ...data[0],
          profiles: {
            full_name: userInfo.user_metadata?.full_name || userInfo.email
          }
        };
        
        setNotes([newNoteWithUser, ...notes]);
        setNewNote('');
        setPromisedDate('');
        
        toast.success('Not başarıyla kaydedildi');
      }
    } catch (error) {
      console.error('Not ekleme hatası:', error);
      toast.error('Not eklenirken bir hata oluştu');
    }
  };

  if (loading) {
    return <div className="loading">Yükleniyor...</div>;
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
      
      {/* Müşteri Bilgileri */}
      <div className="card">
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
          {customer.name}
        </h1>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
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
        </div>
      </div>
      
      {/* Bakiye Bilgileri */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>Bakiye Durumu</h2>
        
        {balance ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            <div className="stat-card">
              <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Toplam Bakiye</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(balance.total_balance || 0)}
              </p>
            </div>
            
            <div className="stat-card">
              <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Vadesi Geçen Bakiye</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(balance.past_due_balance || 0)}
              </p>
            </div>
            
            <div className="stat-card">
              <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Vadesi Geçmemiş Bakiye</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(balance.not_due_balance || 0)}
              </p>
            </div>
          </div>
        ) : (
          <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
            Bu müşteriye ait bakiye bilgisi bulunamadı.
          </p>
        )}
      </div>
      
      {/* Not Ekleme Formu */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>Yeni Not Ekle</h2>
        
        <form onSubmit={handleAddNote}>
          <div className="form-group">
            <label htmlFor="newNote">Not</label>
            <textarea
              id="newNote"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              style={{ width: '100%', padding: '10px', minHeight: '100px', resize: 'vertical' }}
              placeholder="Müşteri ile yapılan görüşme notları, ödeme sözü, vb."
              required
            ></textarea>
          </div>
          
          <div className="form-group">
            <label htmlFor="promisedDate">Söz Verilen Ödeme Tarihi (Opsiyonel)</label>
            <input
              type="date"
              id="promisedDate"
              value={promisedDate}
              onChange={(e) => setPromisedDate(e.target.value)}
              style={{ width: '100%', padding: '8px' }}
            />
            <small style={{ color: '#666', fontSize: '12px' }}>
              Eğer müşteri belirli bir tarihte ödeme yapacağını söz verdiyse bu tarihi giriniz.
            </small>
          </div>
          
          <button type="submit" className="btn btn-primary">
            Notu Kaydet
          </button>
        </form>
      </div>
      
      {/* Notlar Listesi */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>Geçmiş Notlar</h2>
        
        {notes.length > 0 ? (
          <div>
            {notes.map((note) => (
              <div key={note.id} style={{ 
                padding: '15px', 
                borderLeft: note.promised_payment_date ? '3px solid #3498db' : '1px solid #ddd',
                marginBottom: '15px',
                backgroundColor: '#f9f9f9' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div>
                    <strong>Ekleyen:</strong> {note.profiles?.full_name || 'Kullanıcı'}
                  </div>
                  <div style={{ color: '#888', fontSize: '14px' }}>
                    {format(new Date(note.created_at), 'dd.MM.yyyy HH:mm', { locale: tr })}
                  </div>
                </div>
                
                <div style={{ marginBottom: '15px', whiteSpace: 'pre-wrap' }}>
                  {note.note}
                </div>
                
                {note.promised_payment_date && (
                  <div style={{ 
                    backgroundColor: '#e3f2fd', 
                    padding: '8px', 
                    borderRadius: '4px',
                    marginBottom: '10px'
                  }}>
                    <strong>Söz Verilen Ödeme Tarihi:</strong> {format(new Date(note.promised_payment_date), 'dd.MM.yyyy', { locale: tr })}
                  </div>
                )}
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '13px', color: '#666' }}>
                  <div>
                    <div>Vadesi Geçen Bakiye:</div>
                    <div style={{ fontWeight: 'bold' }}>
                      {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(note.past_due_balance || 0)}
                    </div>
                  </div>
                  
                  <div>
                    <div>Vadesi Geçmemiş Bakiye:</div>
                    <div style={{ fontWeight: 'bold' }}>
                      {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(note.not_due_balance || 0)}
                    </div>
                  </div>
                  
                  <div>
                    <div>Toplam Bakiye:</div>
                    <div style={{ fontWeight: 'bold' }}>
                      {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(note.total_balance || 0)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
            Bu müşteriye ait not bulunmuyor. İlk notu siz ekleyin!
          </p>
        )}
      </div>
    </div>
  );
};

export default PaymentDetail;