'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reservingId, setReservingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load products. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  const handleReserve = async (productId: string, warehouseId: string) => {
    setReservingId(`${productId}-${warehouseId}`);
    setError('');
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `${productId}-${warehouseId}-${Date.now()}` },
        body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
      });
      if (res.status === 409) { setError('Not enough stock available.'); return; }
      if (res.status === 429) { setError('Request in progress — please try again.'); return; }
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Something went wrong.'); return; }
      const reservation = await res.json();
      router.push(`/reservation/${reservation.id}`);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setReservingId(null);
    }
  };

  return (
    <div className="page-enter" style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 42px)', lineHeight: 1.1, color: 'var(--text-primary)', marginBottom: '10px', letterSpacing: '-0.5px', fontWeight: 800 }}>
          Product Catalogue
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
          Reserve items across our warehouses — holds last 10 minutes.
        </p>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '14px 18px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span style={{ color: '#991B1B', fontSize: '14px', fontWeight: 500 }}>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B' }}>✕</button>
        </div>
      )}

      {!loading && (
        <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', flexWrap: 'wrap' }}>
          {[{ label: 'Products', value: products.length }, { label: 'Warehouses', value: 2 }].map(stat => (
            <div key={stat.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{stat.value}</span>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>{stat.label}</span>
            </div>
          ))}
          <button onClick={fetchProducts} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 20px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px', fontFamily: 'inherit', fontWeight: 500 }}>
            ↻ Refresh
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border)' }}>
              {[60,90,40,100].map((w,j) => <div key={j} className="shimmer" style={{ height: '16px', borderRadius: '6px', width: `${w}%`, marginBottom: '12px' }} />)}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {products.map(product => {
            const totalAvailable = product.stocks.reduce((sum: number, s: any) => sum + s.available, 0);
            return (
              <div key={product.id} style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ height: '4px', background: totalAvailable === 0 ? 'var(--border-strong)' : 'var(--accent)' }} />
                <div style={{ padding: '22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: totalAvailable === 0 ? '#DC2626' : totalAvailable <= 3 ? 'var(--warning)' : 'var(--success)', background: totalAvailable === 0 ? '#FEF2F2' : totalAvailable <= 3 ? 'var(--warning-light)' : 'var(--success-light)', padding: '3px 10px', borderRadius: '20px' }}>
                      {totalAvailable === 0 ? 'Out of stock' : `${totalAvailable} available`}
                    </span>
                  </div>
                  <h2 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px', letterSpacing: '-0.2px' }}>{product.name}</h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.5 }}>{product.description}</p>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '18px', letterSpacing: '-0.5px' }}>
                    ₹{product.price.toLocaleString('en-IN')}
                  </div>
                  <div style={{ height: '1px', background: 'var(--border)', marginBottom: '16px' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {product.stocks.map((stock: any) => {
                      const isReserving = reservingId === `${product.id}-${stock.warehouseId}`;
                      return (
                        <div key={stock.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: '8px' }}>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>{stock.warehouse.name}</div>
                            <div style={{ fontSize: '12px', color: stock.available === 0 ? '#DC2626' : stock.available <= 2 ? 'var(--warning)' : 'var(--success)', fontWeight: 500 }}>
                              {stock.available === 0 ? 'Unavailable' : `${stock.available} of ${stock.total} free`}
                            </div>
                          </div>
                          <button
                            onClick={() => handleReserve(product.id, stock.warehouseId)}
                            disabled={stock.available === 0 || !!reservingId}
                            style={{ background: stock.available === 0 ? 'var(--border)' : 'var(--accent)', color: stock.available === 0 ? 'var(--text-muted)' : 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', cursor: stock.available === 0 || !!reservingId ? 'not-allowed' : 'pointer', opacity: !!reservingId && !isReserving ? 0.5 : 1, whiteSpace: 'nowrap' }}
                          >
                            {isReserving ? 'Holding...' : stock.available === 0 ? 'Unavailable' : 'Reserve'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && products.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '16px' }}>No products found. Run the seed command.</p>
        </div>
      )}
    </div>
  );
}
