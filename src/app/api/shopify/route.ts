import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';

/**
 * Shopify Admin API connector scaffold.
 * Required: SHOPIFY_SHOP_DOMAIN, SHOPIFY_ACCESS_TOKEN
 * Scopes needed: read_orders, read_products, read_analytics
 */
export async function GET(request: Request) {
  try {
    await requireApiAdmin();

    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!shopDomain || !accessToken) {
      return NextResponse.json({
        ok: true,
        data: {
          configured: false,
          message: 'Shopify not configured. Set SHOPIFY_SHOP_DOMAIN and SHOPIFY_ACCESS_TOKEN.',
          setupSteps: [
            '1. Go to Shopify Admin > Settings > Apps and sales channels > Develop apps',
            '2. Create a custom app for the portal',
            '3. Configure API scopes: read_orders, read_products, read_analytics',
            '4. Install the app and copy the Admin API access token',
            '5. Set SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com in .env',
            '6. Set SHOPIFY_ACCESS_TOKEN=shpat_... in .env',
          ],
        },
      });
    }

    const url = new URL(request.url);
    const metric = url.searchParams.get('metric') || 'summary';
    const apiVersion = '2024-01';
    const baseUrl = `https://${shopDomain}/admin/api/${apiVersion}`;

    const headers = { 'X-Shopify-Access-Token': accessToken };
    const today = new Date().toISOString().split('T')[0];

    if (metric === 'orders_today') {
      const res = await fetch(
        `${baseUrl}/orders/count.json?created_at_min=${today}T00:00:00Z&status=any`,
        { headers, signal: AbortSignal.timeout(5000) }
      );
      const data = await res.json();
      return NextResponse.json({ ok: true, data: { ordersToday: data.count } });
    }

    if (metric === 'unfulfilled') {
      const res = await fetch(
        `${baseUrl}/orders/count.json?fulfillment_status=unfulfilled`,
        { headers, signal: AbortSignal.timeout(5000) }
      );
      const data = await res.json();
      return NextResponse.json({ ok: true, data: { unfulfilledOrders: data.count } });
    }

    // Summary: orders today + unfulfilled
    const [ordersRes, unfulfilledRes] = await Promise.all([
      fetch(`${baseUrl}/orders/count.json?created_at_min=${today}T00:00:00Z&status=any`, {
        headers,
        signal: AbortSignal.timeout(5000),
      }),
      fetch(`${baseUrl}/orders/count.json?fulfillment_status=unfulfilled`, {
        headers,
        signal: AbortSignal.timeout(5000),
      }),
    ]);

    const ordersData = await ordersRes.json();
    const unfulfilledData = await unfulfilledRes.json();

    return NextResponse.json({
      ok: true,
      data: {
        configured: true,
        shop: shopDomain,
        ordersToday: ordersData.count,
        unfulfilledOrders: unfulfilledData.count,
      },
    });
  } catch (e) {
    if ((e as Error).message === 'FORBIDDEN') {
      return NextResponse.json({ ok: false, error: 'Admin required' }, { status: 403 });
    }
    console.error('Shopify error:', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
