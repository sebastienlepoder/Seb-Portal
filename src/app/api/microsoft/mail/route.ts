import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { getMicrosoftToken } from '@/lib/microsoft-auth';
import { getMessages, getMessage, sendMail, replyToMail, markAsRead } from '@/lib/microsoft';

// GET /api/microsoft/mail - Get messages or a single message
export async function GET(request: Request) {
  try {
    const user = await requireApiAuth();
    const token = await getMicrosoftToken(user.id);

    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Microsoft account not connected', needsAuth: true },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const messageId = url.searchParams.get('messageId');
    const folder = url.searchParams.get('folder') || 'inbox';
    const top = parseInt(url.searchParams.get('top') || '20', 10);
    const filter = url.searchParams.get('filter') || undefined;

    if (messageId) {
      // Get single message
      const message = await getMessage(token, messageId);
      return NextResponse.json({ ok: true, data: message });
    }

    // Get message list
    const messages = await getMessages(token, { folder, top, filter });
    return NextResponse.json({ ok: true, data: messages });
  } catch (error) {
    console.error('Mail API error:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// POST /api/microsoft/mail - Send, reply, or update message
export async function POST(request: Request) {
  try {
    const user = await requireApiAuth();
    const token = await getMicrosoftToken(user.id);

    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Microsoft account not connected', needsAuth: true },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'send': {
        const { to, subject, content, isHtml = true } = body;
        if (!to || !subject || !content) {
          return NextResponse.json(
            { ok: false, error: 'to, subject, and content required' },
            { status: 400 }
          );
        }
        const recipients = Array.isArray(to) ? to : [to];
        await sendMail(token, recipients, subject, content, isHtml);
        return NextResponse.json({ ok: true, message: 'Email sent' });
      }

      case 'reply': {
        const { messageId, content, replyAll = false } = body;
        if (!messageId || !content) {
          return NextResponse.json(
            { ok: false, error: 'messageId and content required' },
            { status: 400 }
          );
        }
        await replyToMail(token, messageId, content, replyAll);
        return NextResponse.json({ ok: true, message: 'Reply sent' });
      }

      case 'markRead': {
        const { messageId, isRead = true } = body;
        if (!messageId) {
          return NextResponse.json({ ok: false, error: 'messageId required' }, { status: 400 });
        }
        await markAsRead(token, messageId, isRead);
        return NextResponse.json({ ok: true, message: isRead ? 'Marked as read' : 'Marked as unread' });
      }

      default:
        return NextResponse.json({ ok: false, error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Mail API error:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
