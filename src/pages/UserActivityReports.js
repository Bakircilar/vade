import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { toast } from 'react-toastify';
import { useUserAccess } from '../helpers/userAccess';
import { format, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { tr } from 'date-fns/locale';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const UserActivityReports = () => {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [selectedUser, setSelectedUser] = useState('');
  const [users, setUsers] = useState([]);
  const { isAdmin, isMuhasebe, user: currentUser } = useUserAccess();

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (users.length > 0) {
      generateReport();
    }
  }, [selectedPeriod, selectedUser, users]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .order('full_name');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Kullanıcı yükleme hatası:', error);
      toast.error('Kullanıcılar yüklenirken hata oluştu');
    }
  };

  const getDateRange = () => {
    const now = new Date();
    switch (selectedPeriod) {
      case 'week':
        return {
          start: startOfWeek(now, { locale: tr }),
          end: endOfWeek(now, { locale: tr })
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

  const generateReport = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      // Kullanıcı filtresi
      let userFilter = selectedUser;
      if (!isAdmin && !isMuhasebe) {
        // Normal kullanıcı sadece kendi raporunu görebilir
        userFilter = currentUser?.id;
      }

      // 1. Kullanıcı not aktiviteleri - sadece temel alanları al
      let notesQuery = supabase
        .from('customer_notes')
        .select(`
          id,
          created_at,
          customer_id,
          note_content
        `)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      // Created_by sütunu olmadığı için kullanıcı filtresini kaldırıyoruz
      // Tüm notları alacağız

      const { data: notes, error: notesError } = await notesQuery.order('created_at', { ascending: false });

      if (notesError) throw notesError;

      // 2. Login aktiviteleri (bu özellik şimdilik devre dışı)
      let loginLogs = [];

      // 3. Kullanıcı atamaları
      let assignments = [];
      if (userFilter) {
        const { data: assignmentData, error: assignmentError } = await supabase
          .from('user_customer_assignments')
          .select(`
            id,
            customer_id,
            created_at
          `)
          .eq('user_id', userFilter);

        if (!assignmentError) {
          assignments = assignmentData || [];
        }
      }

      // 4. Müşteri balans özeti
      let balanceStats = null;
      if (userFilter && assignments.length > 0) {
        try {
          const customerIds = assignments.map(a => a.customer_id);
          const { data: userBalances, error: balanceError } = await supabase
            .from('customer_balances')
            .select(`
              total_balance,
              past_due_balance,
              not_due_balance
            `)
            .in('customer_id', customerIds);

          if (!balanceError && userBalances) {
            balanceStats = {
              totalCustomers: userBalances.length,
              totalBalance: userBalances.reduce((sum, b) => sum + (parseFloat(b.total_balance) || 0), 0),
              pastDueBalance: userBalances.reduce((sum, b) => sum + (parseFloat(b.past_due_balance) || 0), 0),
              notDueBalance: userBalances.reduce((sum, b) => sum + (parseFloat(b.not_due_balance) || 0), 0)
            };
          }
        } catch (err) {
          console.log('Bakiye verileri alınamadı:', err);
        }
      }

      // Müşteri bilgilerini notlara eşle
      let notesWithCustomers = notes;
      if (notes.length > 0) {
        const noteCustomerIds = [...new Set(notes.map(n => n.customer_id))];
        const { data: noteCustomers, error: noteCustomerError } = await supabase
          .from('customers')
          .select('id, name, code, sector_code')
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

      // Verileri işle ve analiz et
      const processedData = processReportData(notesWithCustomers, loginLogs, assignments, balanceStats, start, end);
      setReportData(processedData);

    } catch (error) {
      console.error('Rapor oluşturma hatası:', error);
      toast.error('Rapor oluşturulurken hata oluştu: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const processReportData = (notes, loginLogs, assignments, balanceStats, startDate, endDate) => {
    // Günlük aktivite verileri
    const dailyActivity = {};
    const days = [];

    // Tarih aralığındaki tüm günleri oluştur
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayKey = format(d, 'yyyy-MM-dd');
      days.push(dayKey);
      dailyActivity[dayKey] = {
        date: format(d, 'dd MMM', { locale: tr }),
        notes: 0,
        logins: 0
      };
    }

    // Notları günlere dağıt
    notes.forEach(note => {
      const dayKey = format(new Date(note.created_at), 'yyyy-MM-dd');
      if (dailyActivity[dayKey]) {
        dailyActivity[dayKey].notes++;
      }
    });

    // Login'leri günlere dağıt
    loginLogs.forEach(login => {
      const dayKey = format(new Date(login.login_time), 'yyyy-MM-dd');
      if (dailyActivity[dayKey]) {
        dailyActivity[dayKey].logins++;
      }
    });

    // Kullanıcı bazlı istatistikler - created_by olmadığı için atlanıyor
    const userStats = {};

    // Sektör bazlı aktivite
    const sectorStats = {};
    notes.forEach(note => {
      const sector = note.customers?.sector_code || 'Belirsiz';
      if (!sectorStats[sector]) {
        sectorStats[sector] = 0;
      }
      sectorStats[sector]++;
    });

    return {
      summary: {
        totalNotes: notes.length,
        totalLogins: loginLogs.length,
        totalAssignments: assignments.length,
        activeDays: Object.values(dailyActivity).filter(day => day.notes > 0 || day.logins > 0).length,
        balanceStats
      },
      dailyActivity: days.map(day => dailyActivity[day]),
      userStats: Object.entries(userStats).map(([userId, stats]) => ({
        userId,
        name: stats.name,
        noteCount: stats.noteCount,
        customerCount: stats.customerCount.size
      })),
      sectorStats: Object.entries(sectorStats).map(([sector, count]) => ({
        name: sector,
        value: count
      })),
      recentNotes: notes.slice(0, 10),
      assignments,
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

  const formatDate = (dateString) => {
    return format(new Date(dateString), 'dd MMM yyyy HH:mm', { locale: tr });
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

  // Admin kontrolü
  if (!isAdmin && !isMuhasebe && !currentUser) {
    return (
      <div className="card">
        <h2>Erişim Engellendi</h2>
        <p>Bu sayfaya erişmek için yetkiniz bulunmuyor.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        {isAdmin || isMuhasebe ? 'Kullanıcı Aktivite Raporları' : 'Aktivite Raporum'}
      </h1>

      {/* Filtreler */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>
          Rapor Filtreleri
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

          {(isAdmin || isMuhasebe) && (
            <div>
              <label style={{ display: 'block', marginBottom: '5px' }}>Kullanıcı:</label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', minWidth: '200px' }}
              >
                <option value="">Tüm Kullanıcılar</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || 'İsimsiz'} ({user.role || 'Rol yok'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={generateReport}
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? 'Yükleniyor...' : 'Rapor Oluştur'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p>Rapor oluşturuluyor...</p>
          </div>
        </div>
      )}

      {reportData && !loading && (
        <div>
          {/* Özet kartları */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' }}>
            <div className="card" style={{ backgroundColor: '#e3f2fd' }}>
              <h4 style={{ fontSize: '14px', color: '#1976d2', margin: 0 }}>Toplam Not</h4>
              <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '5px 0', color: '#1976d2' }}>
                {reportData.summary.totalNotes}
              </p>
            </div>

            <div className="card" style={{ backgroundColor: '#e8f5e8' }}>
              <h4 style={{ fontSize: '14px', color: '#388e3c', margin: 0 }}>Aktif Gün</h4>
              <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '5px 0', color: '#388e3c' }}>
                {reportData.summary.activeDays}
              </p>
            </div>

            <div className="card" style={{ backgroundColor: '#fff3e0' }}>
              <h4 style={{ fontSize: '14px', color: '#f57c00', margin: 0 }}>Atanmış Müşteri</h4>
              <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '5px 0', color: '#f57c00' }}>
                {reportData.summary.totalAssignments}
              </p>
            </div>

            {reportData.summary.balanceStats && (
              <div className="card" style={{ backgroundColor: '#f3e5f5' }}>
                <h4 style={{ fontSize: '14px', color: '#7b1fa2', margin: 0 }}>Toplam Bakiye</h4>
                <p style={{ fontSize: '18px', fontWeight: 'bold', margin: '5px 0', color: '#7b1fa2' }}>
                  {formatCurrency(reportData.summary.balanceStats.totalBalance)}
                </p>
              </div>
            )}
          </div>

          {/* Günlük aktivite grafiği */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>
              Günlük Aktivite Trendi
            </h3>
            <div style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reportData.dailyActivity}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="notes" stroke="#8884d8" name="Notlar" />
                  <Line type="monotone" dataKey="logins" stroke="#82ca9d" name="Giriş" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* İki sütunlu grafik alanı */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            {/* Kullanıcı performansı */}
            {(isAdmin || isMuhasebe) && reportData.userStats.length > 0 && (
              <div className="card">
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>
                  Kullanıcı Performansı
                </h3>
                <div style={{ height: '250px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={reportData.userStats}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="noteCount" fill="#8884d8" name="Not Sayısı" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Sektör dağılımı */}
            {reportData.sectorStats.length > 0 && (
              <div className="card">
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>
                  Sektör Bazlı Aktivite
                </h3>
                <div style={{ height: '250px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reportData.sectorStats}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {reportData.sectorStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Son aktiviteler */}
          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>
              Son Notlar ({reportData.recentNotes.length})
            </h3>

            {reportData.recentNotes.length > 0 ? (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {reportData.recentNotes.map(note => (
                  <div key={note.id} style={{
                    padding: '10px',
                    border: '1px solid #eee',
                    borderRadius: '4px',
                    marginBottom: '10px',
                    backgroundColor: '#f8f9fa'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 'bold', margin: 0 }}>
                        {note.customers?.name || 'Müşteri bulunamadı'} ({note.customers?.code || 'Kod yok'})
                      </h4>
                      <span style={{ fontSize: '12px', color: '#666' }}>
                        {formatDate(note.created_at)}
                      </span>
                    </div>
                    <p style={{ fontSize: '13px', margin: '5px 0', color: '#666' }}>
                      Sektör: {note.customers?.sector_code || 'Belirsiz'}
                    </p>
                    <p style={{ fontSize: '13px', margin: 0, color: '#333' }}>
                      {note.note_content || 'Not içeriği bulunamadı'}
                    </p>
                    {(isAdmin || isMuhasebe) && (
                      <p style={{ fontSize: '12px', margin: '5px 0 0 0', color: '#888' }}>
                        Yazan: {note.profiles?.full_name || 'Bilinmeyen kullanıcı'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#666', fontStyle: 'italic' }}>Bu dönemde not bulunamadı.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserActivityReports;