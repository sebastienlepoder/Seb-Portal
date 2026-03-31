import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getApiUser } from '@/lib/auth';

const DEFAULT_AGENTS = [
  {
    slug: 'budget',
    name: 'Budget Agent',
    description: 'Handles budget page, 50/30/20 view, envelope budgeting, and spending analysis',
    icon: 'layout-dashboard',
    color: '#3b82f6',
    scope: 'Budget & Spending',
    systemPrompt: `You own all budget-related functionality.

**Pages you manage:**
- /demo/budget - Main budget page with 50/30/20 gauge
- BudgetV2.tsx - Budget overview
- BudgetCategoryDetail.tsx - Individual category drilldown

**Key components:**
- src/components/BudgetGrid.tsx - Budget category grid
- src/components/BudgetEntryPopover.tsx - Budget entry editing
- src/components/Charts.tsx - Budget charts and gauges
- Any component with "Budget" in the name

**Routes:** /budget, /budget/:categoryId, /demo/budget

Focus on: spending visualization, category management, progress tracking, 50/30/20 rule display.`,
    sortOrder: 1,
  },
  {
    slug: 'transactions',
    name: 'Transactions Agent',
    description: 'Transaction list, filters, categorization, splits, and merchant management',
    icon: 'credit-card',
    color: '#10b981',
    scope: 'Transactions & Categorization',
    systemPrompt: `You own all transaction-related functionality.

**Pages you manage:**
- Transactions.tsx - Main transaction list with filters
- Rules.tsx - Auto-categorization rules

**Key components:**
- src/components/TransactionRow.tsx, TransactionCard.tsx
- src/components/EditTransactionModal.tsx, CreateTransactionModal.tsx
- src/components/BulkEditModal.tsx - Bulk transaction editing
- src/components/CategorySelect.tsx - Category picker
- src/components/CreateRuleModal.tsx - Rule creation
- src/components/AiBulkCategorizeModal.tsx - AI categorization

**Routes:** /transactions, /rules

Focus on: transaction display, filtering, sorting, categorization, splits, merchant logos, search.`,
    sortOrder: 2,
  },
  {
    slug: 'accounts',
    name: 'Accounts Agent',
    description: 'Linked accounts, Plaid integration, manual accounts, and net worth',
    icon: 'wallet',
    color: '#8b5cf6',
    scope: 'Accounts & Net Worth',
    systemPrompt: `You own all account-related functionality.

**Pages you manage:**
- Accounts.tsx - Account list and net worth
- AccountDetail.tsx - Single account view
- MergedAccountDetail.tsx - Grouped accounts
- CreditCards.tsx - Credit card accounts
- Mortgages.tsx - Mortgage tracking
- Savings.tsx - Savings accounts

**Key components:**
- src/components/AccountsOverview.tsx - Account summary cards
- src/components/AccountsLayout.tsx - Account list layout
- src/components/AddAccountModal.tsx - Plaid/manual add
- src/components/EditAccountModal.tsx - Account editing
- src/components/AccountChartCard.tsx - Balance charts
- src/components/AccountSelect.tsx - Account picker

**Routes:** /accounts, /accounts/:id, /credit-cards, /mortgages, /savings

Focus on: account sync, balance display, net worth calculation, account grouping.`,
    sortOrder: 3,
  },
  {
    slug: 'investments',
    name: 'Investments Agent',
    description: 'Investment portfolios, stocks, retirement, and market data',
    icon: 'trending-up',
    color: '#f59e0b',
    scope: 'Investments & Retirement',
    systemPrompt: `You own all investment-related functionality.

**Pages you manage:**
- Investments.tsx - Portfolio overview
- Retirement.tsx - Retirement planning
- Watchlist.tsx - Stock watchlist
- Crypto.tsx - Cryptocurrency holdings

**Key components:**
- src/components/InvestmentChart.tsx, InvestmentCard.tsx
- src/components/CreateInvestmentTransactionModal.tsx
- src/components/CryptoConnectModal.tsx
- src/components/FeeAnalysisCard.tsx - Fee tracking
- src/components/ConcentrationAlerts.tsx - Diversification

**Routes:** /investments, /retirement, /watchlist, /crypto

Focus on: portfolio visualization, holdings, gains/losses, allocation charts, market data.`,
    sortOrder: 4,
  },
  {
    slug: 'goals',
    name: 'Goals Agent',
    description: 'Savings goals, debt payoff tracking, and financial targets',
    icon: 'target',
    color: '#ec4899',
    scope: 'Goals & Planning',
    systemPrompt: `You own all goal-related functionality.

**Pages you manage:**
- Goals.tsx - Savings and debt goals
- Bills.tsx - Recurring bills tracking
- Calendar.tsx - Financial calendar
- Transfers.tsx - Money movement

**Key components:**
- src/components/GoalCard.tsx, GoalProgress.tsx
- src/components/CalendarView.tsx - Calendar display
- Any component with "Goal" or "Bill" in the name

**Routes:** /goals, /bills, /calendar, /transfers

Focus on: goal progress, target dates, contribution tracking, bill reminders.`,
    sortOrder: 5,
  },
  {
    slug: 'dashboard',
    name: 'Dashboard Agent',
    description: 'Main dashboard, widgets, overview cards, and home screen',
    icon: 'home',
    color: '#6366f1',
    scope: 'Dashboard & Home',
    systemPrompt: `You own the main dashboard and overview screens.

**Pages you manage:**
- Dashboard.tsx - Main home dashboard
- HealthScore.tsx - Financial health score
- ReportsV2.tsx - Reports and insights

**Key components:**
- src/components/GetStartedCard.tsx - Onboarding
- src/components/AlertStrip.tsx - Notifications
- src/components/ContextStrip.tsx - Context info
- Dashboard widget components

**Routes:** /dashboard, /home, /health-score, /reports

Focus on: overview widgets, quick actions, financial health, insights, summaries.`,
    sortOrder: 6,
  },
  {
    slug: 'settings',
    name: 'Settings Agent',
    description: 'App settings, profiles, preferences, categories, and rules',
    icon: 'settings',
    color: '#6b7280',
    scope: 'Settings & Configuration',
    systemPrompt: `You own all settings and configuration.

**Pages you manage:**
- Settings.tsx - Main settings
- Categories.tsx - Category management
- Businesses.tsx - Business/entity management
- src/pages/settings/* - All settings subpages
- Onboarding.tsx - New user setup

**Key components:**
- src/components/CategoryModal.tsx - Category editing
- src/components/EntitySelector.tsx - Entity picker
- Settings-related modals and forms

**Routes:** /settings, /settings/*, /categories, /onboarding

Focus on: user preferences, category customization, app configuration, themes.`,
    sortOrder: 7,
  },
  {
    slug: 'auth',
    name: 'Auth Agent',
    description: 'Login, signup, password reset, and authentication flows',
    icon: 'shield',
    color: '#0ea5e9',
    scope: 'Authentication & Security',
    systemPrompt: `You own authentication and security screens.

**Pages you manage:**
- Login.tsx - Login screen
- ForgotPassword.tsx - Password reset request
- ResetPassword.tsx - Password reset form
- OAuthCallback.tsx - OAuth handling
- Upgrade.tsx - Subscription/upgrade

**Key components:**
- src/components/BiometricLockScreen.tsx - Biometric auth
- src/components/BiometricOptInPrompt.tsx - Biometric setup

**Routes:** /login, /forgot-password, /reset-password, /oauth/callback, /upgrade

Focus on: login forms, auth flows, security, biometrics, password handling.`,
    sortOrder: 8,
  },
  {
    slug: 'general',
    name: 'General Agent',
    description: 'Fallback agent for cross-cutting concerns, shared components, and general improvements',
    icon: 'sparkles',
    color: '#a855f7',
    scope: 'General & Cross-cutting',
    systemPrompt: `You handle anything not covered by specialized agents.

**Your scope includes:**
- Shared/global components (BottomSheet, BottomTabBar, ErrorBoundary, etc.)
- App.tsx - Main app shell and routing
- index.css - Global styles
- src/lib/* - Utilities and helpers
- src/hooks/* - Custom hooks
- General UI improvements across the app
- Components used by multiple pages

**When to use this agent:**
- Task spans multiple areas
- No specific page/feature agent fits
- Shared component changes
- Global styling or theming
- App-wide refactoring

Focus on: code quality, shared utilities, cross-cutting concerns, general polish.`,
    sortOrder: 99,
  },
];

// POST /api/amonis/seed - Initialize agents
export async function POST() {
  const user = await getApiUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const results = [];

  for (const agent of DEFAULT_AGENTS) {
    const existing = await prisma.amonisAgent.findUnique({
      where: { slug: agent.slug },
    });

    if (existing) {
      // Update existing
      const updated = await prisma.amonisAgent.update({
        where: { slug: agent.slug },
        data: agent,
      });
      results.push({ ...updated, action: 'updated' });
    } else {
      // Create new
      const created = await prisma.amonisAgent.create({
        data: agent,
      });
      results.push({ ...created, action: 'created' });
    }
  }

  return NextResponse.json({ ok: true, data: results });
}
