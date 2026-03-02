'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import {
  CheckSquare, Plus, Trash2, Edit3, Check, X, Calendar,
  Circle, CheckCircle, Filter, Tag, Clock, AlertCircle,
  ChevronDown, MoreHorizontal, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Todo {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: number;
  completed: boolean;
  completedAt: string | null;
  dueDate: string | null;
  createdAt: string;
}

interface TodosData {
  todos: Todo[];
  categories: { name: string; count: number }[];
  stats: { total: number; active: number; completed: number };
}

export default function TodosPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const [data, setData] = useState<TodosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [newTodo, setNewTodo] = useState('');
  const [newCategory, setNewCategory] = useState('General');
  const [newPriority, setNewPriority] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) window.location.href = '/login';
  }, [authLoading, user]);

  const fetchTodos = async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('filter', filter);
      if (categoryFilter) params.set('category', categoryFilter);
      
      const res = await fetch('/api/todos?' + params);
      const result = await res.json();
      if (result.ok) setData(result.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchTodos();
  }, [user, filter, categoryFilter]);

  
  const seedRoadmap = async () => {
    if (!confirm('Add Portal roadmap todos?')) return;
    const res = await fetch('/api/todos/seed', { method: 'POST' });
    const result = await res.json();
    alert(result.message || result.error);
    if (result.ok) fetchTodos();
  };

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.trim()) return;

    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTodo,
        category: newCategory,
        priority: newPriority,
      }),
    });

    if ((await res.json()).ok) {
      setNewTodo('');
      setShowAddForm(false);
      fetchTodos();
    }
  };

  const toggleTodo = async (todo: Todo) => {
    await fetch('/api/todos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: todo.id, completed: !todo.completed }),
    });
    fetchTodos();
  };

  const deleteTodo = async (id: string) => {
    await fetch('/api/todos?id=' + id, { method: 'DELETE' });
    fetchTodos();
  };

  const updateTodo = async (id: string, title: string) => {
    await fetch('/api/todos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title }),
    });
    setEditingId(null);
    fetchTodos();
  };

  const clearCompleted = async () => {
    await fetch('/api/todos?clearCompleted=true', { method: 'DELETE' });
    fetchTodos();
  };

  const getPriorityColor = (p: number) => {
    if (p >= 2) return 'text-red-400';
    if (p === 1) return 'text-yellow-400';
    return 'text-portal-muted';
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={logout} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 border-b border-portal-border bg-portal-card px-4 py-3 flex-shrink-0">
          {/* Title row */}
          <div className="flex items-center gap-3 mb-3">
            <div className="pl-10 sm:pl-0 flex items-center gap-3 flex-1 min-w-0">
              <CheckSquare className="h-5 w-5 text-green-400 flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-portal-text">Todo List</h1>
                <p className="text-xs text-portal-muted">
                  {data?.stats.active || 0} active · {data?.stats.completed || 0} completed
                </p>
              </div>
            </div>
            <button
              onClick={fetchTodos}
              className="p-2 text-portal-muted hover:text-portal-text rounded-lg transition-colors flex-shrink-0"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
          </div>
          
          {/* Actions row */}
          <div className="flex items-center gap-2 pl-10 sm:pl-0">
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-3 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors text-sm whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden xs:inline">Add Task</span>
              <span className="xs:hidden">Add</span>
            </button>
            {user?.role?.toLowerCase() === 'admin' && (
              <button
                onClick={seedRoadmap}
                className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm whitespace-nowrap"
              >
                <span className="hidden sm:inline">Seed Roadmap</span>
                <span className="sm:hidden">Seed</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex gap-1 bg-portal-card border border-portal-border rounded-lg p-1">
              {(['all', 'active', 'completed'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-md transition-colors capitalize',
                    filter === f ? 'bg-portal-accent text-white' : 'text-portal-muted hover:text-portal-text'
                  )}
                >
                  {f}
                </button>
              ))}
            </div>

            {data?.categories && data.categories.length > 0 && (
              <div className="flex gap-2 items-center">
                <Tag className="h-4 w-4 text-portal-muted flex-shrink-0" />
                <select
                  value={categoryFilter || ''}
                  onChange={e => setCategoryFilter(e.target.value || null)}
                  className="px-2 py-1.5 text-sm bg-portal-card border border-portal-border rounded-lg text-portal-text focus:outline-none max-w-[140px]"
                >
                  <option value="">All Categories</option>
                  {data.categories.map(c => (
                    <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
                  ))}
                </select>
              </div>
            )}

            {data?.stats.completed ? (
              <button
                onClick={clearCompleted}
                className="text-sm text-portal-muted hover:text-red-400 transition-colors whitespace-nowrap ml-auto"
              >
                Clear done
              </button>
            ) : null}
          </div>

          {/* Add Form */}
          {showAddForm && (
            <form onSubmit={addTodo} className="bg-portal-card border border-portal-border rounded-xl p-4 mb-4">
              <div className="mb-3">
                <input
                  type="text"
                  value={newTodo}
                  onChange={e => setNewTodo(e.target.value)}
                  placeholder="What needs to be done?"
                  autoFocus
                  className="w-full px-3 py-2 bg-portal-bg border border-portal-border rounded-lg text-portal-text placeholder-portal-muted focus:outline-none focus:border-portal-accent text-sm"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="px-2 py-1.5 text-sm bg-portal-bg border border-portal-border rounded-lg text-portal-text"
                >
                  <option>General</option>
                  <option>Work</option>
                  <option>Personal</option>
                  <option>Portal</option>
                  <option>Ideas</option>
                </select>
                <select
                  value={newPriority}
                  onChange={e => setNewPriority(Number(e.target.value))}
                  className="px-2 py-1.5 text-sm bg-portal-bg border border-portal-border rounded-lg text-portal-text"
                >
                  <option value={0}>Normal</option>
                  <option value={1}>Medium</option>
                  <option value={2}>High</option>
                </select>
                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-1.5 text-sm text-portal-muted hover:text-portal-text rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-sm bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Todo List */}
          <div className="bg-portal-card border border-portal-border rounded-xl divide-y divide-portal-border">
            {loading ? (
              <div className="p-8 text-center">
                <RefreshCw className="h-6 w-6 animate-spin text-portal-muted mx-auto" />
              </div>
            ) : data?.todos.length === 0 ? (
              <div className="p-8 text-center">
                <CheckSquare className="h-10 w-10 text-portal-muted mx-auto mb-3" />
                <p className="text-portal-muted text-sm">
                  {filter === 'completed' ? 'No completed tasks' : 
                   filter === 'active' ? 'All done! 🎉' : 'No tasks yet'}
                </p>
              </div>
            ) : (
              data?.todos.map(todo => (
                <div
                  key={todo.id}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 group transition-colors',
                    todo.completed && 'bg-portal-bg/50'
                  )}
                >
                  <button
                    onClick={() => toggleTodo(todo)}
                    className={cn(
                      'flex-shrink-0 transition-colors',
                      todo.completed ? 'text-green-400' : 'text-portal-muted hover:text-portal-text'
                    )}
                  >
                    {todo.completed ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <Circle className="h-5 w-5" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    {editingId === todo.id ? (
                      <input
                        type="text"
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') updateTodo(todo.id, editTitle);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onBlur={() => updateTodo(todo.id, editTitle)}
                        autoFocus
                        className="w-full px-2 py-1 bg-portal-bg border border-portal-border rounded text-portal-text focus:outline-none text-sm"
                      />
                    ) : (
                      <p
                        className={cn(
                          'text-sm truncate',
                          todo.completed ? 'text-portal-muted line-through' : 'text-portal-text'
                        )}
                      >
                        {todo.title}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-portal-muted">{todo.category}</span>
                      {todo.priority > 0 && (
                        <span className={cn('text-xs', getPriorityColor(todo.priority))}>
                          {todo.priority === 2 ? '⚡ High' : '● Med'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => { setEditingId(todo.id); setEditTitle(todo.title); }}
                      className="p-1.5 text-portal-muted hover:text-portal-text rounded transition-colors"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteTodo(todo.id)}
                      className="p-1.5 text-portal-muted hover:text-red-400 rounded transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
