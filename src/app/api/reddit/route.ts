import { NextResponse } from 'next/server';

// Subreddits to monitor for personal finance app discussions
const SUBREDDITS = [
  'personalfinance',
  'ynab',
  'MonarchMoney',
  'CopilotMoney',
  'SimpliFi',
  'budgetingapps',
  'financialindependence',
  'PovertyFinance',
  'Frugal',
];

// Competitor app names to track
const COMPETITOR_KEYWORDS = [
  'monarch money',
  'simplifi',
  'copilot money',
  'copilot app',
  'ynab',
  'mint',
  'personal capital',
  'empower',
  'rocket money',
  'truebill',
  'every dollar',
  'goodbudget',
  'pocketguard',
  'honeydue',
  'quicken',
];

// Pain point / feature request indicators
const INSIGHT_KEYWORDS = [
  'wish',
  'would be nice',
  'feature request',
  'missing feature',
  'doesn\'t have',
  'can\'t do',
  'unable to',
  'frustrating',
  'annoying',
  'hate that',
  'switched from',
  'switched to',
  'looking for alternative',
  'better than',
  'worse than',
  'compared to',
  'pros and cons',
  'review',
  'why i left',
  'deal breaker',
  'bug',
  'broken',
  'confusing',
  'hard to use',
  'not intuitive',
  'ui',
  'ux',
  'mobile app',
  'sync issue',
  'connection',
  'plaid',
];

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  score: number;
  num_comments: number;
  created_utc: number;
  permalink: string;
  url: string;
  thumbnail?: string;
  link_flair_text?: string;
  is_self: boolean;
}

interface ProcessedPost {
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

function calculateRelevance(post: RedditPost): { score: number; keywords: string[]; type: ProcessedPost['insightType']; competitors: string[] } {
  const text = `${post.title} ${post.selftext}`.toLowerCase();
  const matchedKeywords: string[] = [];
  const matchedCompetitors: string[] = [];
  let score = 0;

  // Check for competitor mentions
  for (const keyword of COMPETITOR_KEYWORDS) {
    if (text.includes(keyword)) {
      matchedCompetitors.push(keyword);
      score += 15;
    }
  }

  // Check for insight keywords
  for (const keyword of INSIGHT_KEYWORDS) {
    if (text.includes(keyword)) {
      matchedKeywords.push(keyword);
      score += 10;
    }
  }

  // Boost score based on engagement
  score += Math.min(post.score / 10, 20); // Cap at 20 points from upvotes
  score += Math.min(post.num_comments / 5, 15); // Cap at 15 points from comments

  // Determine insight type
  let insightType: ProcessedPost['insightType'] = 'discussion';
  
  if (/wish|would be nice|feature request|missing|should add|please add/i.test(text)) {
    insightType = 'feature_request';
    score += 25;
  } else if (/frustrat|annoy|hate|bug|broken|issue|problem|can't|doesn't work/i.test(text)) {
    insightType = 'pain_point';
    score += 20;
  } else if (/switch|compar|vs\.?|versus|better than|worse than|alternative/i.test(text)) {
    insightType = 'comparison';
    score += 20;
  } else if (/review|thoughts on|experience with|been using/i.test(text)) {
    insightType = 'review';
    score += 15;
  }

  return { score, keywords: matchedKeywords, type: insightType, competitors: matchedCompetitors };
}

async function fetchSubreddit(subreddit: string, sort: 'hot' | 'new' | 'top' = 'hot', limit: number = 25): Promise<RedditPost[]> {
  try {
    const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}&raw_json=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'LEPODER-Portal/1.0 (Personal Finance Research Bot)',
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!res.ok) {
      console.error(`Reddit API error for r/${subreddit}: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return data.data?.children?.map((child: { data: RedditPost }) => child.data) || [];
  } catch (error) {
    console.error(`Failed to fetch r/${subreddit}:`, error);
    return [];
  }
}

async function searchReddit(query: string, limit: number = 50): Promise<RedditPost[]> {
  try {
    const subredditFilter = SUBREDDITS.join('+');
    const url = `https://www.reddit.com/r/${subredditFilter}/search.json?q=${encodeURIComponent(query)}&restrict_sr=on&sort=relevance&t=month&limit=${limit}&raw_json=1`;
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'LEPODER-Portal/1.0 (Personal Finance Research Bot)',
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      console.error(`Reddit search error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return data.data?.children?.map((child: { data: RedditPost }) => child.data) || [];
  } catch (error) {
    console.error('Failed to search Reddit:', error);
    return [];
  }
}

function processPost(post: RedditPost): ProcessedPost | null {
  const { score, keywords, type, competitors } = calculateRelevance(post);
  
  // Filter out low-relevance posts
  if (score < 15) return null;

  return {
    id: post.id,
    title: post.title,
    body: post.selftext.length > 500 ? post.selftext.substring(0, 500) + '...' : post.selftext,
    author: post.author,
    subreddit: post.subreddit,
    score: post.score,
    comments: post.num_comments,
    created: new Date(post.created_utc * 1000).toISOString(),
    createdTimestamp: post.created_utc,
    url: post.url,
    permalink: `https://reddit.com${post.permalink}`,
    flair: post.link_flair_text || undefined,
    relevanceScore: score,
    matchedKeywords: keywords,
    insightType: type,
    competitors,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get('filter') || 'all'; // all, feature_request, pain_point, comparison, review
  const competitor = searchParams.get('competitor');
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 200);

  try {
    // Fetch from multiple sources in parallel
    const [
      hotPosts,
      newPosts,
      featureSearchPosts,
      painPointSearchPosts,
      comparisonSearchPosts,
    ] = await Promise.all([
      // Hot posts from each subreddit
      Promise.all(SUBREDDITS.map(sub => fetchSubreddit(sub, 'hot', 15))),
      // New posts
      Promise.all(SUBREDDITS.map(sub => fetchSubreddit(sub, 'new', 10))),
      // Search for feature requests
      searchReddit('feature request OR wish OR "would be nice" OR "should add"', 25),
      // Search for pain points
      searchReddit('frustrating OR annoying OR "doesn\'t work" OR bug OR issue', 25),
      // Search for comparisons
      searchReddit('vs OR versus OR "switched from" OR "compared to" OR alternative', 25),
    ]);

    // Flatten and deduplicate
    const allPosts = [
      ...hotPosts.flat(),
      ...newPosts.flat(),
      ...featureSearchPosts,
      ...painPointSearchPosts,
      ...comparisonSearchPosts,
    ];

    const seenIds = new Set<string>();
    const uniquePosts: ProcessedPost[] = [];

    for (const post of allPosts) {
      if (seenIds.has(post.id)) continue;
      seenIds.add(post.id);

      const processed = processPost(post);
      if (processed) {
        // Apply filters
        if (filter !== 'all' && processed.insightType !== filter) continue;
        if (competitor && !processed.competitors.some(c => c.toLowerCase().includes(competitor.toLowerCase()))) continue;
        
        uniquePosts.push(processed);
      }
    }

    // Sort by relevance score, then by recency
    uniquePosts.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return b.createdTimestamp - a.createdTimestamp;
    });

    // Limit results
    const results = uniquePosts.slice(0, limit);

    // Group by insight type for stats
    const stats = {
      total: results.length,
      byType: {
        feature_request: results.filter(p => p.insightType === 'feature_request').length,
        pain_point: results.filter(p => p.insightType === 'pain_point').length,
        comparison: results.filter(p => p.insightType === 'comparison').length,
        review: results.filter(p => p.insightType === 'review').length,
        discussion: results.filter(p => p.insightType === 'discussion').length,
      },
      topCompetitors: [...new Set(results.flatMap(p => p.competitors))].slice(0, 10),
      topKeywords: [...new Set(results.flatMap(p => p.matchedKeywords))].slice(0, 15),
    };

    return NextResponse.json({
      ok: true,
      data: results,
      stats,
      filters: {
        subreddits: SUBREDDITS,
        competitors: COMPETITOR_KEYWORDS,
      },
    });
  } catch (error) {
    console.error('Reddit API error:', error);
    return NextResponse.json({
      ok: false,
      error: 'Failed to fetch Reddit data',
    }, { status: 500 });
  }
}
