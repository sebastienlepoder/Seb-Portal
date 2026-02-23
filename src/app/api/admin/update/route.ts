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
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get current version
    let currentVersion = 'unknown';
    let latestVersion = 'unknown';
    let updateAvailable = false;
    let changelog: string[] = [];

    try {
      // Get current commit
      const { stdout: currentCommit } = await execAsync('git rev-parse --short HEAD');
      currentVersion = currentCommit.trim();

      // Fetch latest from remote
      await execAsync('git fetch origin main --quiet');

      // Get remote commit
      const { stdout: remoteCommit } = await execAsync('git rev-parse --short origin/main');
      latestVersion = remoteCommit.trim();

      updateAvailable = currentVersion !== latestVersion;

      // Get changelog if update available
      if (updateAvailable) {
        const { stdout: log } = await execAsync(
          `git log --oneline ${currentVersion}..origin/main --pretty=format:"%s" | head -10`
        );
        changelog = log.trim().split('\n').filter(Boolean);
      }
    } catch (gitError) {
      console.error('Git error:', gitError);
      // Git not available or not a git repo - check status file instead
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
    if (!user || user.role !== 'admin') {
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
