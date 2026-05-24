export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const idempotencyKey = req.headers.get('Idempotency-Key');

  // --- BONUS: Idempotency check for confirm ---
  if (idempotencyKey) {
    const cached = await redis.get<object>(`idem:confirm:${idempotencyKey}`);
    if (cached) {
      return NextResponse.json(cached, { headers: { 'X-Idempotent-Replay': 'true' } });
    }
  }

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: params.id },
    });

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    if (reservation.status === 'CONFIRMED') {
      return NextResponse.json({ error: 'Reservation already confirmed' }, { status: 400 });
    }

    if (reservation.status === 'RELEASED') {
      return NextResponse.json({ error: 'Reservation already released' }, { status: 400 });
    }

    // Lazy expiry: if expired but still PENDING, release and return 410
    if (new Date() > reservation.expiresAt) {
      await prisma.$transaction([
        prisma.reservation.update({
          where: { id: params.id },
          data: { status: 'RELEASED' },
        }),
        prisma.stock.update({
          where: {
            productId_warehouseId: {
              productId: reservation.productId,
              warehouseId: reservation.warehouseId,
            },
          },
          data: { reserved: { decrement: reservation.quantity } },
        }),
      ]);

      return NextResponse.json(
        { error: 'Reservation has expired. Your hold has been released.' },
        { status: 410 }
      );
    }

    // Confirm: decrement total AND reserved (units are now permanently sold)
    const [confirmed] = await prisma.$transaction([
      prisma.reservation.update({
        where: { id: params.id },
        data: { status: 'CONFIRMED' },
        include: { product: true, warehouse: true },
      }),
      prisma.stock.update({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
        data: {
          total: { decrement: reservation.quantity },
          reserved: { decrement: reservation.quantity },
        },
      }),
    ]);

    if (idempotencyKey) {
      await redis.set(`idem:confirm:${idempotencyKey}`, confirmed, { ex: 3600 });
    }

    return NextResponse.json(confirmed);
  } catch (error) {
    console.error('[POST /api/reservations/:id/confirm]', error);
    return NextResponse.json({ error: 'Failed to confirm reservation' }, { status: 500 });
  }
}
