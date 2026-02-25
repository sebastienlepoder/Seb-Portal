/**
 * Service Status Checker
 * Checks health of services via HEAD/GET with TTL caching.
 * For VPN-required services, respects VPN status to avoid false alarms.
 */

import prisma from '@/lib/db';
import type { StatusColor } from '@/types';

interface StatusCacheEntry {
  status: StatusColor;
  latencyMs: number;
  checkedAt: number;
  message?: string;
}

const statusCache = new Map<string, StatusCacheEntry>();
const DEFAULT_TTL_MS = 60_000; // 60s
const TIMEOUT_MS = 3000;

export async function checkServiceStatus(
  serviceId: string,
  url: string,
  opts?: { vpnConnected?: boolean; requiresVPN?: boolean; ttlMs?: number; skipLog?: boolean }
): Promise<{ status: StatusColor; latencyMs: number; message?: string }> {
  const ttl = opts?.ttlMs ?? DEFAULT_TTL_MS;

  // Check cache first
  const cached = statusCache.get(serviceId);
  if (cached && Date.now() - cached.checkedAt < ttl) {
    return { status: cached.status, latencyMs: cached.latencyMs, message: cached.message };
  }

  // If VPN required but VPN is down, return gray instead of red
  if (opts?.requiresVPN && opts.vpnConnected === false) {
    const result = { status: 'gray' as StatusColor, latencyMs: 0, message: 'VPN not connected' };
    statusCache.set(serviceId, { ...result, checkedAt: Date.now() });
    return result;
  }

  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    }).catch(async () => {
      // Fallback to GET if HEAD fails
      return fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
      });
    });

    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    let status: StatusColor;
    if (response.ok) {
      status = latencyMs > 2000 ? 'yellow' : 'green';
    } else if (response.status >= 500) {
      status = 'red';
    } else {
      status = 'yellow';
    }

    const result = { status, latencyMs, message: `HTTP ${response.status}` };
    statusCache.set(serviceId, { ...result, checkedAt: Date.now() });

    // Persist to DB (skip if called from batch operation)
    if (!opts?.skipLog) {
      await prisma.statusLog.create({
        data: { serviceId, status, latencyMs, message: result.message },
      }).catch(() => {}); // non-critical
    }

    return result;
  } catch (e) {
    const message = (e as Error).name === 'AbortError' ? 'Timeout' : (e as Error).message;
    const result = { status: 'red' as StatusColor, latencyMs: TIMEOUT_MS, message };
    statusCache.set(serviceId, { ...result, checkedAt: Date.now() });

    if (!opts?.skipLog) {
      await prisma.statusLog.create({
        data: { serviceId, status: 'red', latencyMs: TIMEOUT_MS, message },
      }).catch(() => {});
    }

    return result;
  }
}

/** Same as checkServiceStatus but skips DB logging (for batch operations) */
async function checkServiceStatusNoLog(
  serviceId: string,
  url: string,
  opts?: { vpnConnected?: boolean; requiresVPN?: boolean; ttlMs?: number }
): Promise<{ status: StatusColor; latencyMs: number; message?: string }> {
  return checkServiceStatus(serviceId, url, { ...opts, skipLog: true });
}

export async function checkAllStatuses(vpnConnected: boolean) {
  const services = await prisma.service.findMany({
    where: { enabled: true, statusEnabled: true },
  });

  const results: Record<string, { status: StatusColor; latencyMs: number }> = {};
  const logsToCreate: { serviceId: string; status: string; latencyMs: number; message?: string }[] = [];

  await Promise.allSettled(
    services.map(async (svc) => {
      const url = svc.statusCheckUrl || svc.url;
      const result = await checkServiceStatusNoLog(svc.id, url, {
        vpnConnected,
        requiresVPN: svc.requiresVPN,
      });
      results[svc.id] = result;
      logsToCreate.push({
        serviceId: svc.id,
        status: result.status,
        latencyMs: result.latencyMs,
        message: result.message,
      });
    })
  );

  // Batch insert all logs at once to avoid SQLite concurrent write issues
  if (logsToCreate.length > 0) {
    await prisma.statusLog.createMany({ data: logsToCreate }).catch((e) => {
      console.error('prisma:warn Failed to batch insert status logs:', e.message);
    });
  }

  return results;
}

export function clearStatusCache() {
  statusCache.clear();
}
