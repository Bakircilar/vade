import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { format, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalCustomers: 0,
    upcomingPayments: 0,
    overduePayments: 0,
    totalAmount: 0
  });
  const [recentPayments, setRecentPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Toplam müşteri sayısı
      const { count: customerCount } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });

      // Yaklaşan ödemeler (5 gün içinde)
      const today = new Date();
      const fiveDaysLater = new Date();
      fiveDaysLater.setDate(today.getDate() + 5);

      const { data: upcomingData, count: upcomingCount } = await supabase
        .from('payments')
        .select('*, customers(*)', { count: 'exact' })
        .eq('is_paid', false)
        .gte('due_date', today.toISOString().split('T')[0])
        .lte('due_date', fiveDaysLater.toISOString().split('T')[0]);

      // Vadesi geçmiş ödemeler
      const { count: overdueCount } = await supabase
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('is_paid', false)
        .lt('due_date', today.toISOString().split('T')[0]);

      // Toplam tutar
      const { data: totalData } = await supabase
        .from('payments')
        .select('past_due_balance')
        .eq('is_paid', false);

      const totalAmount = totalData?.reduce((sum, item) => sum + (parseFloat(item.past_due_balance) || 0), 0) || 0;

      setStats({
        totalCustomers: customerCount || 0,
        upcomingPayments: upcomingCount || 0,
        overduePayments: overdueCount || 0,
        totalAmount
      });

      setRecentPayments(upcomingData || []);
    } catch (error) {
      console.error('Dashboard data error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        Vade Takip Sistemi
      </h1>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Yükleniyor...</div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Toplam Müşteri</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.totalCustomers}</p>
              <Link to="/customers" style={{ fontSize: '14px', color: '#3498db', textDecoration: 'none' }}>
                Tümünü Görüntüle →
              </Link>
            </div>

            <div className="stat-card">
              <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Yakın Vadeli</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.upcomingPayments}</p>
              <Link to="/payments?filter=upcoming" style={{ fontSize: '14px', color: '#f39c12', textDecoration: 'none' }}>
                Tümünü Görüntüle →
              </Link>
            </div>

            <div className="stat-card">
              <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Vadesi Geçmiş</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.overduePayments}</p>
              <Link to="/payments?filter=overdue" style={{ fontSize: '14px', color: '#e74c3c', textDecoration: 'none' }}>
                Tümünü Görüntüle →
              </Link>
            </div>

            <div className="stat-card">
              <h3 style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Toplam Bakiye</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(stats.totalAmount)}
              </p>
              <Link to="/payments" style={{ fontSize: '14px', color: '#2ecc71', textDecoration: 'none' }}>
                Tümünü Görüntüle →
              </Link>
            </div>
          </div>

          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
              Vadesi Yaklaşan Ödemeler (5 gün içinde)
            </h2>

            {recentPayments.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Müşteri</th>
                    <th>Vade Tarihi</th>
                    <th>Tutar</th>
                    <th>Kalan Gün</th>
                    <th>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((payment) => {
                    const daysLeft = differenceInDays(
                      new Date(payment.due_date),
                      new Date()
                    );

                    return (
                      <tr key={payment.id}>
                        <td>
                          <div style={{ fontWeight: 'bold' }}>
                            {payment.customers?.name || '-'}
                          </div>
                          <div style={{ fontSize: '12px', color: '#888' }}>
                            {payment.customer_code || payment.customers?.code || '-'}
                          </div>
                        </td>
                        <td>
                          {payment.due_date
                            ? format(new Date(payment.due_date), 'dd.MM.yyyy', { locale: tr })
                            : '-'}
                        </td>
                        <td>
                          {payment.past_due_balance
                            ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(payment.past_due_balance)
                            : '-'}
                        </td>
                        <td>
                          <span className={`badge ${daysLeft <= 2 ? 'badge-warning' : 'badge-info'}`}>
                            {daysLeft === 0 ? 'Bugün' : `${daysLeft} gün`}
                          </span>
                        </td>
                        <td>
                          <Link
                            to={`/customers/${payment.customer_id}`}
                            style={{ color: '#3498db', textDecoration: 'none' }}
                          >
                            Detay
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                5 gün içinde vadesi dolacak ödeme bulunmuyor.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;