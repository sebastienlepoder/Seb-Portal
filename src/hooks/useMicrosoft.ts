'use client';

import { useState, useEffect, useCallback } from 'react';

interface MicrosoftStatus {
  connected: boolean;
  email?: string;
}

interface Notebook {
  id: string;
  displayName: string;
  lastModifiedDateTime: string;
  links: {
    oneNoteWebUrl: { href: string };
  };
}

interface Section {
  id: string;
  displayName: string;
}

interface Page {
  id: string;
  title: string;
  lastModifiedDateTime: string;
  links: {
    oneNoteWebUrl: { href: string };
  };
}

interface MailMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  from: { emailAddress: { name: string; address: string } };
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  webLink: string;
}

export function useMicrosoftStatus() {
  const [status, setStatus] = useState<MicrosoftStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/microsoft/status');
      const data = await res.json();
      if (data.ok) {
        setStatus(data.data);
      }
    } catch (e) {
      console.error('Failed to get Microsoft status:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const connect = () => {
    window.location.href = '/api/auth/microsoft/login';
  };

  const disconnect = async () => {
    await fetch('/api/microsoft/status', { method: 'DELETE' });
    setStatus({ connected: false });
  };

  return { status, loading, refresh, connect, disconnect };
}

export function useOneNote() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotebooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/microsoft/onenote?type=notebooks');
      const data = await res.json();
      if (data.ok) {
        setNotebooks(data.data);
      } else if (data.needsAuth) {
        setError('Please connect your Microsoft account');
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSections = useCallback(async (notebookId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/microsoft/onenote?type=sections&notebookId=${notebookId}`);
      const data = await res.json();
      if (data.ok) {
        setSections(data.data);
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPages = useCallback(async (sectionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/microsoft/onenote?type=pages&sectionId=${sectionId}`);
      const data = await res.json();
      if (data.ok) {
        setPages(data.data);
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createPage = useCallback(async (sectionId: string, title: string, content: string) => {
    try {
      const res = await fetch('/api/microsoft/onenote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId, title, content }),
      });
      const data = await res.json();
      return data;
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, []);

  return {
    notebooks,
    sections,
    pages,
    loading,
    error,
    fetchNotebooks,
    fetchSections,
    fetchPages,
    createPage,
  };
}

export function useOutlookMail() {
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(async (folder = 'inbox', top = 20) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/microsoft/mail?folder=${folder}&top=${top}`);
      const data = await res.json();
      if (data.ok) {
        setMessages(data.data);
      } else if (data.needsAuth) {
        setError('Please connect your Microsoft account');
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const sendMail = useCallback(async (to: string[], subject: string, content: string) => {
    try {
      const res = await fetch('/api/microsoft/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', to, subject, content }),
      });
      return await res.json();
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, []);

  const markAsRead = useCallback(async (messageId: string, isRead = true) => {
    try {
      const res = await fetch('/api/microsoft/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markRead', messageId, isRead }),
      });
      return await res.json();
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, []);

  const unreadCount = messages.filter((m) => !m.isRead).length;

  return {
    messages,
    loading,
    error,
    unreadCount,
    fetchMessages,
    sendMail,
    markAsRead,
  };
}
