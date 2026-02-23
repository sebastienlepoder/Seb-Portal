import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { syncConfigToDb, loadServicesFromFile } from '@/lib/config';

// GET - Check config status
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Load config file
    const config = loadServicesFromFile();
    
    return NextResponse.json({
      ok: true,
      data: {
        sectionsCount: config.sections?.length || 0,
        servicesCount: config.services?.length || 0,
        sections: config.sections,
        sampleServices: config.services?.slice(0, 3).map(s => ({ id: s.id, name: s.name })),
      },
    });
  } catch (error) {
    console.error('Config check error:', error);
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST - Force sync config to DB
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[SyncConfig] Starting manual sync...');
    const result = await syncConfigToDb();
    console.log('[SyncConfig] Sync complete:', result);

    return NextResponse.json({
      ok: true,
      data: result,
      message: `Synced: ${result.created} created, ${result.updated} updated`,
    });
  } catch (error) {
    console.error('[SyncConfig] Sync error:', error);
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}
