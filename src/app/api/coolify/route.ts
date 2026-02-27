import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import {
  isCoolifyAvailable,
  getOverview,
  getApplications,
  getApplication,
  getApplicationDeployments,
  getServices,
  getDatabases,
  getServers,
  getDeployment,
  restartApplication,
  stopApplication,
  startApplication,
} from '@/lib/coolify';

// GET /api/coolify - Get Coolify data
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!isCoolifyAvailable()) {
      return NextResponse.json({
        ok: true,
        data: {
          available: false,
          message: 'Coolify not configured. Set COOLIFY_API_URL and COOLIFY_API_TOKEN.',
        },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'overview';
    const uuid = url.searchParams.get('uuid');

    switch (action) {
      case 'overview': {
        const overview = await getOverview();
        return NextResponse.json({
          ok: true,
          data: { available: true, ...overview },
        });
      }

      case 'applications': {
        const apps = await getApplications();
        return NextResponse.json({
          ok: true,
          data: { available: true, applications: apps },
        });
      }

      case 'application': {
        if (!uuid) {
          return NextResponse.json({ ok: false, error: 'UUID required' }, { status: 400 });
        }
        const app = await getApplication(uuid);
        const deployments = await getApplicationDeployments(uuid).catch(() => []);
        return NextResponse.json({
          ok: true,
          data: { available: true, application: app, deployments: deployments.slice(0, 10) },
        });
      }

      case 'services': {
        const services = await getServices();
        return NextResponse.json({
          ok: true,
          data: { available: true, services },
        });
      }

      case 'databases': {
        const databases = await getDatabases();
        return NextResponse.json({
          ok: true,
          data: { available: true, databases },
        });
      }

      case 'servers': {
        const servers = await getServers();
        return NextResponse.json({
          ok: true,
          data: { available: true, servers },
        });
      }

      case 'deployment': {
        if (!uuid) {
          return NextResponse.json({ ok: false, error: 'UUID required' }, { status: 400 });
        }
        const deployment = await getDeployment(uuid);
        return NextResponse.json({
          ok: true,
          data: { available: true, deployment },
        });
      }

      case 'full': {
        const [overview, apps, services, databases, servers] = await Promise.all([
          getOverview(),
          getApplications(),
          getServices(),
          getDatabases(),
          getServers(),
        ]);
        return NextResponse.json({
          ok: true,
          data: {
            available: true,
            ...overview,
            applicationsList: apps,
            servicesList: services,
            databasesList: databases,
            serversList: servers,
          },
        });
      }

      default:
        return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Coolify API error:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// POST /api/coolify - Control applications
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role?.toLowerCase() !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Admin required' }, { status: 403 });
    }

    if (!isCoolifyAvailable()) {
      return NextResponse.json({ ok: false, error: 'Coolify not available' }, { status: 503 });
    }

    const body = await req.json();
    const { action, uuid } = body;

    if (!uuid) {
      return NextResponse.json({ ok: false, error: 'UUID required' }, { status: 400 });
    }

    switch (action) {
      case 'restart': {
        const result = await restartApplication(uuid);
        return NextResponse.json({ ok: true, ...result });
      }

      case 'stop': {
        const result = await stopApplication(uuid);
        return NextResponse.json({ ok: true, ...result });
      }

      case 'start': {
        const result = await startApplication(uuid);
        return NextResponse.json({ ok: true, ...result });
      }

      default:
        return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Coolify control error:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
