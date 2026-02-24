import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// Status file for tracking updates
const STATUS_FILE = process.env.UPDATE_STATUS_FILE || '/data/update-status.json';
const TRIGGER_FILE = process.env.UPDATE_TRIGGER_FILE || '/data/update-trigger';
const WEBHOOK_URL = process.env.UPDATE_WEBHOOK_URL;

interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'updating' | 'success' | 'error';
  currentVersion?: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  lastCheck?: string;
  lastUpdate?: string;
  error?: string;
  changelog?: string[];
}

// GET - Check for updates
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role?.toLowerCase() !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get current version
    let currentVersion = 'unknown';
    let latestVersion = 'unknown';
    let updateAvailable = false;
    let changelog: string[] = [];

    // Read current version from .version file (created at build time)
    try {
      const versionFile = path.join(process.cwd(), '.version');
      currentVersion = (await fs.readFile(versionFile, 'utf-8')).trim();
    } catch {
      // Fallback: try git directly (works in dev)
      try {
        const { stdout } = await execAsync('git rev-parse --short HEAD');
        currentVersion = stdout.trim();
      } catch {
        console.log('No .version file and git not available');
      }
    }

    // Get latest version from GitHub API
    const GITHUB_REPO = process.env.GITHUB_REPO || 'sebastienlepoder/lepoder-portal';
    try {
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/commits/main`,
        { headers: { 'Accept': 'application/vnd.github.v3+json' }, next: { revalidate: 60 } }
      );
      if (response.ok) {
        const data = await response.json();
        latestVersion = data.sha?.substring(0, 7) || 'unknown';
        
        // Check if update available
        updateAvailable = currentVersion !== 'unknown' && 
                          latestVersion !== 'unknown' && 
                          currentVersion !== latestVersion;

        // Get recent commits for changelog if update available
        if (updateAvailable) {
          const commitsRes = await fetch(
            `https://api.github.com/repos/${GITHUB_REPO}/commits?per_page=10`,
            { headers: { 'Accept': 'application/vnd.github.v3+json' } }
          );
          if (commitsRes.ok) {
            const commits = await commitsRes.json();
            changelog = commits
              .map((c: any) => c.commit?.message?.split('\n')[0])
              .filter(Boolean)
              .slice(0, 10);
          }
        }
      }
    } catch (githubError) {
      console.error('GitHub API error:', githubError);
    }

    // Check for status from update script
    let lastUpdateStatus: Partial<UpdateStatus> = {};
    try {
      const statusContent = await fs.readFile(STATUS_FILE, 'utf-8');
      lastUpdateStatus = JSON.parse(statusContent);
    } catch {
      // No status file yet
    }

    const status: UpdateStatus = {
      status: updateAvailable ? 'available' : 'idle',
      currentVersion,
      latestVersion,
      updateAvailable,
      lastCheck: new Date().toISOString(),
      changelog,
      ...lastUpdateStatus,
    };

    return NextResponse.json({ ok: true, data: status });
  } catch (error) {
    console.error('Update check error:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to check for updates' },
      { status: 500 }
    );
  }
}

// POST - Trigger update
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role?.toLowerCase() !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { confirm } = body;

    if (!confirm) {
      return NextResponse.json(
        { ok: false, error: 'Please confirm the update by sending { "confirm": true }' },
        { status: 400 }
      );
    }

    // Method 1: Webhook (preferred for Synology)
    if (WEBHOOK_URL) {
      try {
        const response = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update',
            timestamp: new Date().toISOString(),
            requestedBy: user.email,
          }),
        });

        if (response.ok) {
          return NextResponse.json({
            ok: true,
            message: 'Update triggered via webhook. The portal will restart shortly.',
            method: 'webhook',
          });
        }
      } catch (webhookError) {
        console.error('Webhook error:', webhookError);
      }
    }

    // Method 2: Trigger file (for cron-based updates)
    try {
      const triggerData = {
        action: 'update',
        timestamp: new Date().toISOString(),
        requestedBy: user.email,
      };
      
      await fs.writeFile(TRIGGER_FILE, JSON.stringify(triggerData));
      
      return NextResponse.json({
        ok: true,
        message: 'Update request saved. If auto-update is configured, it will run shortly.',
        method: 'trigger-file',
        note: 'Run scripts/update.sh on host if auto-update is not configured.',
      });
    } catch (fileError) {
      console.error('Trigger file error:', fileError);
    }

    // Method 3: Return manual instructions
    return NextResponse.json({
      ok: true,
      message: 'Update requested but no automatic trigger available.',
      method: 'manual',
      instructions: [
        'SSH into your Synology',
        'cd /volume1/docker/lepoder-portal',
        'sudo ./scripts/update.sh',
      ],
    });
  } catch (error) {
    console.error('Update trigger error:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to trigger update' },
      { status: 500 }
    );
  }
}
