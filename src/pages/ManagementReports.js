import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';
import { useUserAccess } from '../helpers/userAccess';
import { format, startOfMonth, endOfMonth, subMonths, isToday, isYesterday, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const ManagementReports = () => {
  const [managementData, setManagementData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('year');
  const [selectedMetric, setSelectedMetric] = useState('performance');
  const { isAdmin, isMuhasebe } = useUserAccess();

  useEffect(() => {
    if (isAdmin || isMuhasebe) {
      generateManagementReport();
    }
  }, [selectedPeriod, selectedMetric, isAdmin, isMuhasebe]);

  const getDateRange = () => {
    const now = new Date();
    switch (selectedPeriod) {
      case 'week':
        return {
          start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          end: now
        };
      case 'month':
        return {
          start: startOfMonth(now),
          end: endOfMonth(now)
        };
      case 'quarter':
        return {
          start: startOfMonth(subMonths(now, 2)),
          end: endOfMonth(now)
        };
      case 'year':
        return {
          start: startOfMonth(subMonths(now, 11)),
          end: endOfMonth(now)
        };
      default:
        return {
          start: startOfMonth(now),
          end: endOfMonth(now)
        };
    }
  };

  const generateManagementReport = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      // 1. Tüm kullanıcıları ve rollerini al
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('id, full_name, role, created_at')
        .order('full_name');

      if (usersError) throw usersError;

      // 2. Kullanıcı aktiviteleri (notlar) - created_by yok, tüm notları al
      const { data: notes, error: notesError } = await supabase
        .from('customer_notes')
        .select(`
          id,
          created_at,
          customer_id,
          note_content,
          created_by
        `)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });

      if (notesError) throw notesError;

      // 3. Login aktiviteleri (şimdilik devre dışı)
      let loginLogs = [];

      // 4. Kullanıcı atamaları
      const { data: assignments, error: assignmentError } = await supabase
        .from('user_customer_assignments')
        .select(`
          user_id,
          customer_id,
          created_at
        `);

      if (assignmentError) throw assignmentError;

      // 5. Müşteri bakiyeleri ve atamalar
      const { data: balances, error: balanceError } = await supabase
        .from('customer_balances')
        .select(`
          customer_id,
          total_balance,
          past_due_balance,
          not_due_balance,
          updated_at
        `);

      if (balanceError) throw balanceError;

      // Müşteri bilgilerini al
      let notesWithCustomers = notes;
      if (notes.length > 0) {
        const noteCustomerIds = [...new Set(notes.map(n => n.customer_id))];
        const { data: noteCustomers, error: noteCustomerError } = await supabase
          .from('customers')
          .select('id, name, code, sector_code, region_code')
          .in('id', noteCustomerIds);

        if (!noteCustomerError && noteCustomers) {
          notesWithCustomers = notes.map(note => {
            const customer = noteCustomers.find(c => c.id === note.customer_id);
            return {
              ...note,
              customers: customer || null
            };
          });
        }
      }

      // Kullanıcı bilgilerini al
      let notesWithUsers = notesWithCustomers;
      if (notesWithCustomers.length > 0) {
        const userIds = [...new Set(notesWithCustomers.map(n => n.created_by))];
        const { data: noteUsers, error: noteUserError } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .in('id', userIds);

        if (!noteUserError && noteUsers) {
          notesWithUsers = notesWithCustomers.map(note => {
            const user = noteUsers.find(u => u.id === note.created_by);
            return {
              ...note,
              profiles: user || null
            };
          });
        }
      }

      // Verileri işle
      const processedData = processManagementData(users, notesWithUsers, loginLogs, assignments, balances, start, end);
      setManagementData(processedData);

    } catch (error) {
      console.error('Yönetim raporu oluşturma hatası:', error);
      toast.error('Rapor oluşturulurken hata oluştu: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const processManagementData = (users, notes, loginLogs, assignments, balances, startDate, endDate) => {
    // Kullanıcı performans metrikleri - created_by field'ı kontrol edildi
    const userPerformance = users.map(user => {
      const userNotes = notes.filter(note => note.created_by === user.id);
      const userLogins = loginLogs.filter(login => login.user_id === user.id);
      const userAssignments = assignments.filter(assign => assign.user_id === user.id);

      // Kullanıcının atanmış müşterilerinin bakiye toplamı
      const assignedCustomerIds = userAssignments.map(a => a.customer_id);
      const userBalances = balances.filter(b => assignedCustomerIds.includes(b.customer_id));

      const totalBalance = userBalances.reduce((sum, b) => sum + (parseFloat(b.total_balance) || 0), 0);
      const pastDueBalance = userBalances.reduce((sum, b) => sum + (parseFloat(b.past_due_balance) || 0), 0);

      // Son aktivite tarihi
      const lastNoteDate = userNotes.length > 0 ? new Date(Math.max(...userNotes.map(n => new Date(n.created_at)))) : null;
      const lastLoginDate = userLogins.length > 0 ? new Date(Math.max(...userLogins.map(l => new Date(l.login_time)))) : null;
      const lastActivity = lastNoteDate && lastLoginDate ?
        (lastNoteDate > lastLoginDate ? lastNoteDate : lastLoginDate) :
        (lastNoteDate || lastLoginDate);

      // Aktivite skoru hesaplama
      const noteScore = Math.min(userNotes.length * 2, 20); // Max 20 puan
      const loginScore = Math.min(userLogins.length, 10); // Max 10 puan
      const assignmentScore = Math.min(userAssignments.length, 10); // Max 10 puan
      const activityScore = noteScore + loginScore + assignmentScore;

      // Günlük ortalama aktivite
      const totalDays = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
      const dailyAverage = userNotes.length / totalDays;

      return {
        id: user.id,
        name: user.full_name || 'İsimsiz Kullanıcı',
        role: user.role || 'Rol yok',
        noteCount: userNotes.length,
        loginCount: userLogins.length,
        assignedCustomers: userAssignments.length,
        totalBalance,
        pastDueBalance,
        activityScore,
        dailyAverage: parseFloat(dailyAverage.toFixed(2)),
        lastActivity,
        daysSinceLastActivity: lastActivity ? differenceInDays(new Date(), lastActivity) : null,
        efficiency: userAssignments.length > 0 ? (userNotes.length / userAssignments.length).toFixed(2) : 0
      };
    });

    // En aktif kullanıcıları bul
    const topPerformers = [...userPerformance]
      .sort((a, b) => b.activityScore - a.activityScore)
      .slice(0, 5);



    // Günlük aktivite trendi
    const dailyTrend = {};
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayKey = format(d, 'yyyy-MM-dd');
      dailyTrend[dayKey] = {
        date: format(d, 'dd MMM', { locale: tr }),
        notes: 0,
        logins: 0,
        users: new Set()
      };
    }

    notes.forEach(note => {
      const dayKey = format(new Date(note.created_at), 'yyyy-MM-dd');
      if (dailyTrend[dayKey]) {
        dailyTrend[dayKey].notes++;
        // created_by olmadığı için user tracking kaldırıldı
      }
    });

    loginLogs.forEach(login => {
      const dayKey = format(new Date(login.login_time), 'yyyy-MM-dd');
      if (dailyTrend[dayKey]) {
        dailyTrend[dayKey].logins++;
        dailyTrend[dayKey].users.add(login.user_id);
      }
    });


    // Problem alanları tespit et
    const issues = [];

    // Hiç not almayan kullanıcılar
    const inactiveUsers = userPerformance.filter(u => u.noteCount === 0 && u.role !== 'admin');
    if (inactiveUsers.length > 0) {
      issues.push({
        type: 'warning',
        title: 'Pasif Kullanıcılar',
        description: `${inactiveUsers.length} kullanıcı hiç not almamış`,
        users: inactiveUsers.map(u => u.name)
      });
    }

    // Son 7 gündür aktif olmayan kullanıcılar
    const recentlyInactive = userPerformance.filter(u =>
      u.daysSinceLastActivity !== null && u.daysSinceLastActivity > 7 && u.role !== 'admin'
    );
    if (recentlyInactive.length > 0) {
      issues.push({
        type: 'info',
        title: 'Son Dönem Pasif Kullanıcılar',
        description: `${recentlyInactive.length} kullanıcı 7+ gündür aktif değil`,
        users: recentlyInactive.map(u => `${u.name} (${u.daysSinceLastActivity} gün)`)
      });
    }

    // Müşteri atanmamış kullanıcılar
    const unassignedUsers = userPerformance.filter(u => u.assignedCustomers === 0 && u.role === 'user');
    if (unassignedUsers.length > 0) {
      issues.push({
        type: 'error',
        title: 'Müşteri Atanmamış Kullanıcılar',
        description: `${unassignedUsers.length} kullanıcıya müşteri atanmamış`,
        users: unassignedUsers.map(u => u.name)
      });
    }

    return {
      summary: {
        totalUsers: users.length,
        activeUsers: userPerformance.filter(u => u.noteCount > 0).length,
        totalNotes: notes.length,
        totalLogins: loginLogs.length,
        avgNotesPerUser: users.length > 0 ? (notes.length / users.length).toFixed(1) : 0,
        totalAssignments: assignments.length
      },
      userPerformance,
      topPerformers,
      dailyTrend: Object.values(dailyTrend).map(day => ({
        ...day,
        activeUsers: day.users.size
      })),
      issues,
      period: { start: startDate, end: endDate }
    };
  };

  const formatCurrency = (value) => {
    if (!value) return '₺0';
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0
    }).format(value);
  };

  const formatDate = (date) => {
    if (!date) return 'Hiç';
    if (isToday(date)) return 'Bugün';
    if (isYesterday(date)) return 'Dün';
    return format(date, 'dd MMM yyyy', { locale: tr });
  };

  const getPerformanceColor = (score) => {
    if (score >= 30) return '#27ae60';
    if (score >= 20) return '#f39c12';
    if (score >= 10) return '#e67e22';
    return '#e74c3c';
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

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
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        Yönetim ve Performans Raporları
      </h1>

      {/* Filtreler */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>
          Rapor Ayarları
        </h3>

        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>Dönem:</label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="week">Bu Hafta</option>
              <option value="month">Bu Ay</option>
              <option value="quarter">Son 3 Ay</option>
              <option value="year">Son 12 Ay</option>
            </select>
          </div>

          {managementData && (
            <div style={{
              padding: '10px',
              backgroundColor: '#f8f9fa',
              borderRadius: '4px',
              fontSize: '14px',
              color: '#666'
            }}>
              <strong>Rapor Tarihi:</strong> {format(managementData.period.start, 'dd MMM yyyy', { locale: tr })} - {format(managementData.period.end, 'dd MMM yyyy', { locale: tr })}
            </div>
          )}

          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>Metrik:</label>
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="performance">Performans Analizi</option>
              <option value="activity">Aktivite Analizi</option>
              <option value="issues">Sorun Tespiti</option>
            </select>
          </div>

          <button
            onClick={generateManagementReport}
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? 'Yükleniyor...' : 'Raporu Yenile'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p>Yönetim raporu oluşturuluyor...</p>
          </div>
        </div>
      )}

      {managementData && !loading && (
        <div>
          {/* Sorun bildirimleri */}
          {managementData.issues.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              {managementData.issues.map((issue, index) => (
                <div key={index} className="card" style={{
                  backgroundColor: issue.type === 'error' ? '#ffebee' : issue.type === 'warning' ? '#fff3e0' : '#e3f2fd',
                  border: `1px solid ${issue.type === 'error' ? '#f44336' : issue.type === 'warning' ? '#ff9800' : '#2196f3'}`,
                  marginBottom: '10px'
                }}>
                  <h4 style={{
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: issue.type === 'error' ? '#d32f2f' : issue.type === 'warning' ? '#f57c00' : '#1976d2',
                    margin: '0 0 5px 0'
                  }}>
                    {issue.type === 'error' ? '❌' : issue.type === 'warning' ? '⚠️' : 'ℹ️'} {issue.title}
                  </h4>
                  <p style={{ margin: '0 0 5px 0', fontSize: '13px' }}>{issue.description}</p>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {issue.users.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Özet istatistikler */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
            <div className="card" style={{ backgroundColor: '#e3f2fd' }}>
              <h4 style={{ fontSize: '14px', color: '#1976d2', margin: 0 }}>Toplam Kullanıcı</h4>
              <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '5px 0', color: '#1976d2' }}>
                {managementData.summary.totalUsers}
              </p>
              <p style={{ fontSize: '12px', margin: 0, color: '#666' }}>
                {managementData.summary.activeUsers} aktif
              </p>
            </div>

            <div className="card" style={{ backgroundColor: '#e8f5e8' }}>
              <h4 style={{ fontSize: '14px', color: '#388e3c', margin: 0 }}>Toplam Not</h4>
              <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '5px 0', color: '#388e3c' }}>
                {managementData.summary.totalNotes}
              </p>
              <p style={{ fontSize: '12px', margin: 0, color: '#666' }}>
                Ort. {managementData.summary.avgNotesPerUser} not/kullanıcı
              </p>
            </div>

            <div className="card" style={{ backgroundColor: '#fff3e0' }}>
              <h4 style={{ fontSize: '14px', color: '#f57c00', margin: 0 }}>Toplam Atama</h4>
              <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '5px 0', color: '#f57c00' }}>
                {managementData.summary.totalAssignments}
              </p>
            </div>

            <div className="card" style={{ backgroundColor: '#f3e5f5' }}>
              <h4 style={{ fontSize: '14px', color: '#7b1fa2', margin: 0 }}>Toplam Giriş</h4>
              <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '5px 0', color: '#7b1fa2' }}>
                {managementData.summary.totalLogins}
              </p>
            </div>
          </div>

          {/* En iyi performans gösteren kullanıcılar */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>
              📝 Kullanıcı Notları
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: '#f8f9fa' }}>
                  <tr>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Sıra</th>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Kullanıcı</th>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Rol</th>
                    <th style={{ padding: '10px', textAlign: 'center', border: '1px solid #dee2e6' }}>Not Sayısı</th>
                    <th style={{ padding: '10px', textAlign: 'center', border: '1px solid #dee2e6' }}>Atanmış Müşteri</th>
                    <th style={{ padding: '10px', textAlign: 'center', border: '1px solid #dee2e6' }}>Verimlilik</th>
                    <th style={{ padding: '10px', textAlign: 'center', border: '1px solid #dee2e6' }}>Aktivite Skoru</th>
                    <th style={{ padding: '10px', textAlign: 'center', border: '1px solid #dee2e6' }}>Son Aktivite</th>
                  </tr>
                </thead>
                <tbody>
                  {managementData.topPerformers.map((user, index) => (
                    <tr key={user.id}>
                      <td style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold' }}>
                        {index + 1}
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>
                        {user.name}
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '3px',
                          fontSize: '11px',
                          backgroundColor: user.role === 'admin' ? '#e3f2fd' : user.role === 'muhasebe' ? '#fff3e0' : '#f3e5f5'
                        }}>
                          {user.role}
                        </span>
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                        {user.noteCount}
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                        {user.assignedCustomers}
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                        {user.efficiency}
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '3px',
                          color: 'white',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          backgroundColor: getPerformanceColor(user.activityScore)
                        }}>
                          {user.activityScore}
                        </span>
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                        {formatDate(user.lastActivity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Günlük aktivite trendi */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>
              📈 Günlük Aktivite Trendi
            </h3>
            <div style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={managementData.dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="notes" stroke="#8884d8" name="Notlar" />
                  <Line type="monotone" dataKey="activeUsers" stroke="#82ca9d" name="Aktif Kullanıcı" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* İki sütunlu alan */}

        </div>
      )}
    </div>
  );
};

export default ManagementReports;