import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

const GUACAMOLE_URL = process.env.GUACAMOLE_URL || 'http://187.77.214.29:8090/guacamole';
const GUACAMOLE_USER = process.env.GUACAMOLE_USER || 'guacadmin';
const GUACAMOLE_PASS = process.env.GUACAMOLE_PASS || 'guacadmin';

interface GuacTokenResponse {
  authToken: string;
  username: string;
  dataSource: string;
  availableDataSources: string[];
}

interface GuacConnection {
  identifier: string;
  name: string;
  protocol: string;
  parentIdentifier?: string;
  activeConnections?: number;
}

interface GuacConnectionGroup {
  identifier: string;
  name: string;
  type: string;
  childConnections?: Record<string, GuacConnection>;
  childConnectionGroups?: Record<string, GuacConnectionGroup>;
}

async function getGuacamoleToken(): Promise<string | null> {
  try {
    const formData = new URLSearchParams();
    formData.append('username', GUACAMOLE_USER);
    formData.append('password', GUACAMOLE_PASS);

    const response = await fetch(`${GUACAMOLE_URL}/api/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      console.error('Guacamole auth failed:', response.status);
      return null;
    }

    const data: GuacTokenResponse = await response.json();
    return data.authToken;
  } catch (error) {
    console.error('Guacamole auth error:', error);
    return null;
  }
}

async function fetchConnections(token: string): Promise<{ connections: GuacConnection[]; groups: GuacConnectionGroup[] }> {
  try {
    // Fetch connection groups (includes connections)
    const response = await fetch(
      `${GUACAMOLE_URL}/api/session/data/postgresql/connectionGroups/ROOT/tree?token=${token}`,
      {
        headers: {
          'Guacamole-Token': token,
        },
      }
    );

    if (!response.ok) {
      // Try alternative endpoint for MySQL/other backends
      const altResponse = await fetch(
        `${GUACAMOLE_URL}/api/session/data/mysql/connectionGroups/ROOT/tree?token=${token}`,
        {
          headers: {
            'Guacamole-Token': token,
          },
        }
      );
      
      if (!altResponse.ok) {
        console.error('Failed to fetch connections:', response.status);
        return { connections: [], groups: [] };
      }
      
      const data = await altResponse.json();
      return parseConnectionTree(data);
    }

    const data = await response.json();
    return parseConnectionTree(data);
  } catch (error) {
    console.error('Fetch connections error:', error);
    return { connections: [], groups: [] };
  }
}

function parseConnectionTree(tree: GuacConnectionGroup): { connections: GuacConnection[]; groups: GuacConnectionGroup[] } {
  const connections: GuacConnection[] = [];
  const groups: GuacConnectionGroup[] = [];

  function traverse(node: GuacConnectionGroup) {
    if (node.childConnections) {
      for (const conn of Object.values(node.childConnections)) {
        connections.push(conn);
      }
    }
    if (node.childConnectionGroups) {
      for (const group of Object.values(node.childConnectionGroups)) {
        groups.push(group);
        traverse(group);
      }
    }
  }

  traverse(tree);
  return { connections, groups };
}

export async function GET(request: Request) {
  // Verify portal auth
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session')?.value;
  
  if (!sessionToken) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const session = await prisma.session.findUnique({
    where: { token: sessionToken },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return NextResponse.json({ ok: false, error: 'Session expired' }, { status: 401 });
  }

  // Get Guacamole token
  const guacToken = await getGuacamoleToken();
  if (!guacToken) {
    return NextResponse.json({ 
      ok: false, 
      error: 'Failed to authenticate with Guacamole. Check credentials.' 
    }, { status: 502 });
  }

  // Fetch connections
  const { connections, groups } = await fetchConnections(guacToken);

  return NextResponse.json({
    ok: true,
    token: guacToken,
    connections,
    groups,
  });
}
