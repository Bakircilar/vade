import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

const CustomerNotes = ({ customerId, customerBalance, pastDueBalance: propPastDueBalance, notDueBalance: propNotDueBalance }) => {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [promiseDate, setPromiseDate] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Fetch customer notes
  const fetchNotes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customer_notes')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error) {
      console.error('Error loading notes:', error);
      toast.error('Notlar yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  // Load notes on component mount
  useEffect(() => {
    if (customerId) {
      fetchNotes();
    }
  }, [customerId]);

  // Add a new note
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) {
      toast.warning('Not içeriği boş olamaz');
      return;
    }

    setAddingNote(true);
    try {
      // Debug için bakiye bilgisini kontrol et
      console.log('Props\'tan gelen müşteri bakiye bilgileri:', {
        customerBalance,
        propPastDueBalance,
        propNotDueBalance
      });
      
      // Veritabanından doğrudan bakiye bilgisini al
      const { data: balanceData, error: balanceError } = await supabase
        .from('customer_balances')
        .select('past_due_balance, not_due_balance, total_balance')
        .eq('customer_id', customerId)
        .single();
      
      if (balanceError && balanceError.code !== 'PGRST116') {
        console.error("Bakiye bilgisi alınamadı:", balanceError);
      } else {
        console.log('Veritabanından alınan bakiye bilgisi:', balanceData);
      }
      
      // Öncelik sırası: 
      // 1. Veritabanından alınan değerler
      // 2. Props'tan gelen değerler
      // 3. null değer
      
      // Total balance hesaplama
      let finalTotalBalance = null;
      if (balanceData?.total_balance !== null && balanceData?.total_balance !== undefined) {
        const parsedValue = parseFloat(balanceData.total_balance);
        if (!isNaN(parsedValue)) {
          finalTotalBalance = parsedValue;
        }
      } else if (customerBalance !== null && customerBalance !== undefined) {
        const parsedValue = parseFloat(customerBalance);
        if (!isNaN(parsedValue)) {
          finalTotalBalance = parsedValue;
        }
      }
      
      // Past due balance hesaplama
      let finalPastDueBalance = null;
      if (balanceData?.past_due_balance !== null && balanceData?.past_due_balance !== undefined) {
        const parsedValue = parseFloat(balanceData.past_due_balance);
        if (!isNaN(parsedValue)) {
          finalPastDueBalance = parsedValue;
        }
      } else if (propPastDueBalance !== null && propPastDueBalance !== undefined) {
        const parsedValue = parseFloat(propPastDueBalance);
        if (!isNaN(parsedValue)) {
          finalPastDueBalance = parsedValue;
        }
      }
      
      // Not due balance hesaplama
      let finalNotDueBalance = null;
      if (balanceData?.not_due_balance !== null && balanceData?.not_due_balance !== undefined) {
        const parsedValue = parseFloat(balanceData.not_due_balance);
        if (!isNaN(parsedValue)) {
          finalNotDueBalance = parsedValue;
        }
      } else if (propNotDueBalance !== null && propNotDueBalance !== undefined) {
        const parsedValue = parseFloat(propNotDueBalance);
        if (!isNaN(parsedValue)) {
          finalNotDueBalance = parsedValue;
        }
      }
      
      // Eğer total_balance yoksa ve diğer iki değer varsa toplam hesaplayalım
      if (finalTotalBalance === null && finalPastDueBalance !== null && finalNotDueBalance !== null) {
        finalTotalBalance = finalPastDueBalance + finalNotDueBalance;
      }
      
      // Hiçbiri yoksa props'tan gelen customerBalance'ı kullan
      if (finalTotalBalance === null && customerBalance !== null && customerBalance !== undefined) {
        const parsedValue = parseFloat(customerBalance);
        if (!isNaN(parsedValue)) {
          finalTotalBalance = parsedValue;
        }
      }
      
      // Son hesaplanan değerleri kontrol edelim
      console.log('Son hesaplanan bakiye değerleri:', {
        finalTotalBalance,
        finalPastDueBalance,
        finalNotDueBalance
      });

      const newNoteData = {
        customer_id: customerId,
        note_content: newNote.trim(),
        promise_date: promiseDate || null,
        balance_at_time: finalTotalBalance,
        past_due_balance: finalPastDueBalance,
        not_due_balance: finalNotDueBalance
      };
      
      console.log('Kaydedilecek not verisi:', newNoteData);

      const { error } = await supabase
        .from('customer_notes')
        .insert([newNoteData]);

      if (error) throw error;

      toast.success('Not başarıyla eklendi');
      setNewNote('');
      setPromiseDate('');
      fetchNotes(); // Refresh notes list
    } catch (error) {
      console.error('Error adding note:', error);
      toast.error('Not eklenirken bir hata oluştu');
    } finally {
      setAddingNote(false);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd.MM.yyyy', { locale: tr });
    } catch (error) {
      console.error('Date formatting error:', error);
      return dateString;
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '-';
    try {
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount)) return '-';
      
      return new Intl.NumberFormat('tr-TR', { 
        style: 'currency', 
        currency: 'TRY',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(numAmount);
    } catch (error) {
      console.error('Currency formatting error:', error, amount);
      return amount.toString();
    }
  };

  return (
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

      {loading ? (
        <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
          Notlar yükleniyor...
        </p>
      ) : notes.length > 0 ? (
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
                  {formatDate(note.created_at)}
                </span>
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
                    color: '#1565c0',
                    marginBottom: '10px'
                  }}
                >
                  <strong>Söz Verilen Ödeme Tarihi:</strong> {formatDate(note.promise_date)}
                </div>
              )}
              
              {/* Bakiye Bilgileri */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginTop: '10px' }}>
                {/* Vadesi Geçmiş Bakiye */}
                {note.past_due_balance !== null && note.past_due_balance !== undefined && (
                  <div style={{ 
                    padding: '8px', 
                    backgroundColor: '#fff8f8', 
                    borderRadius: '4px',
                    border: '1px solid #fee2e2'
                  }}>
                    <div style={{ fontSize: '12px', color: '#991b1b' }}>Vadesi Geçmiş Bakiye:</div>
                    <div style={{ fontWeight: 'bold', color: '#e53e3e' }}>
                      {formatCurrency(note.past_due_balance)}
                    </div>
                  </div>
                )}
                
                {/* Vadesi Geçmemiş Bakiye */}
                {note.not_due_balance !== null && note.not_due_balance !== undefined && (
                  <div style={{ 
                    padding: '8px', 
                    backgroundColor: '#f0f9ff', 
                    borderRadius: '4px',
                    border: '1px solid #e1f0ff'
                  }}>
                    <div style={{ fontSize: '12px', color: '#1e40af' }}>Vadesi Geçmemiş Bakiye:</div>
                    <div style={{ fontWeight: 'bold', color: '#3b82f6' }}>
                      {formatCurrency(note.not_due_balance)}
                    </div>
                  </div>
                )}
                
                {/* Toplam Bakiye */}
                {note.balance_at_time !== null && note.balance_at_time !== undefined && (
                  <div style={{ 
                    padding: '8px', 
                    backgroundColor: '#f8fafc', 
                    borderRadius: '4px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <div style={{ fontSize: '12px', color: '#475569' }}>Toplam Bakiye:</div>
                    <div style={{ fontWeight: 'bold' }}>
                      {formatCurrency(note.balance_at_time)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
          Bu müşteri için henüz not girilmemiş
        </p>
      )}
    </div>
  );
};

export default CustomerNotes;