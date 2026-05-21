// ─── Service Config Types ────────────────────────────────────

export type ServiceType =
  | 'internal'
  | 'external'
  | 'github'
  | 'email'
  | 'remote'
  | 'bookmark'
  | 'tool'
  | 'ai';

export type OpenMode = 'new_tab' | 'iframe' | 'modal' | 'sidepanel';

export type StatusColor = 'green' | 'yellow' | 'red' | 'gray';

export interface ServiceConfig {
  id: string;
  name: string;
  url: string;
  type: ServiceType;
  description?: string;
  tags?: string[];
  category: string;
  section: string;
  openMode: OpenMode;
  requiresVPN: boolean;
  statusCheckUrl?: string;
  favoriteDefault?: boolean;
  icon?: string;
  credentialsHint?: string;
  sortOrder?: number;
  enabled?: boolean;
}

export interface ServiceWithStatus extends ServiceConfig {
  status: StatusColor;
  latencyMs?: number;
  isFavorite?: boolean;
  iconUrl?: string;
}

// ─── Auth Types ──────────────────────────────────────────────

export interface SessionUser {
  id: string;
  email: string;
  role: 'admin' | 'user';
  displayName?: string;
}

export interface SessionData {
  user?: SessionUser;
  csrfToken?: string;

  // Microsoft Graph OAuth state (CSRF protection)
  microsoftState?: string;

  // Microsoft Graph (delegated OAuth tokens stored in session)
  msftAccessToken?: string;
  msftRefreshToken?: string;
  msftExpiresAt?: number; // epoch ms
}

// ─── VPN Types ───────────────────────────────────────────────

export type VpnHealthcheckMode = 'ping_url' | 'tailscale_local_api' | 'manual';

export interface VpnStatus {
  connected: boolean;
  mode: VpnHealthcheckMode;
  lastChecked: string;
  message?: string;
}

// ─── Urgent Inbox ────────────────────────────────────────────

export interface UrgentItemPayload {
  title: string;
  snippet?: string;
  priority?: 'critical' | 'high' | 'normal' | 'low';
  actionUrl?: string;
  source?: string;
}

// ─── AI Types ────────────────────────────────────────────────

export type AiProvider = 'openai' | 'anthropic';

export interface AiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** Optional base64 data URIs (e.g. data:image/png;base64,...). Only
   *  meaningful on user messages; the chat route forwards them to
   *  Anthropic on the final user turn and persists them with the
   *  message so reload restores the UI. */
  images?: string[];
}

export interface AiChatRequest {
  provider: AiProvider;
  messages: AiMessage[];
  threadId?: string;
  maxTokens?: number;
}

// ─── MCP Types ───────────────────────────────────────────────

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: string; // endpoint or function reference
  requiresAuth: boolean;
  adminOnly: boolean;
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  tools: McpTool[];
}

// ─── Weather Types ───────────────────────────────────────────

export interface WeatherData {
  location: string;
  temperature: number;
  unit: 'C' | 'F';
  condition: string;
  icon: string;
  humidity: number;
  wind: number;
  forecast?: WeatherForecastDay[];
  updatedAt: string;
}

export interface WeatherForecastDay {
  date: string;
  high: number;
  low: number;
  condition: string;
  icon: string;
}

// ─── Markets Types ───────────────────────────────────────────

export interface MarketQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  sparkline?: number[];
  updatedAt: string;
}

// ─── Reports ─────────────────────────────────────────────────

export interface ReportData {
  mostVisited: { serviceId: string; name: string; count: number }[];
  favoritesUsage: { serviceId: string; name: string; count: number }[];
  uptimeSummary: { serviceId: string; name: string; upPercent: number }[];
  loginActivity: { date: string; success: number; fail: number }[];
  urgentInteractions: number;
}

// ─── API Response ────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}
