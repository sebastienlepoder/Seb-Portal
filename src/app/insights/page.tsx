'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import {
  MessageSquare,
  ThumbsUp,
  ExternalLink,
  Filter,
  RefreshCw,
  Lightbulb,
  AlertTriangle,
  GitCompare,
  Star,
  MessageCircle,
  TrendingUp,
  Clock,
  Hash,
  Sparkles,
  ChevronDown,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RedditPost {
  id: string;
  title: string;
  body: string;
  author: string;
  subreddit: string;
  score: number;
  comments: number;
  created: string;
  createdTimestamp: number;
  url: string;
  permalink: string;
  flair?: string;
  relevanceScore: number;
  matchedKeywords: string[];
  insightType: 'feature_request' | 'pain_point' | 'comparison' | 'review' | 'discussion';
  competitors: string[];
}

interface RedditStats {
  total: number;
  byType: Record<string, number>;
  topCompetitors: string[];
  topKeywords: string[];
}

interface RedditResponse {
  ok: boolean;
  data: RedditPost[];
  stats: RedditStats;
  filters: {
    subreddits: string[];
    competitors: string[];
  };
}

const INSIGHT_TYPE_CONFIG = {
  feature_request: {
    label: 'Feature Request',
    icon: Lightbulb,
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10',
    borderColor: 'border-amber-400/30',
  },
  pain_point: {
    label: 'Pain Point',
    icon: AlertTriangle,
    color: 'text-red-400',
    bgColor: 'bg-red-400/10',
    borderColor: 'border-red-400/30',
  },
  comparison: {
    label: 'Comparison',
    icon: GitCompare,
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    borderColor: 'border-blue-400/30',
  },
  review: {
    label: 'Review',
    icon: Star,
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
    borderColor: 'border-purple-400/30',
  },
  discussion: {
    label: 'Discussion',
    icon: MessageCircle,
    color: 'text-portal-muted',
    bgColor: 'bg-portal-card',
    borderColor: 'border-portal-border',
  },
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

export default function InsightsPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [stats, setStats] = useState<RedditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [competitorFilter, setCompetitorFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'relevance' | 'recent' | 'engagement'>('relevance');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());

  const fetchPosts = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (activeFilter !== 'all') params.set('filter', activeFilter);
      if (competitorFilter) params.set('competitor', competitorFilter);
      
      const res = await fetch(`/api/reddit?${params.toString()}`);
      const data: RedditResponse = await res.json();
      
      if (data.ok) {
        setPosts(data.data);
        setStats(data.stats);
      } else {
        setError('Failed to fetch Reddit posts');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchPosts();
    }
  }, [user, activeFilter, competitorFilter]);

  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/login';
    }
  }, [authLoading, user]);

  const sortedPosts = useMemo(() => {
    const sorted = [...posts];
    switch (sortBy) {
      case 'recent':
        sorted.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
        break;
      case 'engagement':
        sorted.sort((a, b) => (b.score + b.comments * 2) - (a.score + a.comments * 2));
        break;
      case 'relevance':
      default:
        sorted.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }
    return sorted;
  }, [posts, sortBy]);

  const toggleExpanded = (id: string) => {
    setExpandedPosts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="h-screen bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={logout} />

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 z-20 bg-portal-bg/80 backdrop-blur-lg border-b border-portal-border">
          <div className="flex items-center gap-3 px-4 py-3 pl-14 sm:pl-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-portal-accent" />
              <h1 className="text-lg font-semibold text-portal-text">Competitive Insights</h1>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {/* Sort dropdown */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="appearance-none bg-portal-card border border-portal-border rounded-lg px-3 py-1.5 pr-8 text-xs text-portal-text focus:outline-none focus:border-portal-accent/50"
                >
                  <option value="relevance">Most Relevant</option>
                  <option value="recent">Most Recent</option>
                  <option value="engagement">Most Engagement</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-portal-muted pointer-events-none" />
              </div>

              {/* Filter toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors',
                  showFilters
                    ? 'bg-portal-accent/10 border-portal-accent/30 text-portal-accent'
                    : 'bg-portal-card border-portal-border text-portal-muted hover:text-portal-text'
                )}
              >
                <Filter className="h-3.5 w-3.5" />
                Filters
              </button>

              {/* Refresh */}
              <button
                onClick={fetchPosts}
                disabled={loading}
                className="p-2 text-portal-muted hover:text-portal-text hover:bg-portal-card rounded-lg transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </button>
            </div>
          </div>

          {/* Filter bar */}
          {showFilters && (
            <div className="px-4 pb-3 border-t border-portal-border pt-3 animate-fade-in">
              <div className="flex flex-wrap items-center gap-2">
                {/* Type filters */}
                <button
                  onClick={() => setActiveFilter('all')}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-full transition-colors',
                    activeFilter === 'all'
                      ? 'bg-portal-accent text-white'
                      : 'bg-portal-card border border-portal-border text-portal-muted hover:text-portal-text'
                  )}
                >
                  All ({stats?.total || 0})
                </button>
                {Object.entries(INSIGHT_TYPE_CONFIG).map(([type, config]) => (
                  <button
                    key={type}
                    onClick={() => setActiveFilter(type)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full transition-colors',
                      activeFilter === type
                        ? `${config.bgColor} ${config.color} border ${config.borderColor}`
                        : 'bg-portal-card border border-portal-border text-portal-muted hover:text-portal-text'
                    )}
                  >
                    <config.icon className="h-3 w-3" />
                    {config.label}
                    <span className="text-[10px] opacity-70">
                      ({stats?.byType[type] || 0})
                    </span>
                  </button>
                ))}

                {/* Competitor filter */}
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[10px] text-portal-muted uppercase tracking-wider">Competitor:</span>
                  <select
                    value={competitorFilter}
                    onChange={(e) => setCompetitorFilter(e.target.value)}
                    className="appearance-none bg-portal-card border border-portal-border rounded-lg px-3 py-1.5 pr-8 text-xs text-portal-text focus:outline-none focus:border-portal-accent/50"
                  >
                    <option value="">All Competitors</option>
                    {stats?.topCompetitors.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {competitorFilter && (
                    <button
                      onClick={() => setCompetitorFilter('')}
                      className="p-1 text-portal-muted hover:text-portal-text"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Stats bar */}
        {stats && !loading && (
          <div className="shrink-0 bg-portal-card/50 border-b border-portal-border px-4 py-2">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 text-portal-muted">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>{stats.total} insights</span>
              </div>
              <div className="flex items-center gap-1.5 text-portal-muted">
                <Hash className="h-3.5 w-3.5" />
                <span className="flex gap-1">
                  {stats.topKeywords.slice(0, 5).map((kw) => (
                    <span key={kw} className="px-1.5 py-0.5 bg-portal-border/50 rounded text-[10px]">
                      {kw}
                    </span>
                  ))}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {loading && posts.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
                <p className="text-sm text-portal-muted">Scanning Reddit for insights...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-3" />
                <p className="text-portal-text font-medium">{error}</p>
                <button
                  onClick={fetchPosts}
                  className="mt-4 px-4 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg text-sm transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : sortedPosts.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 text-portal-muted mx-auto mb-3" />
                <p className="text-portal-text font-medium">No matching posts found</p>
                <p className="text-sm text-portal-muted mt-1">Try adjusting your filters</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-w-4xl mx-auto">
              {sortedPosts.map((post) => {
                const config = INSIGHT_TYPE_CONFIG[post.insightType];
                const isExpanded = expandedPosts.has(post.id);

                return (
                  <article
                    key={post.id}
                    className={cn(
                      'bg-portal-card border rounded-xl p-4 hover:border-portal-accent/20 transition-all',
                      config.borderColor
                    )}
                  >
                    {/* Header */}
                    <div className="flex items-start gap-3">
                      {/* Type badge */}
                      <div className={cn('p-2 rounded-lg shrink-0', config.bgColor)}>
                        <config.icon className={cn('h-4 w-4', config.color)} />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Title */}
                        <a
                          href={post.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-portal-text font-medium hover:text-portal-accent transition-colors line-clamp-2"
                        >
                          {post.title}
                        </a>

                        {/* Meta */}
                        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-portal-muted">
                          <span className="font-medium text-portal-accent">r/{post.subreddit}</span>
                          <span>•</span>
                          <span>u/{post.author}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTimeAgo(post.created)}
                          </span>
                          {post.flair && (
                            <>
                              <span>•</span>
                              <span className="px-1.5 py-0.5 bg-portal-border/50 rounded text-[10px]">
                                {post.flair}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Body preview */}
                        {post.body && (
                          <div className="mt-3">
                            <p className={cn(
                              'text-sm text-portal-text-dim',
                              !isExpanded && 'line-clamp-3'
                            )}>
                              {post.body}
                            </p>
                            {post.body.length > 200 && (
                              <button
                                onClick={() => toggleExpanded(post.id)}
                                className="text-xs text-portal-accent hover:underline mt-1"
                              >
                                {isExpanded ? 'Show less' : 'Read more'}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Tags */}
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          {/* Competitors mentioned */}
                          {post.competitors.length > 0 && (
                            <div className="flex items-center gap-1">
                              {post.competitors.slice(0, 3).map((c) => (
                                <span
                                  key={c}
                                  className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-[10px] font-medium"
                                >
                                  {c}
                                </span>
                              ))}
                              {post.competitors.length > 3 && (
                                <span className="text-[10px] text-portal-muted">
                                  +{post.competitors.length - 3} more
                                </span>
                              )}
                            </div>
                          )}

                          {/* Keywords */}
                          {post.matchedKeywords.length > 0 && (
                            <div className="flex items-center gap-1">
                              {post.matchedKeywords.slice(0, 3).map((kw) => (
                                <span
                                  key={kw}
                                  className="px-1.5 py-0.5 bg-portal-border/50 rounded text-[10px] text-portal-muted"
                                >
                                  {kw}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Footer stats */}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-portal-border">
                          <div className="flex items-center gap-4 text-xs text-portal-muted">
                            <span className="flex items-center gap-1">
                              <ThumbsUp className="h-3.5 w-3.5" />
                              {post.score}
                            </span>
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3.5 w-3.5" />
                              {post.comments}
                            </span>
                            <span className={cn('flex items-center gap-1', config.color)}>
                              <config.icon className="h-3.5 w-3.5" />
                              {config.label}
                            </span>
                          </div>
                          <a
                            href={post.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-portal-accent hover:underline"
                          >
                            Open on Reddit
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
