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

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="border-b border-portal-border bg-portal-card px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckSquare className="h-6 w-6 text-green-400" />
              <div>
                <h1 className="text-xl font-bold text-portal-text">Todo List</h1>
                <p className="text-sm text-portal-muted">
                  {data?.stats.active || 0} active · {data?.stats.completed || 0} completed
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchTodos}
                className="p-2 text-portal-muted hover:text-portal-text rounded-lg transition-colors"
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </button>
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Task
              </button>
              {user?.role?.toLowerCase() === 'admin' && (
                <button
                  onClick={seedRoadmap}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm"
                >
                  Seed Roadmap
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6">
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
                <Tag className="h-4 w-4 text-portal-muted" />
                <select
                  value={categoryFilter || ''}
                  onChange={e => setCategoryFilter(e.target.value || null)}
                  className="px-3 py-1.5 text-sm bg-portal-card border border-portal-border rounded-lg text-portal-text focus:outline-none"
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
                className="text-sm text-portal-muted hover:text-red-400 transition-colors"
              >
                Clear completed
              </button>
            ) : null}
          </div>

          {/* Add Form */}
          {showAddForm && (
            <form onSubmit={addTodo} className="bg-portal-card border border-portal-border rounded-xl p-4 mb-6">
              <div className="flex gap-4 mb-4">
                <input
                  type="text"
                  value={newTodo}
                  onChange={e => setNewTodo(e.target.value)}
                  placeholder="What needs to be done?"
                  autoFocus
                  className="flex-1 px-4 py-2 bg-portal-bg border border-portal-border rounded-lg text-portal-text placeholder-portal-muted focus:outline-none focus:border-portal-accent"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-4">
                  <select
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    className="px-3 py-1.5 text-sm bg-portal-bg border border-portal-border rounded-lg text-portal-text"
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
                    className="px-3 py-1.5 text-sm bg-portal-bg border border-portal-border rounded-lg text-portal-text"
                  >
                    <option value={0}>Normal</option>
                    <option value={1}>Medium</option>
                    <option value={2}>High</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 text-sm text-portal-muted hover:text-portal-text rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors"
                  >
                    Add Task
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
              <div className="p-12 text-center">
                <CheckSquare className="h-12 w-12 text-portal-muted mx-auto mb-4" />
                <p className="text-portal-muted">
                  {filter === 'completed' ? 'No completed tasks' : 
                   filter === 'active' ? 'All done! 🎉' : 'No tasks yet'}
                </p>
              </div>
            ) : (
              data?.todos.map(todo => (
                <div
                  key={todo.id}
                  className={cn(
                    'flex items-center gap-4 px-4 py-3 group transition-colors',
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
                        className="w-full px-2 py-1 bg-portal-bg border border-portal-border rounded text-portal-text focus:outline-none"
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
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-portal-muted">{todo.category}</span>
                      {todo.priority > 0 && (
                        <span className={cn('text-xs', getPriorityColor(todo.priority))}>
                          {todo.priority === 2 ? '⚡ High' : '● Medium'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
