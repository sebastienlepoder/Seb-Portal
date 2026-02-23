import prisma from './db';

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
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
  );
}
