import prisma from './db';
import { writeActivity } from './activity';

export type AuditAction =
  | 'login_success'
  | 'login_fail'
  | 'login_rate_limited'
  | 'logout'
  | 'admin_action'
  | 'service_create'
  | 'service_update'
  | 'service_delete'
  | 'icon_regenerate'
  | 'backup_export'
  | 'backup_import'
  | 'totp_enable'
  | 'totp_disable'
  | 'ai_chat'
  | 'mcp_execute'
  | 'urgent_item_action';

export async function auditLog(params: {
  userId?: string;
  action: AuditAction;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        details: params.details ? JSON.stringify(params.details) : null,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (e) {
    console.error('Audit log error:', e);
  }

  // Fan out to the live activity feed. Failures here are isolated from
  // the audit write above so the security log is never blocked by the
  // display layer.
  try {
    const surfaced = surfaceActivity(params.action, params.details, params.userId);
    if (surfaced) {
      await writeActivity({
        type: surfaced.type,
        description: surfaced.description,
        entityType: surfaced.entityType ?? null,
        entityId: surfaced.entityId ?? null,
        actor: params.userId ?? null,
        data: params.details,
      });
    }
  } catch (e) {
    console.error('Activity surface error:', e);
  }
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
  );
}

// Map AuditLog rows to user-facing activity events. Returning null
// skips the activity feed for noisy or sensitive actions.
function surfaceActivity(
  action: AuditAction,
  details: Record<string, unknown> | undefined,
  userId: string | undefined
): { type: string; description: string; entityType?: string; entityId?: string } | null {
  const d = details ?? {};
  const who = (userId ? `user ${userId.slice(0, 8)}` : 'someone');

  switch (action) {
    case 'login_success':
      return { type: 'auth.login', description: `${who} signed in` };
    case 'login_fail':
      return { type: 'auth.login_fail', description: `Failed sign-in attempt for ${str(d.email) ?? 'unknown'}` };
    case 'login_rate_limited':
      return { type: 'auth.rate_limited', description: 'Sign-in rate-limited' };
    case 'logout':
      return { type: 'auth.logout', description: `${who} signed out` };
    case 'service_create':
      return {
        type: 'service.created',
        description: `Service "${str(d.name) ?? 'unnamed'}" created`,
        entityType: 'service',
        entityId: str(d.id),
      };
    case 'service_update':
      return {
        type: 'service.updated',
        description: `Service "${str(d.name) ?? 'unnamed'}" updated`,
        entityType: 'service',
        entityId: str(d.id),
      };
    case 'service_delete':
      return {
        type: 'service.deleted',
        description: `Service "${str(d.name) ?? 'unnamed'}" deleted`,
        entityType: 'service',
        entityId: str(d.id),
      };
    case 'icon_regenerate':
      return { type: 'service.icon_regenerated', description: `Icon regenerated for service ${str(d.serviceId) ?? ''}` };
    case 'backup_export':
      return { type: 'admin.backup_export', description: 'Backup exported' };
    case 'backup_import':
      return { type: 'admin.backup_import', description: `Backup imported (${str(d.count) ?? '?'} items)` };
    case 'totp_enable':
      return { type: 'auth.totp_enabled', description: `${who} enabled TOTP 2FA` };
    case 'totp_disable':
      return { type: 'auth.totp_disabled', description: `${who} disabled TOTP 2FA` };
    case 'ai_chat':
      return null; // chat traffic is high-volume; keep out of the feed
    case 'mcp_execute':
      return {
        type: 'mcp.executed',
        description: `MCP tool "${str(d.toolName) ?? 'unknown'}" executed`,
        entityType: 'tool',
        entityId: str(d.toolName),
      };
    case 'urgent_item_action':
      return { type: 'urgent.action', description: `Urgent item ${str(d.action) ?? 'changed'}` };
    case 'admin_action':
      return { type: 'admin.action', description: `Admin: ${str(d.action) ?? 'action'}` };
    default:
      return null;
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : v == null ? undefined : String(v);
}
