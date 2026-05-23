export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Called by Vercel Cron every minute.
// Finds all PENDING reservations past their expiresAt and releases them.
export async function GET() {
  try {
    const expired = await prisma.reservation.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: new Date() },
      },
    });

    let released = 0;
    for (const r of expired) {
      try {
        await prisma.$transaction([
          prisma.reservation.update({
            where: { id: r.id },
            data: { status: 'RELEASED' },
          }),
          prisma.stock.update({
            where: {
              productId_warehouseId: {
                productId: r.productId,
                warehouseId: r.warehouseId,
              },
            },
            data: { reserved: { decrement: r.quantity } },
          }),
        ]);
        released++;
      } catch (e) {
        console.error(`Failed to release reservation ${r.id}:`, e);
      }
    }

    console.log(`[CRON] Released ${released}/${expired.length} expired reservations`);
    return NextResponse.json({ ok: true, released, total: expired.length });
  } catch (error) {
    console.error('[CRON /api/cron/expire]', error);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
