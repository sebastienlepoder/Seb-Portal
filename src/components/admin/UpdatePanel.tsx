'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Download, Check, AlertCircle, Clock, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface UpdatePanelProps {
  csrfToken?: string;
}

export function UpdatePanel({ csrfToken }: UpdatePanelProps) {
  const [status, setStatus] = useState<UpdateStatus>({ status: 'idle' });
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const checkForUpdates = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/update');
      const data = await res.json();
      if (data.ok) {
        setStatus(data.data);
      } else {
        setMessage(data.error || 'Failed to check for updates');
      }
    } catch (error) {
      setMessage('Failed to connect to update server');
    } finally {
      setLoading(false);
    }
  };

  const triggerUpdate = async () => {
    if (!confirm('Are you sure you want to update? The portal will restart.')) {
      return;
    }

    setUpdating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage(data.message);
        setStatus((prev) => ({ ...prev, status: 'updating' }));
        
        // If webhook/trigger method, poll for completion
        if (data.method === 'webhook' || data.method === 'trigger-file') {
          setTimeout(() => {
            setMessage('Update in progress… The portal will restart.');
          }, 2000);
        }
      } else {
        setMessage(data.error || 'Failed to trigger update');
      }
    } catch (error) {
      setMessage('Failed to trigger update');
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    checkForUpdates();
  }, []);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString('en-US', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  return (
    <div className="bg-portal-card border border-portal-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-portal-accent/10 rounded-lg">
            <GitBranch className="h-5 w-5 text-portal-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-portal-text">Updates</h3>
            <p className="text-sm text-portal-muted">Manage portal updates</p>
          </div>
        </div>
        <button
          onClick={checkForUpdates}
          disabled={loading}
          className="p-2 text-portal-muted hover:text-portal-text hover:bg-portal-card-hover rounded-lg transition-colors disabled:opacity-50"
          title="Check for updates"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Version Info */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-portal-bg rounded-lg p-3">
          <div className="text-xs text-portal-muted mb-1">Current version</div>
          <div className="font-mono text-sm text-portal-text">
            {status.currentVersion || '...'}
          </div>
        </div>
        <div className="bg-portal-bg rounded-lg p-3">
          <div className="text-xs text-portal-muted mb-1">Latest version</div>
          <div className="font-mono text-sm text-portal-text">
            {status.latestVersion || '...'}
          </div>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-2 mb-4">
        {status.updateAvailable ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-400 rounded-full text-sm">
            <Download className="h-3.5 w-3.5" />
            Update available
          </div>
        ) : status.status === 'updating' ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-full text-sm">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Update in progress…
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 text-green-400 rounded-full text-sm">
            <Check className="h-3.5 w-3.5" />
            Up to date
          </div>
        )}
        <div className="text-xs text-portal-muted flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Checked: {formatDate(status.lastCheck)}
        </div>
      </div>

      {/* Changelog */}
      {status.changelog && status.changelog.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-portal-muted mb-2">Changes:</div>
          <div className="bg-portal-bg rounded-lg p-3 max-h-32 overflow-y-auto">
            <ul className="space-y-1">
              {status.changelog.map((commit, i) => (
                <li key={i} className="text-xs text-portal-text-dim flex items-start gap-2">
                  <span className="text-portal-accent">•</span>
                  <span>{commit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Message */}
      {message && (
        <div className={cn(
          'flex items-center gap-2 p-3 rounded-lg mb-4 text-sm',
          message.includes('Failed') || message.includes('error')
            ? 'bg-red-500/10 text-red-400'
            : 'bg-blue-500/10 text-blue-400'
        )}>
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {message}
        </div>
      )}

      {/* Update Button */}
      {status.updateAvailable && (
        <button
          onClick={triggerUpdate}
          disabled={updating || status.status === 'updating'}
          className="w-full py-3 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {updating || status.status === 'updating' ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Update in progress…
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Update now
            </>
          )}
        </button>
      )}

      {/* Manual Instructions */}
      <details className="mt-4">
        <summary className="text-xs text-portal-muted cursor-pointer hover:text-portal-text">
          Manual instructions (SSH)
        </summary>
        <div className="mt-2 bg-portal-bg rounded-lg p-3">
          <pre className="text-xs text-portal-text-dim font-mono whitespace-pre-wrap">
{`cd /volume1/docker/lepoder-portal
sudo ./scripts/update.sh`}
          </pre>
        </div>
      </details>
    </div>
  );
}
