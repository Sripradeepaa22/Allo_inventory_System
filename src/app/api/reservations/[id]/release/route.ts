export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: params.id },
    });

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    if (reservation.status === 'CONFIRMED') {
      return NextResponse.json({ error: 'Cannot release a confirmed reservation' }, { status: 400 });
    }

    if (reservation.status === 'RELEASED') {
      return NextResponse.json({ error: 'Reservation already released' }, { status: 400 });
    }

    const [released] = await prisma.$transaction([
      prisma.reservation.update({
        where: { id: params.id },
        data: { status: 'RELEASED' },
        include: { product: true, warehouse: true },
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

    return NextResponse.json(released);
  } catch (error) {
    console.error('[POST /api/reservations/:id/release]', error);
    return NextResponse.json({ error: 'Failed to release reservation' }, { status: 500 });
  }
}
