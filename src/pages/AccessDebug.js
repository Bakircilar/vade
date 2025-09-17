import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';
import { useUserAccess } from '../helpers/userAccess';
import UserAccessFixer from '../components/UserAccessFixer';

const AccessDebug = () => {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [debugResults, setDebugResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const { isAdmin, isMuhasebe } = useUserAccess();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, email')
        .order('full_name');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Kullanıcı yükleme hatası:', error);
      toast.error('Kullanıcılar yüklenirken hata oluştu');
    }
  };

  const debugUserAccess = async () => {
    if (!selectedUser) {
      toast.warning('Lütfen bir kullanıcı seçin');
      return;
    }

    setLoading(true);
    try {
      // 1. Kullanıcı bilgilerini al
      const { data: userProfile, error: userError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', selectedUser)
        .single();

      if (userError) throw userError;

      // 2. Kullanıcının atanmış müşterilerini al
      const { data: assignments, error: assignmentError } = await supabase
        .from('user_customer_assignments')
        .select(`
          id,
          customer_id,
          created_at
        `)
        .eq('user_id', selectedUser);

      if (assignmentError) throw assignmentError;

      // 2.5. Müşteri bilgilerini al
      const customerIds = assignments.map(a => a.customer_id);
      let customers = [];
      if (customerIds.length > 0) {
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('id, code, name, sector_code, region_code')
          .in('id', customerIds);

        if (customerError) throw customerError;
        customers = customerData || [];
      }

      // 3. Atanmış müşterilerin bakiye bilgilerini al
      let balances = [];
      if (customerIds.length > 0) {
        const { data: balanceData, error: balanceError } = await supabase
          .from('customer_balances')
          .select('*')
          .in('customer_id', customerIds);

        if (balanceError) throw balanceError;
        balances = balanceData || [];
      }

      // 4. Tüm müşteri sayısını al
      const { count: totalCustomers, error: countError } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;

      // 5. Son giriş bilgisi (şimdilik devre dışı)
      const loginLogs = [];

      // 6. Kullanıcının notlarını al
      let notes = [];
      try {
        const { data: notesData, error: notesError } = await supabase
          .from('customer_notes')
          .select(`
            id,
            customer_id,
            note_content,
            created_at
          `)
          .eq('created_by', selectedUser)
          .order('created_at', { ascending: false })
          .limit(10);

        if (!notesError) {
          notes = notesData || [];
        }
      } catch (err) {
        console.log('Not verileri alınamadı:', err);
      }

      // Müşteri verilerini notlara eşle
      const notesWithCustomers = notes.map(note => {
        const customer = customers.find(c => c.id === note.customer_id);
        return {
          ...note,
          customers: customer || null
        };
      });

      // Atama verilerini müşteri bilgileriyle birleştir
      const assignmentsWithCustomers = assignments.map(assignment => {
        const customer = customers.find(c => c.id === assignment.customer_id);
        return {
          ...assignment,
          customers: customer || null
        };
      });

      // Sonuçları birleştir
      const results = {
        userProfile,
        assignments: assignmentsWithCustomers,
        balances: balances || [],
        notes: notesWithCustomers,
        loginLogs: loginLogs || [],
        totalCustomers,
        stats: {
          assignedCustomers: assignments?.length || 0,
          customersWithBalance: balances?.length || 0,
          notesCreated: notes?.length || 0,
          lastLogins: loginLogs?.length || 0
        }
      };

      setDebugResults(results);

    } catch (error) {
      console.error('Debug analiz hatası:', error);
      toast.error('Analiz sırasında hata oluştu: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Tarih yok';
    return new Date(dateString).toLocaleString('tr-TR');
  };

  const formatCurrency = (value) => {
    if (!value) return '₺0';
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0
    }).format(value);
  };

  // Admin kontrolü
  if (!isAdmin && !isMuhasebe) {
    return (
      <div className="card">
        <h2>Erişim Engellendi</h2>
        <p>Bu sayfaya sadece yöneticiler ve muhasebe personeli erişebilir.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        Kullanıcı Erişim Debug Aracı
      </h1>

      <p style={{ marginBottom: '20px', color: '#666' }}>
        Bu araç ile kullanıcıların müşteri erişim sorunlarını tespit edebilirsiniz.
      </p>

      {/* Erişim Düzeltme Aracı */}
      <UserAccessFixer onComplete={() => fetchUsers()} />

      <div style={{ marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px' }}>
          Detaylı Kullanıcı Analizi
        </h2>

        <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>
          Analiz edilecek kullanıcıyı seçin:
        </label>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
          >
            <option value="">-- Kullanıcı Seçin --</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.full_name || 'İsimsiz'} ({user.role || 'Rol yok'}) - {user.email || 'Email yok'}
              </option>
            ))}
          </select>
          <button
            onClick={debugUserAccess}
            disabled={!selectedUser || loading}
            className="btn btn-primary"
          >
            {loading ? 'Analiz Ediliyor...' : 'Analiz Et'}
          </button>
        </div>
      </div>

      {debugResults && (
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px', color: '#2c3e50' }}>
            Analiz Sonuçları: {debugResults.userProfile.full_name || 'İsimsiz Kullanıcı'}
          </h2>

          {/* Özet istatistikler */}
          <div className="card" style={{ backgroundColor: '#f8f9fa', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>
              📊 Özet İstatistikler
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
              <div>
                <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>Kullanıcı Rolü</p>
                <p style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#2c3e50' }}>
                  {debugResults.userProfile.role || 'Rol atanmamış'}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>Atanmış Müşteri</p>
                <p style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: debugResults.stats.assignedCustomers > 0 ? '#27ae60' : '#e74c3c' }}>
                  {debugResults.stats.assignedCustomers} / {debugResults.totalCustomers}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>Bakiyeli Müşteri</p>
                <p style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#3498db' }}>
                  {debugResults.stats.customersWithBalance}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>Oluşturulan Not</p>
                <p style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#9b59b6' }}>
                  {debugResults.stats.notesCreated}
                </p>
              </div>
            </div>
          </div>

          {/* Sorun tespiti */}
          {debugResults.stats.assignedCustomers === 0 && (
            <div className="card" style={{ backgroundColor: '#ffebee', border: '1px solid #f44336', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#d32f2f', marginBottom: '10px' }}>
                ⚠️ Sorun Tespit Edildi
              </h3>
              <p style={{ color: '#d32f2f', margin: 0 }}>
                Bu kullanıcıya hiç müşteri atanmamış! Kullanıcı Atamaları sayfasından müşteri ataması yapın.
              </p>
            </div>
          )}

          {debugResults.stats.assignedCustomers > 0 && debugResults.stats.customersWithBalance === 0 && (
            <div className="card" style={{ backgroundColor: '#fff3e0', border: '1px solid #ff9800', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#f57c00', marginBottom: '10px' }}>
                ⚠️ Dikkat
              </h3>
              <p style={{ color: '#f57c00', margin: 0 }}>
                Atanmış müşteriler var ama hiçbirinin bakiye kaydı yok. Excel import yapıldığından emin olun.
              </p>
            </div>
          )}

          {/* Atanmış müşteriler detayı */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>
              👥 Atanmış Müşteriler ({debugResults.assignments.length})
            </h3>

            {debugResults.assignments.length > 0 ? (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ backgroundColor: '#f8f9fa', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Kod</th>
                      <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Müşteri Adı</th>
                      <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Sektör</th>
                      <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Bölge</th>
                      <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Atanma Tarihi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debugResults.assignments.map(assignment => (
                      <tr key={assignment.id}>
                        <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>
                          {assignment.customers?.code || 'Kod yok'}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>
                          {assignment.customers?.name || 'İsim yok'}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>
                          {assignment.customers?.sector_code || '-'}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>
                          {assignment.customers?.region_code || '-'}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>
                          {formatDate(assignment.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: '#666', fontStyle: 'italic' }}>Bu kullanıcıya atanmış müşteri bulunamadı.</p>
            )}
          </div>

          {/* Bakiye durumu */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>
              💰 Bakiye Durumu ({debugResults.balances.length})
            </h3>

            {debugResults.balances.length > 0 ? (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ backgroundColor: '#f8f9fa', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Müşteri ID</th>
                      <th style={{ padding: '10px', textAlign: 'right', border: '1px solid #dee2e6' }}>Vadesi Geçen</th>
                      <th style={{ padding: '10px', textAlign: 'right', border: '1px solid #dee2e6' }}>Vadesi Geçmemiş</th>
                      <th style={{ padding: '10px', textAlign: 'right', border: '1px solid #dee2e6' }}>Toplam</th>
                      <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Son Güncelleme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debugResults.balances.map(balance => (
                      <tr key={balance.id}>
                        <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>
                          {balance.customer_id}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'right', color: '#e74c3c' }}>
                          {formatCurrency(balance.past_due_balance)}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'right', color: '#27ae60' }}>
                          {formatCurrency(balance.not_due_balance)}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'right', fontWeight: 'bold' }}>
                          {formatCurrency(balance.total_balance)}
                        </td>
                        <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>
                          {formatDate(balance.updated_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: '#666', fontStyle: 'italic' }}>Bu kullanıcının müşterilerine ait bakiye kaydı bulunamadı.</p>
            )}
          </div>

          {/* Son aktiviteler */}
          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>
              📝 Son Aktiviteler
            </h3>

            {debugResults.notes.length > 0 ? (
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {debugResults.notes.map(note => (
                  <div key={note.id} style={{
                    padding: '10px',
                    borderBottom: '1px solid #eee',
                    backgroundColor: '#f8f9fa',
                    marginBottom: '5px',
                    borderRadius: '4px'
                  }}>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>
                      {note.customers?.name || 'Müşteri bulunamadı'} ({note.customers?.code || 'Kod yok'})
                    </p>
                    <p style={{ margin: '5px 0', fontSize: '13px', color: '#666' }}>
                      {note.note_content}
                    </p>
                    <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>
                      {formatDate(note.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#666', fontStyle: 'italic' }}>Bu kullanıcının not kaydı bulunamadı.</p>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default AccessDebug;