import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { format, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'react-toastify';

const CustomerDetail = () => {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [balance, setBalance] = useState(null);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [promiseDate, setPromiseDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [addingNote, setAddingNote] = useState(false);

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

      // Get customer notes
      const { data: notesData, error: notesError } = await supabase
        .from('customer_notes')
        .select('*')
        .eq('customer_id', id)
        .order('created_at', { ascending: false });
      
      if (notesError) {
        console.error("Notlar alınamadı:", notesError);
      }

      setCustomer(customerData);
      setBalance(balanceData || null);
      setNotes(notesData || []);
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

  // Add a new note
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) {
      toast.warning('Not içeriği boş olamaz');
      return;
    }

    setAddingNote(true);
    try {
      // Calculate current balance
      const currentBalance = balance ? 
        (parseFloat(balance.total_balance) || 
          (parseFloat(balance.past_due_balance || 0) + parseFloat(balance.not_due_balance || 0))) : 0;

      const newNoteData = {
        customer_id: id,
        note_content: newNote.trim(),
        promise_date: promiseDate || null,
        balance_at_time: currentBalance
      };

      const { error } = await supabase
        .from('customer_notes')
        .insert([newNoteData]);

      if (error) throw error;

      toast.success('Not başarıyla eklendi');
      setNewNote('');
      setPromiseDate('');
      fetchCustomerData(); // Refresh data
    } catch (error) {
      console.error('Error adding note:', error);
      toast.error('Not eklenirken bir hata oluştu');
    } finally {
      setAddingNote(false);
    }
  };

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
  const pastDueBalance = hasBalance ? parseFloat(balance.past_due_balance || 0) : 0;
  const notDueBalance = hasBalance ? parseFloat(balance.not_due_balance || 0) : 0;
  const totalBalance = hasBalance ? (parseFloat(balance.total_balance) || (pastDueBalance + notDueBalance)) : 0;

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
      
      {/* Customer Notes Section */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
          Müşteri Notları ve Ödeme Takibi
        </h2>

        {/* Note entry form */}
        <form onSubmit={handleAddNote} style={{ marginBottom: '20px' }}>
          <div className="form-group">
            <label htmlFor="noteContent">Yeni Not</label>
            <textarea
              id="noteContent"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="form-control"
              rows="3"
              style={{ 
                width: '100%', 
                padding: '8px', 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                marginBottom: '10px'
              }}
              placeholder="Müşteri ile ilgili notunuzu buraya yazın..."
            ></textarea>
          </div>

          <div className="form-group">
            <label htmlFor="promiseDate">Söz Verilen Ödeme Tarihi (Opsiyonel)</label>
            <input
              type="date"
              id="promiseDate"
              value={promiseDate}
              onChange={(e) => setPromiseDate(e.target.value)}
              className="form-control"
              style={{ 
                width: '100%', 
                padding: '8px', 
                border: '1px solid #ddd', 
                borderRadius: '4px' 
              }}
            />
          </div>

          <button
            type="submit"
            disabled={addingNote || !newNote.trim()}
            className="btn btn-primary"
            style={{ marginTop: '10px' }}
          >
            {addingNote ? 'Ekleniyor...' : 'Not Ekle'}
          </button>
        </form>

        {/* Divider */}
        <hr style={{ margin: '20px 0', borderTop: '1px solid #eee' }} />

        {/* Notes list */}
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>
          Geçmiş Notlar
        </h3>

        {notes.length > 0 ? (
          <div>
            {notes.map((note) => (
              <div 
                key={note.id} 
                className="card" 
                style={{ 
                  marginBottom: '15px', 
                  padding: '15px',
                  backgroundColor: '#f9f9f9',
                  border: '1px solid #eee',
                  borderRadius: '4px'
                }}
              >
                <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 'bold', color: '#666' }}>
                    {note.created_at ? format(new Date(note.created_at), 'dd.MM.yyyy HH:mm', { locale: tr }) : '-'}
                  </span>
                  
                  {note.balance_at_time !== null && (
                    <span style={{ color: '#333' }}>
                      Bakiye: <strong>
                        {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(note.balance_at_time)}
                      </strong>
                    </span>
                  )}
                </div>

                <p style={{ margin: '0 0 10px 0', whiteSpace: 'pre-wrap' }}>{note.note_content}</p>
                
                {note.promise_date && (
                  <div 
                    style={{ 
                      padding: '5px 10px', 
                      backgroundColor: '#e3f2fd', 
                      borderRadius: '4px',
                      display: 'inline-block',
                      fontSize: '13px',
                      color: '#1565c0'
                    }}
                  >
                    <strong>Söz Verilen Ödeme Tarihi:</strong> {format(new Date(note.promise_date), 'dd.MM.yyyy', { locale: tr })}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
            Bu müşteri için henüz not girilmemiş
          </p>
        )}
      </div>
    </div>
  );
};

export default CustomerDetail;