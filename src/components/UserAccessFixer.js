import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';

const UserAccessFixer = ({ onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const fixUserAccess = async () => {
    setLoading(true);
    try {
      // 1. Tüm kullanıcıları al
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('id, full_name, role');

      if (usersError) throw usersError;

      // 2. Tüm atamaları al
      const { data: assignments, error: assignmentsError } = await supabase
        .from('user_customer_assignments')
        .select('user_id, customer_id');

      if (assignmentsError) throw assignmentsError;

      // 3. Atama olmayan kullanıcıları bul
      const assignedUserIds = new Set(assignments.map(a => a.user_id));
      const unassignedUsers = users.filter(user =>
        !assignedUserIds.has(user.id) && user.role === 'user'
      );

      // 4. Müşteri verilerini kontrol et
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('id, code, name');

      if (customersError) throw customersError;

      // 5. Atanan müşterilerin gerçek var olup olmadığını kontrol et
      const existingCustomerIds = new Set(customers.map(c => c.id));
      const invalidAssignments = assignments.filter(a =>
        !existingCustomerIds.has(a.customer_id)
      );

      let fixCount = 0;

      // 6. Geçersiz atamaları temizle
      if (invalidAssignments.length > 0) {
        const invalidIds = invalidAssignments.map(a => a.customer_id);
        const { error: deleteError } = await supabase
          .from('user_customer_assignments')
          .delete()
          .in('customer_id', invalidIds);

        if (deleteError) throw deleteError;
        fixCount += invalidAssignments.length;
      }

      // 7. Çift atamaları temizle (aynı kullanıcı-müşteri çifti)
      const assignmentMap = new Map();
      const duplicates = [];

      assignments.forEach(assignment => {
        const key = `${assignment.user_id}-${assignment.customer_id}`;
        if (assignmentMap.has(key)) {
          duplicates.push(assignment);
        } else {
          assignmentMap.set(key, assignment);
        }
      });

      if (duplicates.length > 0) {
        // Bu kısım daha karmaşık, basit bir yaklaşım kullanıyoruz
        console.log('Duplicate assignments found:', duplicates.length);
      }

      setResults({
        totalUsers: users.length,
        unassignedUsers: unassignedUsers.length,
        totalAssignments: assignments.length,
        invalidAssignments: invalidAssignments.length,
        duplicateAssignments: duplicates.length,
        fixedCount: fixCount,
        unassignedUsersList: unassignedUsers
      });

      if (fixCount > 0) {
        toast.success(`${fixCount} adet geçersiz atama temizlendi`);
      } else {
        toast.info('Temizlenecek geçersiz atama bulunamadı');
      }

      if (onComplete) {
        onComplete();
      }

    } catch (error) {
      console.error('Kullanıcı erişim düzeltme hatası:', error);
      toast.error('Düzeltme sırasında hata oluştu: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshUserAccess = async () => {
    setLoading(true);
    try {
      // Kullanıcının session'ını yenile
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error) throw error;

      if (user) {
        // Session'ı yenile
        await supabase.auth.refreshSession();
        toast.success('Kullanıcı oturumu yenilendi');

        // Sayfayı yenile
        window.location.reload();
      }

    } catch (error) {
      console.error('Session yenileme hatası:', error);
      toast.error('Session yenilenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ backgroundColor: '#f8f9fa', border: '1px solid #dee2e6' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px', color: '#495057' }}>
        🔧 Kullanıcı Erişim Düzeltme Aracı
      </h3>

      <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
        Bu araç kullanıcı erişim sorunlarını otomatik olarak tespit eder ve düzeltir.
      </p>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          onClick={fixUserAccess}
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? 'Kontrol Ediliyor...' : 'Erişim Sorunlarını Düzelt'}
        </button>

        <button
          onClick={refreshUserAccess}
          disabled={loading}
          className="btn btn-secondary"
        >
          {loading ? 'Yenileniyor...' : 'Oturumu Yenile'}
        </button>
      </div>

      {results && (
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>
            Düzeltme Sonuçları:
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '15px' }}>
            <div style={{ padding: '8px', backgroundColor: '#e3f2fd', borderRadius: '4px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#1976d2' }}>Toplam Kullanıcı</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1976d2' }}>{results.totalUsers}</div>
            </div>

            <div style={{ padding: '8px', backgroundColor: '#fff3e0', borderRadius: '4px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#f57c00' }}>Atanmamış Kullanıcı</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f57c00' }}>{results.unassignedUsers}</div>
            </div>

            <div style={{ padding: '8px', backgroundColor: '#e8f5e8', borderRadius: '4px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#388e3c' }}>Toplam Atama</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#388e3c' }}>{results.totalAssignments}</div>
            </div>

            <div style={{ padding: '8px', backgroundColor: '#ffebee', borderRadius: '4px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#d32f2f' }}>Düzeltilen Sorun</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#d32f2f' }}>{results.fixedCount}</div>
            </div>
          </div>

          {results.unassignedUsers > 0 && (
            <div style={{ marginTop: '15px' }}>
              <h5 style={{ fontSize: '13px', fontWeight: 'bold', color: '#f57c00', marginBottom: '10px' }}>
                ⚠️ Müşteri Atanmamış Kullanıcılar:
              </h5>
              <div style={{ fontSize: '12px', color: '#666' }}>
                {results.unassignedUsersList.map(user => (
                  <div key={user.id} style={{
                    padding: '5px 10px',
                    backgroundColor: '#fff3e0',
                    margin: '2px 0',
                    borderRadius: '3px'
                  }}>
                    {user.full_name || 'İsimsiz'} ({user.role || 'Rol yok'})
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                Bu kullanıcılara <strong>Kullanıcı Atamaları</strong> sayfasından müşteri atayın.
              </p>
            </div>
          )}

          {results.invalidAssignments > 0 && (
            <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#d4edda', borderRadius: '4px' }}>
              <p style={{ fontSize: '12px', color: '#155724', margin: 0 }}>
                ✅ {results.invalidAssignments} adet geçersiz atama temizlendi.
              </p>
            </div>
          )}

          {results.duplicateAssignments > 0 && (
            <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
              <p style={{ fontSize: '12px', color: '#856404', margin: 0 }}>
                ⚠️ {results.duplicateAssignments} adet çift atama tespit edildi. Manuel kontrol gerekebilir.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UserAccessFixer;