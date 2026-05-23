export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis, acquireLock, releaseLock } from '@/lib/redis';
import { ReserveSchema } from '@/lib/schemas';

const RESERVATION_WINDOW_MINUTES = 10;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ReserveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { productId, warehouseId, quantity } = parsed.data;
  const idempotencyKey = req.headers.get('Idempotency-Key');

  // --- BONUS: Idempotency check ---
  if (idempotencyKey) {
    const cached = await redis.get<object>(`idem:reserve:${idempotencyKey}`);
    if (cached) {
      return NextResponse.json(cached, { status: 200, headers: { 'X-Idempotent-Replay': 'true' } });
    }
  }

  // --- Distributed lock to prevent race conditions ---
  // Only one reservation can be created for a given product+warehouse at a time.
  const lockKey = `lock:reserve:${productId}:${warehouseId}`;
  const lockValue = crypto.randomUUID();

  const acquired = await acquireLock(lockKey, lockValue, 15);
  if (!acquired) {
    return NextResponse.json(
      { error: 'Another reservation is in progress. Please retry in a moment.' },
      { status: 429 }
    );
  }

  try {
    // Re-read stock inside the lock to get consistent view
    const stock = await prisma.stock.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
    });

    if (!stock) {
      return NextResponse.json(
        { error: 'Stock not found for this product and warehouse' },
        { status: 404 }
      );
    }

    const available = stock.total - stock.reserved;
    if (available < quantity) {
      return NextResponse.json(
        { error: `Not enough stock. Only ${available} unit(s) available.` },
        { status: 409 }
      );
    }

    const expiresAt = new Date(Date.now() + RESERVATION_WINDOW_MINUTES * 60 * 1000);

    // Atomically create reservation + increment reserved count
    const [reservation] = await prisma.$transaction([
      prisma.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          status: 'PENDING',
          expiresAt,
          idempotencyKey: idempotencyKey ?? undefined,
        },
        include: {
          product: true,
          warehouse: true,
        },
      }),
      prisma.stock.update({
        where: { productId_warehouseId: { productId, warehouseId } },
        data: { reserved: { increment: quantity } },
      }),
    ]);

    // --- BONUS: Cache response for idempotency (TTL = reservation window + buffer) ---
    if (idempotencyKey) {
      await redis.set(`idem:reserve:${idempotencyKey}`, reservation, {
        ex: RESERVATION_WINDOW_MINUTES * 60 + 60,
      });
    }

    return NextResponse.json(reservation, { status: 201 });
  } finally {
    // Always release lock, even if an error occurs
    await releaseLock(lockKey, lockValue);
  }
}
