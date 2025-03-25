import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

const CustomerNotes = ({ customerId, customerBalance }) => {
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
      // Format the current balance value
      const formattedBalance = customerBalance 
        ? parseFloat(customerBalance.toFixed(2))
        : null;

      const newNoteData = {
        customer_id: customerId,
        note_content: newNote.trim(),
        promise_date: promiseDate || null,
        balance_at_time: formattedBalance
      };

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
                  <strong>Söz Verilen Ödeme Tarihi:</strong> {formatDate(note.promise_date)}
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
  );
};

export default CustomerNotes;