// Microsoft Graph API Helper
// Handles OAuth and API calls for OneNote + Outlook

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!;
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';
const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI!;

const SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Notes.Read',
  'Notes.ReadWrite',
  'Notes.Create',
  'Mail.Read',
  'Mail.ReadWrite',
  'Mail.Send',
].join(' ');

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri: MICROSOFT_REDIRECT_URI,
    response_mode: 'query',
    scope: SCOPES,
    state,
  });
  return `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  id_token?: string;
}> {
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    client_secret: MICROSOFT_CLIENT_SECRET,
    code,
    redirect_uri: MICROSOFT_REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    }
  );

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}> {
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    client_secret: MICROSOFT_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    }
  );

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  return res.json();
}

export async function getMicrosoftUser(accessToken: string): Promise<{
  id: string;
  mail: string;
  displayName: string;
  userPrincipalName: string;
}> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error('Failed to get Microsoft user info');
  }

  return res.json();
}

// ─── Graph API Helper ───────────────────────────────────────

export async function graphApi<T>(
  accessToken: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `https://graph.microsoft.com/v1.0${endpoint}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Graph API error (${res.status}): ${error}`);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

// ─── OneNote API ────────────────────────────────────────────

export interface OneNoteNotebook {
  id: string;
  displayName: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  isDefault: boolean;
  sectionsUrl: string;
  links: {
    oneNoteClientUrl: { href: string };
    oneNoteWebUrl: { href: string };
  };
}

export interface OneNoteSection {
  id: string;
  displayName: string;
  createdDateTime: string;
  pagesUrl: string;
  parentNotebook?: { id: string; displayName: string };
}

export interface OneNotePage {
  id: string;
  title: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  contentUrl: string;
  links: {
    oneNoteClientUrl: { href: string };
    oneNoteWebUrl: { href: string };
  };
}

export async function getNotebooks(accessToken: string): Promise<OneNoteNotebook[]> {
  const data = await graphApi<{ value: OneNoteNotebook[] }>(
    accessToken,
    '/me/onenote/notebooks'
  );
  return data.value;
}

export async function getSections(accessToken: string, notebookId: string): Promise<OneNoteSection[]> {
  const data = await graphApi<{ value: OneNoteSection[] }>(
    accessToken,
    `/me/onenote/notebooks/${notebookId}/sections`
  );
  return data.value;
}

export async function getPages(accessToken: string, sectionId: string): Promise<OneNotePage[]> {
  const data = await graphApi<{ value: OneNotePage[] }>(
    accessToken,
    `/me/onenote/sections/${sectionId}/pages`
  );
  return data.value;
}

export async function getPageContent(accessToken: string, pageId: string): Promise<string> {
  const url = `https://graph.microsoft.com/v1.0/me/onenote/pages/${pageId}/content`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error('Failed to get page content');
  }

  return res.text();
}

export async function createPage(
  accessToken: string,
  sectionId: string,
  title: string,
  htmlContent: string
): Promise<OneNotePage> {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
      </head>
      <body>
        ${htmlContent}
      </body>
    </html>
  `;

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/onenote/sections/${sectionId}/pages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/xhtml+xml',
      },
      body: html,
    }
  );

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create page: ${error}`);
  }

  return res.json();
}

// ─── Outlook Mail API ───────────────────────────────────────

export interface OutlookMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  body?: { contentType: string; content: string };
  from: { emailAddress: { name: string; address: string } };
  toRecipients: { emailAddress: { name: string; address: string } }[];
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  webLink: string;
}

export async function getMessages(
  accessToken: string,
  options: { top?: number; folder?: string; filter?: string } = {}
): Promise<OutlookMessage[]> {
  const { top = 20, folder = 'inbox', filter } = options;
  let endpoint = `/me/mailFolders/${folder}/messages?$top=${top}&$orderby=receivedDateTime desc`;
  if (filter) {
    endpoint += `&$filter=${encodeURIComponent(filter)}`;
  }

  const data = await graphApi<{ value: OutlookMessage[] }>(accessToken, endpoint);
  return data.value;
}

export async function getMessage(accessToken: string, messageId: string): Promise<OutlookMessage> {
  return graphApi<OutlookMessage>(accessToken, `/me/messages/${messageId}`);
}

export async function sendMail(
  accessToken: string,
  to: string[],
  subject: string,
  body: string,
  isHtml = true
): Promise<void> {
  await graphApi(accessToken, '/me/sendMail', {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: isHtml ? 'HTML' : 'Text',
          content: body,
        },
        toRecipients: to.map((email) => ({
          emailAddress: { address: email },
        })),
      },
    }),
  });
}

export async function replyToMail(
  accessToken: string,
  messageId: string,
  body: string,
  replyAll = false
): Promise<void> {
  const endpoint = replyAll
    ? `/me/messages/${messageId}/replyAll`
    : `/me/messages/${messageId}/reply`;

  await graphApi(accessToken, endpoint, {
    method: 'POST',
    body: JSON.stringify({
      comment: body,
    }),
  });
}

export async function markAsRead(accessToken: string, messageId: string, isRead = true): Promise<void> {
  await graphApi(accessToken, `/me/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ isRead }),
  });
}
