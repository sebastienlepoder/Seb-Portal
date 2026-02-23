import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';

/**
 * Synology File Station API scaffold.
 * WARNING: Never expose DSM publicly. Use Tailscale only.
 * Required: SYNOLOGY_URL, SYNOLOGY_USERNAME, SYNOLOGY_PASSWORD
 */
export async function GET(request: Request) {
  try {
    await requireApiAdmin();

    const synUrl = process.env.SYNOLOGY_URL;
    const synUser = process.env.SYNOLOGY_USERNAME;
    const synPass = process.env.SYNOLOGY_PASSWORD;

    if (!synUrl || !synUser || !synPass) {
      return NextResponse.json({
        ok: true,
        data: {
          configured: false,
          message: 'Synology File Station not configured.',
          warnings: [
            'NEVER expose Synology DSM to the public internet.',
            'Only access DSM via Tailscale VPN.',
            'Use a dedicated portal account with minimal File Station permissions.',
          ],
          setupSteps: [
            '1. Enable File Station in DSM Package Center',
            '2. Create a dedicated user with File Station access only',
            '3. Set SYNOLOGY_URL=https://your-nas-ip:5001 (Tailscale IP recommended)',
            '4. Set SYNOLOGY_USERNAME and SYNOLOGY_PASSWORD in .env',
          ],
        },
      });
    }

    const url = new URL(request.url);
    const path = url.searchParams.get('path') || '/';

    // Authenticate
    const authRes = await fetch(
      `${synUrl}/webapi/auth.cgi?api=SYNO.API.Auth&version=6&method=login&account=${encodeURIComponent(synUser)}&passwd=${encodeURIComponent(synPass)}&format=sid`,
      { signal: AbortSignal.timeout(5000) }
    );
    const authData = await authRes.json();
    if (!authData.success) {
      return NextResponse.json({ ok: false, error: 'Synology auth failed' }, { status: 502 });
    }
    const sid = authData.data.sid;

    // List folder
    const listRes = await fetch(
      `${synUrl}/webapi/entry.cgi?api=SYNO.FileStation.List&version=2&method=list&folder_path=${encodeURIComponent(path)}&_sid=${sid}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const listData = await listRes.json();

    // Logout
    await fetch(
      `${synUrl}/webapi/auth.cgi?api=SYNO.API.Auth&version=6&method=logout&_sid=${sid}`
    ).catch(() => {});

    if (!listData.success) {
      return NextResponse.json({ ok: false, error: 'File listing failed' }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        configured: true,
        path,
        files: listData.data.files?.map((f: Record<string, unknown>) => ({
          name: f.name,
          path: f.path,
          isdir: f.isdir,
        })),
      },
    });
  } catch (e) {
    if ((e as Error).message === 'FORBIDDEN') {
      return NextResponse.json({ ok: false, error: 'Admin required' }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
