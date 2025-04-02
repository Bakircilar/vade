// src/pages/NotesReport.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';
import { format, subDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { useUserAccess } from '../helpers/userAccess';
import * as XLSX from 'xlsx';

const NotesReport = () => {
  // Rapor tipi (notlar veya sektör)
  const [reportType, setReportType] = useState('notes');
  
  // Not raporu için state
  const [recentNotes, setRecentNotes] = useState([]);
  const [dateRange, setDateRange] = useState(7); // Son 7 gün
  const [noteUsers, setNoteUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('all');
  
  // Sektör raporu için state
  const [sectors, setSectors] = useState([]);
  const [selectedSector, setSelectedSector] = useState('');
  const [sectorCustomers, setSectorCustomers] = useState([]);
  const [expandedCustomers, setExpandedCustomers] = useState({});
  
  // Genel state
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState(null);
  
  // User access control
  const { isAdmin, isMuhasebe, loading: accessLoading } = useUserAccess();

  // İlk yükleme kontrolü - Access loading tamam olduğunda kontrol et
  useEffect(() => {
    if (!accessLoading) {
      // Rol kontrolü
      if (!isAdmin && !isMuhasebe) {
        setAccessDenied(true);
        return;
      }
      
      // Sektörleri yükle
      fetchSectors();
      
      // Not giren kullanıcıları yükle
      fetchNoteUsers();
    }
  }, [isAdmin, isMuhasebe, accessLoading]);

  // Seçili rapor ve filtrelere göre verileri getir
  useEffect(() => {
    if (accessDenied || accessLoading) return;
    
    // Seçili rapor tipine göre veri yükle
    if (reportType === 'notes') {
      fetchRecentNotes();
    } else if (reportType === 'sector' && selectedSector) {
      fetchSectorCustomers();
    }
  }, [reportType, dateRange, selectedUser, selectedSector, accessDenied, accessLoading]);

  // Sektörleri getir
  const fetchSectors = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('sector_code')
        .not('sector_code', 'is', null);
        
      if (error) throw error;
      
      // Benzersiz sektörleri filtrele ve sırala
      const uniqueSectors = [...new Set(data.map(item => item.sector_code))]
        .filter(Boolean)
        .sort();
        
      setSectors(uniqueSectors);
    } catch (error) {
      console.error('Sektör yükleme hatası:', error);
      setError('Sektörler yüklenirken bir hata oluştu');
    }
  };
  
  // Not giren kullanıcıları getir
  const fetchNoteUsers = async () => {
    try {
      // customer_notes tablosunun var olup olmadığını kontrol et
      const { count, error: tableError } = await supabase
        .from('customer_notes')
        .select('*', { count: 'exact', head: true });
        
      if (tableError) {
        console.error('customer_notes tablosu bulunamadı:', tableError);
        setError('Not tablosu bulunamadı veya erişilemedi');
        return;
      }
    
      const { data, error } = await supabase
        .from('customer_notes')
        .select('user_id')
        .not('user_id', 'is', null);
        
      if (error) throw error;
      
      // Benzersiz kullanıcı ID'lerini al
      const uniqueUserIds = [...new Set(data.map(item => item.user_id))].filter(Boolean);
      
      if (uniqueUserIds.length > 0) {
        // Bu kullanıcıların profillerini getir
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', uniqueUserIds);
          
        if (profilesError) throw profilesError;
        
        setNoteUsers(profiles || []);
      }
    } catch (error) {
      console.error('Kullanıcı yükleme hatası:', error);
      setError('Kullanıcılar yüklenirken bir hata oluştu');
    }
  };
  
  // Son notları getir
  const fetchRecentNotes = async () => {
    if (accessDenied) return;
    
    setLoading(true);
    setError(null);
    try {
      // Son X gün için tarih aralığını hesapla
      const endDate = new Date();
      const startDate = subDays(new Date(), dateRange);
      
      // customer_notes tablosunun var olup olmadığını kontrol et
      const { count, error: tableError } = await supabase
        .from('customer_notes')
        .select('*', { count: 'exact', head: true });
        
      if (tableError) {
        console.error('customer_notes tablosu bulunamadı:', tableError);
        setError('Not tablosu bulunamadı veya erişilemedi');
        setRecentNotes([]);
        return;
      }
      
      // Notları getir - customers tablosu join ile
      let query = supabase
        .from('customer_notes')
        .select(`
          *,
          customers:customer_id (id, name, code, sector_code)
        `)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false });
      
      // Kullanıcı filtresi
      if (selectedUser !== 'all') {
        query = query.eq('user_id', selectedUser);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Kullanıcı bilgilerini getir
      let notesWithUserInfo = [];
      
      if (data && data.length > 0) {
        // Kullanıcı ID'lerini topla
        const userIds = data
          .filter(note => note.user_id)
          .map(note => note.user_id);
        
        const uniqueUserIds = [...new Set(userIds)];
        
        // Kullanıcı bilgilerini getir
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', uniqueUserIds);
          
        if (profilesError) throw profilesError;
        
        // Kullanıcı bilgilerini notlara ekle
        notesWithUserInfo = data.map(note => {
          const userProfile = profiles?.find(profile => profile.id === note.user_id);
          return {
            ...note,
            profiles: userProfile || null
          };
        });
      }
      
      setRecentNotes(notesWithUserInfo);
    } catch (error) {
      console.error('Not yükleme hatası:', error);
      setError('Notlar yüklenirken bir hata oluştu');
      setRecentNotes([]);
    } finally {
      setLoading(false);
    }
  };
  
  // Sektöre göre müşterileri getir
  const fetchSectorCustomers = async () => {
    if (!selectedSector || accessDenied) return;
    
    setLoading(true);
    setError(null);
    try {
      // Seçili sektördeki tüm müşterileri getir
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('id, name, code')
        .eq('sector_code', selectedSector)
        .order('name');
        
      if (customersError) throw customersError;
      
      // Her müşteri için notları getir
      const customersWithNotes = [];
      
      for (const customer of customers || []) {
        const { data: notes, error: notesError } = await supabase
          .from('customer_notes')
          .select(`
            *,
            profiles:user_id (id, full_name)
          `)
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false })
          .limit(100); // Her müşteri için en fazla 100 not
          
        if (notesError && notesError.code !== 'PGRST116') {
          console.error(`${customer.id} ID'li müşteri için notlar alınamadı:`, notesError);
        }
        
        customersWithNotes.push({
          ...customer,
          notes: notes || [],
          noteCount: notes ? notes.length : 0,
          latestNote: notes && notes.length > 0 ? notes[0] : null
        });
      }
      
      // Not sayısına göre sırala (çoktan aza)
      customersWithNotes.sort((a, b) => b.noteCount - a.noteCount);
      
      setSectorCustomers(customersWithNotes);
    } catch (error) {
      console.error('Sektör müşterileri yükleme hatası:', error);
      setError('Sektör müşterileri yüklenirken bir hata oluştu');
      setSectorCustomers([]);
    } finally {
      setLoading(false);
    }
  };
  
  // Bir müşteriyi genişlet/daralt
  const toggleCustomerExpand = (customerId) => {
    setExpandedCustomers(prev => ({
      ...prev,
      [customerId]: !prev[customerId]
    }));
  };
  
  // Tarihi formatla
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd MMM yyyy HH:mm', { locale: tr });
    } catch (error) {
      return dateString;
    }
  };
  
  // Excel'e aktar - Not Raporu
  const exportNotesReport = () => {
    setExporting(true);
    try {
      // Veri yoksa uyarı göster
      if (recentNotes.length === 0) {
        toast.warning('Dışa aktarılacak not bulunamadı');
        return;
      }
      
      // Excel için veriyi hazırla
      const excelData = recentNotes.map(note => ({
        'Tarih': note.created_at ? formatDate(note.created_at) : '-',
        'Müşteri Kodu': note.customers?.code || '-',
        'Müşteri Adı': note.customers?.name || '-',
        'Sektör': note.customers?.sector_code || '-',
        'Not Giren': note.profiles?.full_name || '-',
        'Not İçeriği': note.note_content || '-',
        'Vade Tarihi': note.promise_date ? formatDate(note.promise_date) : '-',
        'Bakiye': note.balance_at_time !== null ? note.balance_at_time : '-'
      }));
      
      // Excel oluştur
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Not Raporu');
      
      // Sütun genişliklerini ayarla
      const maxWidth = excelData.reduce((w, r) => Math.max(w, r['Müşteri Adı']?.length || 0), 10);
      worksheet['!cols'] = [
        { wch: 18 }, // Tarih
        { wch: 15 }, // Müşteri Kodu
        { wch: maxWidth }, // Müşteri Adı
        { wch: 15 }, // Sektör
        { wch: 15 }, // Not Giren
        { wch: 50 }, // Not İçeriği
        { wch: 15 }, // Vade Tarihi
        { wch: 15 }  // Bakiye
      ];
      
      // Excel dosyasını indir
      XLSX.writeFile(workbook, `not-raporu-${new Date().toISOString().slice(0,10)}.xlsx`);
      
      toast.success('Not raporu başarıyla indirildi');
    } catch (error) {
      console.error('Excel dışa aktarma hatası:', error);
      toast.error('Excel dosyası oluşturulurken bir hata oluştu');
    } finally {
      setExporting(false);
    }
  };
  
  // Excel'e aktar - Sektör Raporu
  const exportSectorReport = () => {
    setExporting(true);
    try {
      // Veri yoksa uyarı göster
      if (sectorCustomers.length === 0) {
        toast.warning('Dışa aktarılacak müşteri bulunamadı');
        return;
      }
      
      // Excel için veriyi hazırla - Her müşteri ve notu ayrı satır olarak
      const excelData = [];
      
      sectorCustomers.forEach(customer => {
        // Müşterinin notları yoksa, sadece müşteri bilgilerini ekle
        if (customer.notes.length === 0) {
          excelData.push({
            'Müşteri Kodu': customer.code || '-',
            'Müşteri Adı': customer.name || '-',
            'Not Sayısı': 0,
            'Not Tarihi': '-',
            'Not İçeriği': 'Not bulunamadı',
            'Not Giren': '-',
            'Vade Tarihi': '-',
            'Bakiye': '-'
          });
        } else {
          // Her not için bir satır ekle
          customer.notes.forEach((note, index) => {
            excelData.push({
              'Müşteri Kodu': customer.code || '-',
              'Müşteri Adı': customer.name || '-',
              'Not Sayısı': customer.noteCount,
              'Not Tarihi': note.created_at ? formatDate(note.created_at) : '-',
              'Not İçeriği': note.note_content || '-',
              'Not Giren': note.profiles?.full_name || '-',
              'Vade Tarihi': note.promise_date ? formatDate(note.promise_date) : '-',
              'Bakiye': note.balance_at_time !== null ? note.balance_at_time : '-'
            });
          });
        }
      });
      
      // Excel oluştur
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sektör Raporu');
      
      // Sütun genişliklerini ayarla
      const maxWidth = excelData.reduce((w, r) => Math.max(w, r['Müşteri Adı']?.length || 0), 10);
      worksheet['!cols'] = [
        { wch: 15 }, // Müşteri Kodu
        { wch: maxWidth }, // Müşteri Adı
        { wch: 10 }, // Not Sayısı
        { wch: 18 }, // Not Tarihi
        { wch: 50 }, // Not İçeriği
        { wch: 15 }, // Not Giren
        { wch: 15 }, // Vade Tarihi
        { wch: 15 }  // Bakiye
      ];
      
      // Excel dosyasını indir
      const sectorName = selectedSector.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      XLSX.writeFile(workbook, `sektor-raporu-${sectorName}-${new Date().toISOString().slice(0,10)}.xlsx`);
      
      toast.success('Sektör raporu başarıyla indirildi');
    } catch (error) {
      console.error('Excel dışa aktarma hatası:', error);
      toast.error('Excel dosyası oluşturulurken bir hata oluştu');
    } finally {
      setExporting(false);
    }
  };
  
  // Admin değilse erişimi engelle
  if (accessDenied) {
    return (
      <div className="card">
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
          Erişim Engellendi
        </h2>
        <p>Bu sayfaya erişmek için yönetici veya muhasebe yetkileri gerekiyor.</p>
      </div>
    );
  }
  
  // Yükleniyor durumu
  if (accessLoading) {
    return (
      <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
          Yükleniyor...
        </h2>
        <p>Lütfen bekleyin, kullanıcı hakları kontrol ediliyor.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        Not ve Sektör Raporları
      </h1>
      
      {/* Hata mesajı */}
      {error && (
        <div className="card" style={{ padding: '15px', marginBottom: '20px', backgroundColor: '#f8d7da', color: '#721c24' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
            Hata Oluştu
          </h3>
          <p>{error}</p>
          <button 
            onClick={() => {
              setError(null);
              if (reportType === 'notes') {
                fetchRecentNotes();
              } else if (reportType === 'sector' && selectedSector) {
                fetchSectorCustomers();
              }
            }} 
            className="btn btn-danger"
            style={{ marginTop: '10px' }}
          >
            Yeniden Dene
          </button>
        </div>
      )}
      
      {/* Rapor Tipi Seçimi */}
      <div className="card" style={{ marginBottom: '20px', padding: '15px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
          Rapor Tipi
        </h3>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setReportType('notes')}
            className={`btn ${reportType === 'notes' ? 'btn-primary' : ''}`}
          >
            Tüm Notlar Raporu
          </button>
          
          <button 
            onClick={() => setReportType('sector')}
            className={`btn ${reportType === 'sector' ? 'btn-primary' : ''}`}
          >
            Sektör Bazlı Raporlar
          </button>
        </div>
      </div>
      
      {/* Notlar Raporu */}
      {reportType === 'notes' && (
        <div>
          <div className="card" style={{ marginBottom: '20px', padding: '15px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
              Not Raporu Filtreleri
            </h3>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '15px' }}>
              <div style={{ minWidth: '200px' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>Tarih Aralığı:</label>
                <select 
                  value={dateRange} 
                  onChange={(e) => setDateRange(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                >
                  <option value={1}>Son 1 Gün</option>
                  <option value={7}>Son 7 Gün</option>
                  <option value={30}>Son 30 Gün</option>
                  <option value={90}>Son 90 Gün</option>
                </select>
              </div>
              
              <div style={{ minWidth: '200px' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>Not Giren:</label>
                <select 
                  value={selectedUser} 
                  onChange={(e) => setSelectedUser(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                >
                  <option value="all">Tüm Kullanıcılar</option>
                  {noteUsers.map(user => (
                    <option key={user.id} value={user.id}>{user.full_name || 'İsimsiz Kullanıcı'}</option>
                  ))}
                </select>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button 
                  onClick={fetchRecentNotes} 
                  className="btn btn-primary"
                  disabled={loading}
                  style={{ marginTop: '24px' }}
                >
                  {loading ? 'Yükleniyor...' : 'Raporu Getir'}
                </button>
                
                <button 
                  onClick={exportNotesReport} 
                  className="btn btn-success"
                  disabled={exporting || recentNotes.length === 0}
                  style={{ marginTop: '24px', marginLeft: '10px' }}
                >
                  {exporting ? 'İndiriliyor...' : 'Excel\'e Aktar'}
                </button>
              </div>
            </div>
          </div>
          
          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{selectedSector} Sektörü Müşterileri</span>
                <span>{sectorCustomers.length} müşteri bulundu</span>
              </h3>
              
              {loading ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>Müşteriler yükleniyor...</div>
              ) : sectorCustomers.length > 0 ? (
                <div>
                  {sectorCustomers.map(customer => (
                    <div key={customer.id} className="card" style={{ marginBottom: '10px', padding: '15px' }}>
                      <div 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          cursor: 'pointer' 
                        }}
                        onClick={() => toggleCustomerExpand(customer.id)}
                      >
                        <div>
                          <div style={{ fontWeight: 'bold' }}>{customer.name}</div>
                          <div style={{ fontSize: '12px', color: '#888' }}>{customer.code}</div>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="badge" style={{ 
                            backgroundColor: customer.noteCount > 0 ? '#3498db' : '#ccc',
                            color: 'white'
                          }}>
                            {customer.noteCount} Not
                          </span>
                          
                          <button
                            className="btn btn-primary"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              window.location.href = `/customers/${customer.id}`;
                            }}
                          >
                            Detay
                          </button>
                          
                          <span style={{ 
                            fontSize: '18px', 
                            transition: 'transform 0.3s',
                            transform: expandedCustomers[customer.id] ? 'rotate(180deg)' : 'rotate(0)'
                          }}>
                            ▼
                          </span>
                        </div>
                      </div>
                      
                      {/* Genişletilmiş içerik - Notlar */}
                      {expandedCustomers[customer.id] && (
                        <div style={{ marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
                          {customer.notes.length > 0 ? (
                            <div>
                              {customer.notes.map(note => (
                                <div 
                                  key={note.id} 
                                  style={{ 
                                    padding: '10px', 
                                    borderLeft: '3px solid #3498db',
                                    marginBottom: '10px',
                                    backgroundColor: '#f9f9f9' 
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                    <div>
                                      <strong>{note.profiles?.full_name || 'Kullanıcı'}</strong> tarafından eklendi
                                    </div>
                                    <div>{formatDate(note.created_at)}</div>
                                  </div>
                                  
                                  <div style={{ marginBottom: '10px', whiteSpace: 'pre-wrap' }}>
                                    {note.note_content}
                                  </div>
                                  
                                  {note.promise_date && (
                                    <div style={{ 
                                      padding: '5px 10px', 
                                      backgroundColor: '#e3f2fd', 
                                      borderRadius: '4px',
                                      display: 'inline-block',
                                      fontSize: '13px',
                                      color: '#1565c0',
                                      marginBottom: '5px'
                                    }}>
                                      <strong>Söz Verilen Ödeme Tarihi:</strong> {formatDate(note.promise_date)}
                                    </div>
                                  )}
                                  
                                  {note.balance_at_time !== null && (
                                    <div style={{ fontSize: '13px', color: '#666', marginTop: '5px' }}>
                                      <strong>Bakiye:</strong> {parseFloat(note.balance_at_time).toLocaleString('tr-TR', {
                                        style: 'currency',
                                        currency: 'TRY'
                                      })}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                              Bu müşteri için not bulunmuyor.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                  Bu sektörde müşteri bulunamadı.
                </div>
              )}
            </div>
          ) : (
            <div className="card" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
              Lütfen bir sektör seçin.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
              <span>Not Kayıtları</span>
              <span>{recentNotes.length} not bulundu</span>
            </h3>
            
            {loading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>Notlar yükleniyor...</div>
            ) : recentNotes.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Tarih</th>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Müşteri</th>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Not Giren</th>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Not İçeriği</th>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Vade Tarihi</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>Bakiye</th>
                      <th style={{ padding: '10px', textAlign: 'center' }}>İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentNotes.map(note => (
                      <tr key={note.id}>
                        <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                          {formatDate(note.created_at)}
                        </td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                          <div style={{ fontWeight: 'bold' }}>{note.customers?.name || '-'}</div>
                          <div style={{ fontSize: '12px', color: '#888' }}>{note.customers?.code || '-'}</div>
                          {note.customers?.sector_code && (
                            <span className="badge" style={{ fontSize: '11px', backgroundColor: '#f0f0f0', color: '#333', marginTop: '3px', display: 'inline-block' }}>
                              {note.customers.sector_code}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                          {note.profiles?.full_name || '-'}
                        </td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                          <div style={{ maxWidth: '300px', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {note.note_content}
                          </div>
                        </td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                          {note.promise_date ? formatDate(note.promise_date) : '-'}
                        </td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #eee', textAlign: 'right' }}>
                          {note.balance_at_time !== null ? (
                            <span style={{ 
                              fontWeight: 'bold', 
                              color: parseFloat(note.balance_at_time) > 0 ? '#e74c3c' : 'inherit' 
                            }}>
                              {parseFloat(note.balance_at_time).toLocaleString('tr-TR', {
                                style: 'currency',
                                currency: 'TRY'
                              })}
                            </span>
                          ) : '-'}
                        </td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                          <Link 
                            to={`/customers/${note.customer_id}`}
                            className="btn btn-primary"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                          >
                            Müşteri Detay
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                Seçilen kriterlere uygun not bulunamadı.
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Sektör Bazlı Rapor */}
      {reportType === 'sector' && (
        <div>
          <div className="card" style={{ marginBottom: '20px', padding: '15px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
              Sektör Seçimi
            </h3>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '15px' }}>
              <div style={{ minWidth: '300px', flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>Sektör:</label>
                <select 
                  value={selectedSector} 
                  onChange={(e) => setSelectedSector(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                >
                  <option value="">-- Sektör Seçin --</option>
                  {sectors.map(sector => (
                    <option key={sector} value={sector}>{sector}</option>
                  ))}
                </select>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button 
                  onClick={fetchSectorCustomers} 
                  className="btn btn-primary"
                  disabled={loading || !selectedSector}
                  style={{ marginTop: '24px' }}
                >
                  {loading ? 'Yükleniyor...' : 'Raporu Getir'}
                </button>
                
                <button 
                  onClick={exportSectorReport} 
                  className="btn btn-success"
                  disabled={exporting || sectorCustomers.length === 0}
                  style={{ marginTop: '24px', marginLeft: '10px' }}
                >
                  {exporting ? 'İndiriliyor...' : 'Excel\'e Aktar'}
                </button>
              </div>
            </div>
          </div>
          
          {selectedSector ? (
            <div className="card">
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>