/**
 * Coolify API Client
 * Manages Docker deployments via Coolify's REST API
 * 
 * Docs: https://coolify.io/docs/api
 */

const COOLIFY_URL = process.env.COOLIFY_API_URL || process.env.COOLIFY_URL;
const COOLIFY_TOKEN = process.env.COOLIFY_API_TOKEN;

export interface CoolifyApplication {
  uuid: string;
  name: string;
  description: string | null;
  fqdn: string;
  status: string;
  repository_project_id: number | null;
  git_repository: string | null;
  git_branch: string | null;
  build_pack: string;
  created_at: string;
  updated_at: string;
}

export interface CoolifyDeployment {
  uuid: string;
  status: 'queued' | 'in_progress' | 'finished' | 'failed' | 'cancelled';
  created_at: string;
  updated_at: string;
  application_uuid?: string;
  commit?: string;
}

export interface CoolifyProject {
  uuid: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoolifyService {
  uuid: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CoolifyDatabase {
  uuid: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CoolifyServer {
  uuid: string;
  name: string;
  description: string | null;
  ip: string;
  user: string;
  port: number;
  settings: {
    is_reachable: boolean;
    is_usable: boolean;
  };
}

// Check if Coolify is configured
export function isCoolifyAvailable(): boolean {
  return !!(COOLIFY_URL && COOLIFY_TOKEN);
}

// Generic API request
async function coolifyRequest<T>(
  method: string,
  endpoint: string,
  body?: unknown
): Promise<T> {
  if (!COOLIFY_URL || !COOLIFY_TOKEN) {
    throw new Error('Coolify not configured. Set COOLIFY_API_URL and COOLIFY_API_TOKEN.');
  }

  const url = `${COOLIFY_URL}/api/v1${endpoint}`;
  
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${COOLIFY_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Coolify API error: ${res.status} ${text}`);
  }

  return res.json();
}

// Get all projects
export async function getProjects(): Promise<CoolifyProject[]> {
  return coolifyRequest<CoolifyProject[]>('GET', '/projects');
}

// Get all applications
export async function getApplications(): Promise<CoolifyApplication[]> {
  return coolifyRequest<CoolifyApplication[]>('GET', '/applications');
}

// Get single application
export async function getApplication(uuid: string): Promise<CoolifyApplication> {
  return coolifyRequest<CoolifyApplication>('GET', `/applications/${uuid}`);
}

// Get application deployments
export async function getApplicationDeployments(uuid: string): Promise<CoolifyDeployment[]> {
  return coolifyRequest<CoolifyDeployment[]>('GET', `/applications/${uuid}/deployments`);
}

// Restart application
export async function restartApplication(uuid: string): Promise<{ message: string; deployment_uuid: string }> {
  return coolifyRequest('POST', `/applications/${uuid}/restart`);
}

// Stop application
export async function stopApplication(uuid: string): Promise<{ message: string }> {
  return coolifyRequest('POST', `/applications/${uuid}/stop`);
}

// Start application
export async function startApplication(uuid: string): Promise<{ message: string }> {
  return coolifyRequest('POST', `/applications/${uuid}/start`);
}

// Get all services
export async function getServices(): Promise<CoolifyService[]> {
  return coolifyRequest<CoolifyService[]>('GET', '/services');
}

// Get all databases
export async function getDatabases(): Promise<CoolifyDatabase[]> {
  return coolifyRequest<CoolifyDatabase[]>('GET', '/databases');
}

// Get servers
export async function getServers(): Promise<CoolifyServer[]> {
  return coolifyRequest<CoolifyServer[]>('GET', '/servers');
}

// Get single deployment
export async function getDeployment(uuid: string): Promise<CoolifyDeployment> {
  return coolifyRequest<CoolifyDeployment>('GET', `/deployments/${uuid}`);
}

// Get recent deployments across all apps
export async function getRecentDeployments(limit: number = 10): Promise<CoolifyDeployment[]> {
  // Coolify doesn't have a global deployments endpoint, so we need to aggregate
  const apps = await getApplications();
  const allDeployments: CoolifyDeployment[] = [];
  
  for (const app of apps.slice(0, 10)) { // Limit to first 10 apps
    try {
      const deployments = await getApplicationDeployments(app.uuid);
      allDeployments.push(...deployments.slice(0, 5).map(d => ({
        ...d,
        application_uuid: app.uuid,
      })));
    } catch {
      // Skip if we can't get deployments for this app
    }
  }
  
  // Sort by created_at descending and limit
  return allDeployments
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

// Get overview stats
export async function getOverview(): Promise<{
  applications: number;
  services: number;
  databases: number;
  servers: number;
  runningApps: number;
}> {
  const [apps, services, databases, servers] = await Promise.all([
    getApplications().catch(() => []),
    getServices().catch(() => []),
    getDatabases().catch(() => []),
    getServers().catch(() => []),
  ]);

  const runningApps = apps.filter(a => 
    a.status?.toLowerCase().includes('running')
  ).length;

  return {
    applications: apps.length,
    services: services.length,
    databases: databases.length,
    servers: servers.length,
    runningApps,
  };
}
