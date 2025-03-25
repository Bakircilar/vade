import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';

const QuickNoteComponent = ({ customerId, customerName, refreshData }) => {
  const [note, setNote] = useState('');
  const [promiseDate, setPromiseDate] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle note submission
  const handleSubmitNote = async (e) => {
    e.preventDefault();
    
    if (!note.trim()) {
      toast.warning('Not içeriği boş olamaz');
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Get customer balance information
      const { data: balanceData, error: balanceError } = await supabase
        .from('customer_balances')
        .select('past_due_balance, not_due_balance, total_balance')
        .eq('customer_id', customerId)
        .single();
        
      if (balanceError && balanceError.code !== 'PGRST116') {
        console.error("Bakiye bilgisi alınamadı:", balanceError);
      }
      
      // Prepare new note data
      const newNoteData = {
        customer_id: customerId,
        note_content: note.trim(),
        promise_date: promiseDate || null,
        balance_at_time: balanceData ? parseFloat(balanceData.total_balance || 0) : null
      };
      
      // Add note to database
      const { error } = await supabase
        .from('customer_notes')
        .insert([newNoteData]);
        
      if (error) throw error;
      
      toast.success('Not başarıyla eklendi');
      setNote('');
      setPromiseDate('');
      setIsExpanded(false);
      
      // Refresh parent component data if callback provided
      if (typeof refreshData === 'function') {
        refreshData();
      }
    } catch (error) {
      console.error('Not ekleme hatası:', error);
      toast.error('Not eklenirken bir hata oluştu');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="quick-note-component" style={{ marginTop: '10px' }}>
      {!isExpanded ? (
        <button
          onClick={() => setIsExpanded(true)}
          className="btn btn-primary"
          style={{ padding: '4px 8px', fontSize: '12px' }}
        >
          Not Ekle
        </button>
      ) : (
        <div style={{ 
          border: '1px solid #ddd', 
          borderRadius: '4px', 
          padding: '10px',
          backgroundColor: '#f9f9f9'
        }}>
          <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>
            {customerName} için hızlı not ekle:
          </div>
          
          <form onSubmit={handleSubmitNote}>
            <div style={{ marginBottom: '8px' }}>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Not içeriği..."
                style={{ 
                  width: '100%', 
                  padding: '6px', 
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  minHeight: '60px'
                }}
              ></textarea>
            </div>
            
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '3px' }}>
                Söz Verilen Ödeme Tarihi (Opsiyonel):
              </label>
              <input
                type="date"
                value={promiseDate}
                onChange={(e) => setPromiseDate(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '6px', 
                  borderRadius: '4px',
                  border: '1px solid #ddd'
                }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="submit"
                disabled={isSubmitting || !note.trim()}
                className="btn btn-success"
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                {isSubmitting ? 'Ekleniyor...' : 'Kaydet'}
              </button>
              
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="btn"
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default QuickNoteComponent;