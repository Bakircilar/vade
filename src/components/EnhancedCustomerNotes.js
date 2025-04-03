// src/components/EnhancedCustomerNotes.js - ENHANCED with automatic reminders
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';
import { format, addDays, addWeeks, addMonths } from 'date-fns';
import { tr } from 'date-fns/locale';

// Not şablonları
const NOTE_TEMPLATES = [
  { id: 'payment_promise', label: 'Ödeme Sözü', content: 'Müşteri, [TARIH] tarihinde ödeme yapacağını söz verdi.' },
  { id: 'postpone_request', label: 'Erteleme Talebi', content: 'Müşteri, ödeme tarihinin [TARIH] tarihine ertelenmesini talep etti.' },
  { id: 'partial_payment', label: 'Kısmi Ödeme', content: 'Müşteri, [TUTAR] TL tutarında kısmi ödeme yapacağını belirtti.' },
  { id: 'no_response', label: 'Yanıt Yok', content: 'Müşteri ile iletişime geçildi ancak yanıt alınamadı.' },
  { id: 'call_later', label: 'Daha Sonra Ara', content: 'Müşteri, [TARIH] tarihinde tekrar aranmak üzere not düşüldü.' }
];

// Not etiketleri
const NOTE_TAGS = [
  { id: 'promise', label: 'Söz Verdi', color: '#2ecc71' },
  { id: 'postpone', label: 'Erteleme', color: '#f39c12' },
  { id: 'no_response', label: 'Yanıt Yok', color: '#e74c3c' },
  { id: 'follow_up', label: 'Takip Et', color: '#3498db' },
  { id: 'partial', label: 'Kısmi Ödeme', color: '#9b59b6' },
  { id: 'other', label: 'Diğer', color: '#95a5a6' }
];

// Söz verilen tarihin bir iş günü öncesini hesaplama işlevi
const getBusinessDayBefore = (dateString) => {
  if (!dateString) return null;
  
  try {
    const date = new Date(dateString);
    
    // Tarihi bir gün geriye al
    date.setDate(date.getDate() - 1);
    
    // Eğer pazar günüyse, cuma gününe ayarla (2 gün geri)
    if (date.getDay() === 0) { // 0 = Pazar
      date.setDate(date.getDate() - 2);
    }
    // Eğer cumartesi günüyse, cuma gününe ayarla (1 gün geri)
    else if (date.getDay() === 6) { // 6 = Cumartesi
      date.setDate(date.getDate() - 1);
    }
    
    // ISO formatında dön
    return format(date, 'yyyy-MM-dd');
  } catch (error) {
    console.error('Tarih dönüştürme hatası:', error);
    return null;
  }
};

const EnhancedCustomerNotes = ({ customerId, customerName, pastDueBalance, notDueBalance, totalBalance }) => {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Not girişi state'leri
  const [newNote, setNewNote] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [promiseDate, setPromiseDate] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [reminderType, setReminderType] = useState('none');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [editorMode, setEditorMode] = useState('basic'); // basic veya advanced
  
  // Not düzenleme state'i
  const [editingNote, setEditingNote] = useState(null);

  // Notları getir
  useEffect(() => {
    if (customerId) {
      fetchNotes();
    }
  }, [customerId]);

  // Müşteri notlarını getir - BUG FIX: Tamamen yeniden yazıldı, daha sağlam hata yönetimi
  const fetchNotes = async () => {
    setLoading(true);
    try {
      console.log("Notlar yükleniyor, Müşteri ID:", customerId);
      
      // Hata işleme ve loglama daha ayrıntılı
      const { data, error } = await supabase
        .from('customer_notes')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Not verisi çekilirken hata:", error);
        throw error;
      }
      
      if (!data || data.length === 0) {
        console.log("Bu müşteri için not bulunamadı");
        setNotes([]);
        return;
      }
      
      console.log(`${data.length} not bulundu`);
      
      // Kullanıcı bilgilerini toplu olarak getirmeye çalış
      // Önce tüm user_id'leri topla
      const userIds = data
        .filter(note => note.user_id)
        .map(note => note.user_id);
        
      // Benzersiz user_id'leri al
      const uniqueUserIds = [...new Set(userIds)];
      
      // Kullanıcı ismi eşleştirme tablosu
      const userNameMap = {};
      
      // Eğer kullanıcı ID'si varsa, toplu olarak kullanıcı bilgilerini getir
      if (uniqueUserIds.length > 0) {
        try {
          const { data: userData, error: userError } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', uniqueUserIds);
            
          if (!userError && userData) {
            // İsim eşleştirme tablosu oluştur
            userData.forEach(user => {
              userNameMap[user.id] = user.full_name || 'Kullanıcı';
            });
            console.log("Kullanıcı isimleri yüklendi");
          } else {
            console.warn("Kullanıcı bilgileri çekilemedi:", userError);
          }
        } catch (e) {
          console.warn("Kullanıcı bilgileri getirme hatası:", e);
        }
      }
      
      // Her nota kullanıcı ismi ekle
      const notesWithUserNames = data.map(note => {
        // Kullanıcı ID'si varsa ve ismi bulunabiliyorsa ekle, yoksa varsayılan isim kullan
        const userName = note.user_id && userNameMap[note.user_id] 
                        ? userNameMap[note.user_id] 
                        : 'Kullanıcı';
                        
        return {
          ...note,
          user_name: userName
        };
      });
      
      setNotes(notesWithUserNames);
      console.log("Notlar başarıyla yüklendi");
    } catch (error) {
      console.error('Notlar yüklenirken hata:', error);
      toast.error(`Notlar yüklenirken bir hata oluştu: ${error.message || error}`);
      // Hata durumunda boş bir dizi ayarla
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  // Not şablonu seçildiğinde
  const handleTemplateChange = (e) => {
    const templateId = e.target.value;
    setSelectedTemplate(templateId);
    
    if (templateId) {
      const template = NOTE_TEMPLATES.find(t => t.id === templateId);
      if (template) {
        setNewNote(template.content);
        
        // Şablon türüne göre uygun etiketi otomatik seç
        let tagToSelect = '';
        switch(templateId) {
          case 'payment_promise':
            tagToSelect = 'promise';
            break;
          case 'postpone_request':
            tagToSelect = 'postpone';
            break;
          case 'partial_payment':
            tagToSelect = 'partial';
            break;
          case 'no_response':
            tagToSelect = 'no_response';
            break;
          case 'call_later':
            tagToSelect = 'follow_up';
            break;
          default:
            tagToSelect = '';
        }
        
        if (tagToSelect) {
          setSelectedTags([tagToSelect]);
        }
      }
    }
  };

  // Not içeriğini değiştir
  const handleNoteChange = (e) => {
    setNewNote(e.target.value);
  };

  // Etiket seç/kaldır
  const toggleTag = (tagId) => {
    if (selectedTags.includes(tagId)) {
      setSelectedTags(selectedTags.filter(id => id !== tagId));
    } else {
      setSelectedTags([...selectedTags, tagId]);
    }
  };

  // Hatırlatıcı türü değiştiğinde
  const handleReminderTypeChange = (e) => {
    const type = e.target.value;
    setReminderType(type);
    
    // Eğer hatırlatıcı seçildiyse, uygun tarihi otomatik ayarla
    if (type !== 'none') {
      const today = new Date();
      let reminderDate;
      
      switch(type) {
        case 'tomorrow':
          reminderDate = addDays(today, 1);
          break;
        case 'next_week':
          reminderDate = addWeeks(today, 1);
          break;
        case 'next_month':
          reminderDate = addMonths(today, 1);
          break;
        case 'custom':
          reminderDate = addDays(today, 3); // Varsayılan olarak 3 gün sonra
          break;
        default:
          reminderDate = today;
      }
      
      setReminderDate(format(reminderDate, 'yyyy-MM-dd'));
      setReminderNote('Müşteri ile görüşme');
    } else {
      setReminderDate('');
      setReminderNote('');
    }
  };

  // Not ekle - BUG FİX: Düzeltilmiş
  const handleSubmitNote = async (e) => {
    e.preventDefault();
    
    if (!newNote.trim()) {
      toast.warning('Not içeriği boş olamaz');
      return;
    }
    
    setSubmitting(true);
    try {
      console.log("Not ekleme başlatıldı");
      console.log("Bakiye değerleri:", { pastDueBalance, notDueBalance, totalBalance });
      
      // Bakiye değerlerini güvenli bir şekilde sayıya dönüştür
      const safePastDueBalance = typeof pastDueBalance === 'number' ? pastDueBalance : 
                               parseFloat(String(pastDueBalance || '0').replace(/[^\d.-]/g, '')) || 0;
                               
      // Basit not verisi oluştur - en kritik ve gerekli alanları içerir
      const simpleNoteData = {
        customer_id: customerId,
        note_content: newNote.trim(),
        created_at: new Date().toISOString(),
        // Burada sadece balance_at_time alanını kullanıyoruz, diğer alanlar yerine
        balance_at_time: safePastDueBalance
      };
      
      // Opsiyonel alanları ekle - hataya neden olabilecek alanları kontrol et ve ekle
      if (promiseDate) {
        simpleNoteData.promise_date = promiseDate;
        
        // Eğer söz verilen ödeme tarihi varsa ve hatırlatıcı seçilmemişse
        // otomatik olarak bir iş günü öncesine hatırlatıcı ekle
        if (reminderType === 'none') {
          const reminderDay = getBusinessDayBefore(promiseDate);
          if (reminderDay) {
            simpleNoteData.reminder_date = reminderDay;
            simpleNoteData.reminder_note = `${customerName || 'Müşteri'} için yarın ödeme günü`;
            simpleNoteData.reminder_completed = false;
          }
        }
      }
      
      if (selectedTags && selectedTags.length > 0) {
        simpleNoteData.tags = selectedTags;
      }
      
      // Hatırlatıcı bilgilerini ekle
      if (reminderType !== 'none' && reminderDate) {
        simpleNoteData.reminder_date = reminderDate;
        if (reminderNote) {
          simpleNoteData.reminder_note = reminderNote;
        }
        simpleNoteData.reminder_completed = false;
      }
      
      // Güncel kullanıcı oturumunu al
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.id) {
          simpleNoteData.user_id = user.id;
          console.log("Kullanıcı ID'si eklendi:", user.id);
        }
      } catch (userError) {
        console.warn("Kullanıcı bilgisi alınamadı, not anonim olarak eklenecek:", userError.message);
      }
      
      console.log("Eklenecek not verisi:", simpleNoteData);
      
      if (editingNote) {
        // Mevcut notu güncelle
        console.log(`Not güncelleniyor (ID: ${editingNote.id})...`);
        const { error } = await supabase
          .from('customer_notes')
          .update(simpleNoteData)
          .eq('id', editingNote.id);
          
        if (error) {
          console.error('Not güncelleme hatası:', error);
          throw new Error(`Not güncellenirken hata: ${error.message}`);
        }
        
        toast.success('Not başarıyla güncellendi');
      } else {
        // Yeni not ekle
        console.log("Yeni not ekleniyor...");
        const { data, error } = await supabase
          .from('customer_notes')
          .insert([simpleNoteData])
          .select();
          
        if (error) {
          console.error('Not ekleme hatası:', error);
          throw new Error(`Not eklenirken hata: ${error.message}`);
        }
        
        console.log("Not başarıyla eklendi:", data);
        toast.success('Not başarıyla eklendi');
      }
      
      // Hatırlatıcı için bildirim oluşturma işlemi
      // Eğer hatırlatıcı varsa bildirim oluştur
      if ((reminderType !== 'none' && reminderDate && simpleNoteData.user_id) || 
          (promiseDate && reminderType === 'none' && simpleNoteData.reminder_date)) {
        try {
          console.log("Hatırlatıcı bildirimi oluşturuluyor...");
          const notification = {
            user_id: simpleNoteData.user_id,
            customer_id: customerId,
            type: 'note_reminder',
            title: `${customerName || 'Müşteri'} için hatırlatıcı`,
            message: simpleNoteData.reminder_note || 'Müşteri görüşmesi hatırlatıcısı',
            link: `/customers/${customerId}`,
            is_read: false,
            created_at: new Date().toISOString()
          };
          
          const { error: notifError } = await supabase
            .from('notifications')
            .insert([notification]);
            
          if (notifError) {
            console.warn('Hatırlatıcı bildirimi oluşturma hatası:', notifError);
            // Bildirim hatası not eklemeyi etkilemez
          } else {
            console.log("Hatırlatıcı bildirimi eklendi");
          }
        } catch (notifError) {
          console.warn('Bildirim oluşturma hatası:', notifError);
          // Bildirim hatası not eklemeyi etkilemez
        }
      }
      
      // Formu sıfırla
      resetForm();
      
      // Notları yenile
      fetchNotes();
    } catch (error) {
      console.error('Not ekleme/güncelleme işlemi başarısız:', error);
      toast.error(`Not eklenirken bir hata oluştu: ${error.message}`);
    } finally {
      setSubmitting(false);
      setEditingNote(null);
    }
  };

  // Not düzenleme için formu ayarla
  const handleEditNote = (note) => {
    setEditingNote(note);
    setNewNote(note.note_content);
    setPromiseDate(note.promise_date || '');
    setSelectedTags(note.tags || []);
    
    if (note.reminder_date) {
      setReminderType('custom');
      setReminderDate(note.reminder_date);
      setReminderNote(note.reminder_note || '');
    } else {
      setReminderType('none');
      setReminderDate('');
      setReminderNote('');
    }
    
    // Gelişmiş editör modunu aç
    setEditorMode('advanced');
    
    // Form alanına scroll
    document.getElementById('noteForm').scrollIntoView({ behavior: 'smooth' });
  };

  // Formu sıfırla
  const resetForm = () => {
    setNewNote('');
    setSelectedTemplate('');
    setPromiseDate('');
    setSelectedTags([]);
    setReminderType('none');
    setReminderDate('');
    setReminderNote('');
    setEditingNote(null);
    setEditorMode('basic');
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

  // Para birimi formatla
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

  // Hatırlatıcıyı tamamlandı olarak işaretle
  const markReminderAsCompleted = async (noteId) => {
    try {
      const { error } = await supabase
        .from('customer_notes')
        .update({ reminder_completed: true })
        .eq('id', noteId);
        
      if (error) throw error;
      
      // Notları yenile
      fetchNotes();
      toast.success('Hatırlatıcı tamamlandı olarak işaretlendi');
    } catch (error) {
      console.error('Hatırlatıcı güncelleme hatası:', error);
      toast.error('Hatırlatıcı güncellenirken bir hata oluştu');
    }
  };

  return (
    <div className="card" style={{ marginTop: '20px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
        Müşteri Notları ve İletişim Takibi
      </h2>
      
      {/* Not Ekleme Formu */}
      <form id="noteForm" onSubmit={handleSubmitNote} style={{ marginBottom: '20px' }}>
        {/* Temel/Gelişmiş mod geçişi */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
          <button
            type="button"
            onClick={() => setEditorMode(editorMode === 'basic' ? 'advanced' : 'basic')}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#3498db', 
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {editorMode === 'basic' ? 'Gelişmiş Mod' : 'Temel Mod'}
          </button>
        </div>
        
        {/* Şablon seçimi - Temel ve Gelişmiş modda göster */}
        <div className="form-group">
          <label htmlFor="templateSelect">Not Şablonu</label>
          <select
            id="templateSelect"
            value={selectedTemplate}
            onChange={handleTemplateChange}
            style={{ 
              width: '100%', 
              padding: '8px', 
              border: '1px solid #ddd', 
              borderRadius: '4px',
              marginBottom: '10px'
            }}
          >
            <option value="">Şablon Seçin (Opsiyonel)</option>
            {NOTE_TEMPLATES.map(template => (
              <option key={template.id} value={template.id}>{template.label}</option>
            ))}
          </select>
        </div>
        
        {/* Not içeriği */}
        <div className="form-group">
          <label htmlFor="noteContent">Not İçeriği</label>
          <textarea
            id="noteContent"
            value={newNote}
            onChange={handleNoteChange}
            className="form-control"
            rows={editorMode === 'advanced' ? 5 : 3}
            style={{ 
              width: '100%', 
              padding: '8px', 
              border: '1px solid #ddd', 
              borderRadius: '4px',
              marginBottom: '10px',
              fontFamily: 'inherit'
            }}
            placeholder="Müşteri ile ilgili notunuzu buraya yazın..."
          ></textarea>
        </div>
        
        {/* Etiketler */}
        {editorMode === 'advanced' && (
          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Etiketler</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {NOTE_TAGS.map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  style={{ 
                    padding: '5px 10px', 
                    backgroundColor: selectedTags.includes(tag.id) ? tag.color : '#f1f1f1',
                    color: selectedTags.includes(tag.id) ? 'white' : '#333',
                    border: 'none',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Vade Tarihi - Her iki modda da göster */}
        <div className="form-group">
          <label htmlFor="promiseDate">Söz Verilen Ödeme Tarihi (Opsiyonel)</label>
          <input
            type="date"
            id="promiseDate"
            value={promiseDate}
            onChange={(e) => {
              const newDate = e.target.value;
              setPromiseDate(newDate);
              
              // Otomatik hatırlatıcı oluştur (sadece tarih seçildiğinde ve hatırlatıcı yoksa)
              if (newDate && reminderType === 'none') {
                const reminderDay = getBusinessDayBefore(newDate);
                if (reminderDay) {
                  setReminderType('custom');
                  setReminderDate(reminderDay);
                  setReminderNote(`${customerName || 'Müşteri'} için yarın ödeme günü`);
                }
              }
            }}
            className="form-control"
            style={{ 
              width: '100%', 
              padding: '8px', 
              border: '1px solid #ddd', 
              borderRadius: '4px',
              marginBottom: '10px'
            }}
          />
        </div>
        
        {/* Gelişmiş mod - Hatırlatıcı Ayarları */}
        {editorMode === 'advanced' && (
          <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px', marginBottom: '15px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
              Hatırlatıcı Ayarları
            </h3>
            
            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label htmlFor="reminderType">Hatırlatıcı Zamanı</label>
              <select
                id="reminderType"
                value={reminderType}
                onChange={handleReminderTypeChange}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px'
                }}
              >
                <option value="none">Hatırlatıcı Yok</option>
                <option value="tomorrow">Yarın</option>
                <option value="next_week">Gelecek Hafta</option>
                <option value="next_month">Gelecek Ay</option>
                <option value="custom">Özel Tarih</option>
              </select>
            </div>
            
            {reminderType !== 'none' && (
              <>
                {reminderType === 'custom' && (
                  <div className="form-group" style={{ marginBottom: '10px' }}>
                    <label htmlFor="reminderDate">Hatırlatıcı Tarihi</label>
                    <input
                      type="date"
                      id="reminderDate"
                      value={reminderDate}
                      onChange={(e) => setReminderDate(e.target.value)}
                      style={{ 
                        width: '100%', 
                        padding: '8px', 
                        border: '1px solid #ddd', 
                        borderRadius: '4px'
                      }}
                      min={format(new Date(), 'yyyy-MM-dd')}
                    />
                  </div>
                )}
                
                <div className="form-group">
                  <label htmlFor="reminderNote">Hatırlatıcı Notu</label>
                  <input
                    type="text"
                    id="reminderNote"
                    value={reminderNote}
                    onChange={(e) => setReminderNote(e.target.value)}
                    style={{ 
                      width: '100%', 
                      padding: '8px', 
                      border: '1px solid #ddd', 
                      borderRadius: '4px'
                    }}
                    placeholder="Hatırlatıcı için kısa not..."
                  />
                </div>
              </>
            )}
          </div>
        )}
        
        {/* Gönder butonu */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="submit"
            disabled={submitting || !newNote.trim()}
            className="btn btn-primary"
            style={{ marginTop: '10px' }}
          >
            {submitting ? 'Kaydediliyor...' : editingNote ? 'Notu Güncelle' : 'Not Ekle'}
          </button>
          
          {editingNote && (
            <button
              type="button"
              onClick={resetForm}
              className="btn"
              style={{ marginTop: '10px' }}
            >
              İptal
            </button>
          )}
        </div>
      </form>
      
      {/* Divider */}
      <hr style={{ margin: '20px 0', borderTop: '1px solid #eee' }} />
      
      {/* Notlar Listesi */}
      <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>
        Geçmiş Notlar
      </h3>
      
      {loading ? (
        <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
          Notlar yükleniyor...
        </p>
      ) : notes.length > 0 ? (
        <div>
          {notes.map((note) => {
            // Not için etiketleri bul
            const noteTags = note.tags ? note.tags.map(tagId => 
              NOTE_TAGS.find(tag => tag.id === tagId)
            ).filter(Boolean) : [];
            
            // Hatırlatıcı durumunu kontrol et
            const hasReminder = note.reminder_date !== null;
            const isReminderActive = hasReminder && !note.reminder_completed;
            const isReminderDue = isReminderActive && new Date(note.reminder_date) <= new Date();
            
            return (
              <div 
                key={note.id} 
                className="card" 
                style={{ 
                  marginBottom: '15px', 
                  padding: '15px',
                  backgroundColor: isReminderDue ? '#fff3cd' : '#f9f9f9',
                  border: '1px solid #eee',
                  borderRadius: '4px'
                }}
              >
                <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 'bold', color: '#666' }}>
                    {note.user_name || 'Kullanıcı'} | {formatDate(note.created_at)}
                  </span>
                  
                  <div>
                    <button
                      onClick={() => handleEditNote(note)}
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: '#3498db', 
                        cursor: 'pointer',
                        marginRight: '10px',
                        fontSize: '14px'
                      }}
                    >
                      Düzenle
                    </button>
                  </div>
                </div>
                
                {/* Not İçeriği */}
                <p style={{ margin: '0 0 10px 0', whiteSpace: 'pre-wrap' }}>{note.note_content}</p>
                
                {/* Etiketler */}
                {noteTags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
                    {noteTags.map(tag => (
                      <span 
                        key={tag.id} 
                        style={{ 
                          backgroundColor: tag.color, 
                          color: 'white', 
                          padding: '3px 8px', 
                          borderRadius: '12px', 
                          fontSize: '12px', 
                          fontWeight: 'bold' 
                        }}
                      >
                        {tag.label}
                      </span>
                    ))}
                  </div>
                )}
                
                {/* Söz Verilen Ödeme Tarihi */}
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
                
                {/* Hatırlatıcı */}
                {hasReminder && (
                  <div style={{ 
                    marginTop: '10px',
                    padding: '10px',
                    backgroundColor: note.reminder_completed ? '#e8f5e9' : (isReminderDue ? '#fff3cd' : '#e3f2fd'),
                    borderRadius: '4px',
                    fontSize: '13px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>
                          {note.reminder_completed ? '✓ Tamamlanan Hatırlatıcı' : 'Hatırlatıcı'}:
                        </strong> {formatDate(note.reminder_date)}
                        {note.reminder_note && <div style={{ marginTop: '5px' }}>{note.reminder_note}</div>}
                      </div>
                      
                      {isReminderActive && (
                        <button
                          onClick={() => markReminderAsCompleted(note.id)}
                          className="btn btn-success"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                        >
                          Tamamlandı
                        </button>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Bakiye Bilgileri */}
                <div style={{ marginTop: '10px' }}>
                  {note.balance_at_time !== null && note.balance_at_time !== undefined && (
                    <div style={{ 
                      padding: '8px', 
                      backgroundColor: '#f8fafc', 
                      borderRadius: '4px',
                      border: '1px solid #e2e8f0'
                    }}>
                      <div style={{ fontSize: '12px', color: '#475569' }}>Not Eklendiğindeki Bakiye:</div>
                      <div style={{ fontWeight: 'bold' }}>
                        {formatCurrency(note.balance_at_time)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
          Bu müşteri için henüz not girilmemiş
        </p>
      )}
    </div>
  );
};

export default EnhancedCustomerNotes;