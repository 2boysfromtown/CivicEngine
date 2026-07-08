import React, { useEffect, useState } from 'react';
import { Issue, Project, STATUS_COLORS, STATUS_LABELS, STATUS_TRANSITIONS, IssueStatus, DEPARTMENTS } from '../types';
import { AlertTriangle, MapPin, TrendingDown, TrendingUp, Clock, CheckCircle2, RefreshCw, Plus, Edit3, MessageSquare, Download, Filter, Search, Award, FileText, X, ShieldAlert } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { t } from '../i18n';
import ProjectModal from './ProjectModal';
import IssueDetailModal from './IssueDetailModal';
import { marked } from 'marked';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function ChangeMapView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, 13);
  return null;
}

export default function AuthorityDashboard({ language }: { language: string }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Analytics
  const [stats, setStats] = useState<any>(null);
  
  // Filtering & Search
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  // AI Strategic Analysis
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Modals & Sheets
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  // Action Panel State
  const [actionNotes, setActionNotes] = useState('');
  const [actionDept, setActionDept] = useState(DEPARTMENTS[0]);
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const fetchAnalysis = async () => {
    setAnalyzing(true);
    try {
      const token = localStorage.getItem('civicengine_token') || '';
      const res = await fetch('/api/analyze-ward', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAnalysis(data.analysis);
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('civicengine_token') || '';
      const res = await fetch('/api/analytics/ward-stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.warn('Could not load analytics:', e);
    }
  };

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('civicengine_token') || '';
      const [issuesRes, projectsRes] = await Promise.all([
        fetch('/api/issues', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const issuesData = await issuesRes.json();
      const projectsData = await projectsRes.json();

      setIssues(issuesData);
      setProjects(projectsData);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchStats();
    
    const interval = setInterval(() => {
      fetchData();
      fetchStats();
    }, 15000);
    
    return () => clearInterval(interval);
  }, []);

  const handleStatusChange = async (issueId: string, nextStatus: IssueStatus) => {
    setActionSubmitting(true);
    try {
      const token = localStorage.getItem('civicengine_token') || '';
      const response = await fetch(`/api/issues/${issueId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: nextStatus,
          note: actionNotes,
          assignedDepartment: nextStatus === 'ASSIGNED' ? actionDept : undefined,
        }),
      });

      if (!response.ok) throw new Error('Status transition failed');
      
      setActionNotes('');
      setActiveIssueId(null);
      fetchData();
      fetchStats();
    } catch (e: any) {
      alert(e.message || 'Failed to update status');
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const token = localStorage.getItem('civicengine_token') || '';
      const res = await fetch('/api/export/issues', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ward-issues-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error(e);
    }
  };

  // Get Map Center dynamically based on average of issue coordinates
  const getMapCenter = (): [number, number] => {
    const validCoords = issues.filter(
      (i) => i.coordinates?.latitude && i.coordinates?.longitude && i.coordinates.latitude !== 0
    );
    if (validCoords.length === 0) return [12.687, 78.615];
    const sumLat = validCoords.reduce((acc, curr) => acc + curr.coordinates.latitude, 0);
    const sumLng = validCoords.reduce((acc, curr) => acc + curr.coordinates.longitude, 0);
    return [sumLat / validCoords.length, sumLng / validCoords.length];
  };

  const filteredIssues = issues.filter((issue) => {
    const matchesSearch =
      issue.trackingNumber?.toLowerCase().includes(search.toLowerCase()) ||
      issue.summary?.toLowerCase().includes(search.toLowerCase()) ||
      issue.category?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !filterCategory || issue.category === filterCategory;
    const matchesStatus = !filterStatus || issue.status === filterStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3 text-blue-900 bg-blue-50/20">
        <RefreshCw size={28} className="animate-spin" />
        <span className="animate-pulse tracking-widest text-xs font-black">SECURE COMMAND CENTER ACCESSING...</span>
      </div>
    );
  }

  // Pie chart colors
  const COLORS = ['#1e3a8a', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'];

  return (
    <div className="bg-blue-50/30 text-black font-sans pb-16">
      <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between border-b border-blue-200 pb-5 gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-blue-950 flex items-center gap-2">
            <Award size={24} className="text-blue-900" />
            {t(language, 'commandCenter')}
          </h1>
          <p className="text-blue-900 mt-0.5 text-xs font-semibold uppercase tracking-wider">
            Ward Grievance Control Room & Analytics Portal
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 items-center">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-blue-50 text-blue-900 border border-blue-200 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            <Download size={14} />
            <span>{t(language, 'exportCSV')}</span>
          </button>
          
          <button
            onClick={() => {
              setEditingProject(null);
              setShowProjectModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-100"
          >
            <Plus size={14} />
            <span>{t(language, 'addProject')}</span>
          </button>

          <button
            onClick={fetchAnalysis}
            disabled={analyzing}
            className="bg-black hover:bg-blue-950 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {analyzing ? (
              <>
                <RefreshCw size={12} className="animate-spin text-white" />
                <span>{t(language, 'thinking')}</span>
              </>
            ) : (
              <>
                <FileText size={14} />
                <span>{t(language, 'aiAnalysis')}</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* AI STRATEGIC RESOLUTION REPORT */}
      {analysis && (
        <div className="mb-6 bg-white p-6 rounded-2xl border border-blue-200 shadow-md relative animate-in fade-in duration-300">
          <button
            onClick={() => setAnalysis(null)}
            className="absolute top-4 right-4 p-1 hover:bg-blue-50 text-sandalwood-500 rounded-lg text-blue-900"
          >
            <X size={16} />
          </button>
          <h2 className="text-base font-extrabold mb-3 flex items-center gap-2 text-blue-950 border-b border-blue-100 pb-2">
            <CheckCircle2 className="text-blue-900" size={18} />
            AI Strategic Resolution Report
          </h2>
          <div
            className="prose prose-blue max-w-none text-xs leading-relaxed text-blue-950 font-semibold"
            dangerouslySetInnerHTML={{ __html: marked.parse(analysis) }}
          />
        </div>
      )}

      {/* ANALYTICS CHARTS SECTION */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {/* Card stats */}
          <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-sm flex flex-col justify-center">
            <span className="text-[10px] font-black text-blue-800 uppercase tracking-widest">Active Open Cases</span>
            <span className="text-2xl font-black text-blue-950 mt-1">{stats.totalOpen}</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-sm flex flex-col justify-center">
            <span className="text-[10px] font-black text-orange-800 uppercase tracking-widest">In Action</span>
            <span className="text-2xl font-black text-orange-950 mt-1">{stats.totalInProgress}</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-sm flex flex-col justify-center">
            <span className="text-[10px] font-black text-green-800 uppercase tracking-widest">Resolved SLA Cases</span>
            <span className="text-2xl font-black text-green-950 mt-1">{stats.totalResolved}</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-sm flex flex-col justify-center">
            <span className="text-[10px] font-black text-red-800 uppercase tracking-widest">SLA Deadline Breaches</span>
            <span className="text-2xl font-black text-red-950 mt-1 flex items-center gap-1.5">
              {stats.slaBreaches}
              {stats.slaBreaches > 0 && (
                <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-extrabold animate-pulse">ACTION REQ</span>
              )}
            </span>
          </div>

          {/* Chart widgets */}
          <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-sm md:col-span-2 h-60">
            <h3 className="text-xs font-black text-blue-950 uppercase tracking-wider mb-2">Grievances Filed (Last 30 Days)</h3>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={stats.byDay}>
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#1e3a8a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-sm md:col-span-2 h-60 flex flex-col">
            <h3 className="text-xs font-black text-blue-950 uppercase tracking-wider mb-2">Grievances by Category</h3>
            <div className="flex-1 flex items-center justify-between">
              <ResponsiveContainer width="50%" height="100%">
                <PieChart>
                  <Pie
                    data={Object.entries(stats.byCategory || {}).map(([key, val]) => ({ name: key, value: val }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {Object.entries(stats.byCategory || {}).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="w-1/2 space-y-1.5 pl-4">
                {Object.entries(stats.byCategory || {}).map(([key, val], index) => (
                  <div key={key} className="flex items-center gap-1.5 text-[10px] font-bold">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="truncate flex-1">{key}</span>
                    <span className="text-blue-950 font-black">{val as any}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FILTER & SEARCH */}
      <div className="mb-6 bg-white p-4 rounded-2xl border border-blue-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-xs">
          <Search className="absolute left-3 top-2.5 text-sandalwood-500" size={14} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(language, 'searchIssues')}
            className="w-full pl-9 pr-4 py-2 bg-blue-50/50 border border-blue-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-950 text-xs text-black"
          />
        </div>

        <div className="flex flex-wrap gap-3 items-center w-full md:w-auto justify-end">
          <div className="flex items-center gap-1.5 text-xs text-blue-900 font-bold">
            <Filter size={14} />
            <span>Filter:</span>
          </div>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 bg-white border border-blue-200 rounded-xl text-xs font-bold cursor-pointer text-black"
          >
            <option value="">All Categories</option>
            <option value="ROADS">Roads / Potholes</option>
            <option value="WATER_SUPPLY">Water Supply</option>
            <option value="SANITATION">Sanitation / Trash</option>
            <option value="ELECTRICITY">Electricity / Lights</option>
            <option value="PUBLIC_SAFETY">Public Safety</option>
            <option value="OTHER">Other</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-white border border-blue-200 rounded-xl text-xs font-bold cursor-pointer text-black"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Heatmap & Project Sentiment */}
        <div className="lg:col-span-2 space-y-6">
          {/* Leaflet Command Heatmap */}
          <div className="bg-white rounded-2xl border border-blue-200 overflow-hidden shadow-sm relative z-0">
            <div className="p-4 border-b border-blue-200 bg-white flex justify-between items-center relative z-10">
              <h2 className="text-sm font-black flex items-center gap-2 text-blue-950 uppercase tracking-wider">
                <MapPin size={18} className="text-blue-900" />
                Command Center Map View
              </h2>
              <span className="text-[10px] bg-blue-900 text-white px-3 py-1 rounded-full font-black tracking-widest">
                {t(language, 'liveGeoClustering')}
              </span>
            </div>
            <div className="h-[350px] w-full bg-blue-50/20 relative overflow-hidden border-b border-blue-200">
              <MapContainer center={getMapCenter()} zoom={13} style={{ height: '100%', width: '100%', zIndex: 0 }}>
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                />
                <ChangeMapView center={getMapCenter()} />
                {filteredIssues
                  .filter((i) => i.coordinates?.latitude && i.coordinates?.longitude)
                  .map((issue) => (
                    <CircleMarker
                      key={issue.id}
                      center={[issue.coordinates.latitude, issue.coordinates.longitude]}
                      radius={Math.max(8, (issue.priorityScore || 1) * 2.2)}
                      pathOptions={{
                        fillColor: issue.priorityScore > 7.5 ? '#b91c1c' : '#1e3a8a',
                        color: '#ffffff',
                        weight: 1.5,
                        fillOpacity: 0.85,
                      }}
                    >
                      <Popup>
                        <div className="font-sans text-xs w-48 space-y-1">
                          <div className="font-bold flex justify-between items-center">
                            <span>{issue.category}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${STATUS_COLORS[issue.status]}`}>
                              {STATUS_LABELS[issue.status]}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-500 font-bold">Pri: {issue.priorityScore?.toFixed(1)} | Ref: {issue.trackingNumber}</div>
                          <p className="font-medium text-gray-800 leading-snug">{issue.summary}</p>
                          <button
                            onClick={() => setSelectedIssueId(issue.id)}
                            className="w-full mt-2 py-1 text-[8px] font-extrabold uppercase bg-blue-50 text-blue-900 border border-blue-200 rounded text-center"
                          >
                            Open Timeline
                          </button>
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
              </MapContainer>
            </div>
          </div>

          {/* Project Control Centre */}
          <div className="bg-white rounded-2xl border border-blue-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-blue-200 flex justify-between items-center bg-white">
              <h2 className="text-sm font-black flex items-center gap-2 text-blue-950 uppercase tracking-wider">
                <TrendingUp size={18} className="text-blue-900" />
                Active Municipal Infrastructure Projects
              </h2>
            </div>
            <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
              {projects.length === 0 ? (
                <p className="text-center text-xs text-sandalwood-500 py-6">No municipal projects registered.</p>
              ) : (
                projects.map((proj) => {
                  const totalVotes = proj.positiveVotes + proj.negativeVotes;
                  const positivePercentage = totalVotes > 0 ? (proj.positiveVotes / totalVotes) * 100 : 50;

                  return (
                    <div key={proj.id} className="bg-blue-50/20 p-5 rounded-xl border border-blue-200 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-black text-black text-sm">{proj.title}</h3>
                          <p className="text-[10px] text-blue-900 font-bold uppercase tracking-wider mt-0.5">
                            {proj.department}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingProject(proj);
                              setShowProjectModal(true);
                            }}
                            className="p-1.5 bg-white hover:bg-blue-50 text-blue-900 border border-blue-200 rounded-lg transition-all"
                            title={t(language, 'editProject')}
                          >
                            <Edit3 size={12} />
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-blue-950 leading-relaxed font-semibold">{proj.description}</p>

                      <div className="grid grid-cols-2 gap-4 text-[10px] font-bold text-blue-900">
                        <span>Allocated Budget: {proj.allocatedBudget}</span>
                        <span>Target date: {proj.targetCompletionDate}</span>
                      </div>

                      {/* Objections bar */}
                      <div className="space-y-1 pt-2">
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="text-green-700">Positive votes ({proj.positiveVotes})</span>
                          <span className="text-red-700">Objections ({proj.negativeVotes})</span>
                        </div>
                        <div className="w-full bg-blue-100 h-1.5 rounded-full overflow-hidden flex">
                          <div className="bg-green-600 h-full" style={{ width: `${positivePercentage}%` }} />
                          <div className="bg-red-600 h-full" style={{ width: `${100 - positivePercentage}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: High-Priority Queue */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-blue-200 overflow-hidden shadow-sm h-full flex flex-col">
            <div className="p-4 border-b border-blue-200 flex justify-between items-center bg-black">
              <h2 className="text-xs font-black flex items-center gap-1.5 text-white uppercase tracking-widest">
                <AlertTriangle size={16} className="text-yellow-400" />
                Actionable Execution Queue
              </h2>
              <span className="text-[9px] bg-red-600 text-white font-extrabold px-2 py-0.5 rounded-full animate-pulse">
                {filteredIssues.length} CASES
              </span>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-4 bg-blue-50/15 max-h-[600px]">
              {filteredIssues.length === 0 ? (
                <div className="text-center text-sandalwood-600 text-xs py-8 font-bold">Queue is clear.</div>
              ) : (
                filteredIssues.map((issue) => {
                  const allowedTransitions = STATUS_TRANSITIONS[issue.status] || [];
                  const isActionActive = activeIssueId === issue.id;

                  return (
                    <div
                      key={issue.id}
                      className={cn(
                        'p-5 rounded-xl border relative overflow-hidden transition-all bg-white hover:shadow-md border-blue-200'
                      )}
                    >
                      <div className="absolute top-0 left-0 w-1 h-full bg-blue-900" />

                      <div className="flex justify-between items-start mb-3">
                        <span className="text-[10px] font-black font-mono bg-blue-50 px-2 py-0.5 border border-blue-200 rounded text-blue-900 uppercase">
                          {issue.category}
                        </span>
                        <span className="text-xs font-black text-blue-950 font-mono">
                          PRI: {issue.priorityScore?.toFixed(1)}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-black mb-1">{issue.trackingNumber}</h4>
                      <p className="text-xs text-blue-950 leading-relaxed font-semibold mb-3">
                        {issue.summary}
                      </p>

                      {/* Safety Alerts & Tags */}
                      {issue.safetyHazardPresent && (
                        <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 bg-red-50 border border-red-200 text-red-950 rounded-lg text-[10px] font-black uppercase tracking-wider animate-pulse mb-3">
                          <ShieldAlert size={12} className="text-red-700 shrink-0" />
                          <span className="truncate">🚨 Safety Hazard: {issue.safetyHazardDetails || 'Immediate attention required'}</span>
                        </div>
                      )}

                      {issue.tags && issue.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2 mb-3">
                          {issue.tags.map((tag: string) => (
                            <span key={tag} className="text-[9px] font-black bg-blue-50 text-blue-900 px-2 py-0.5 rounded border border-blue-200 uppercase tracking-wide">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-blue-50">
                        <span className={`px-2 py-0.5 text-[9px] font-extrabold border rounded-full uppercase ${STATUS_COLORS[issue.status]}`}>
                          {STATUS_LABELS[issue.status]}
                        </span>
                        {issue.aiStatus === 'PENDING' && (
                          <span className="px-2 py-0.5 text-[9px] font-extrabold border border-amber-200 bg-amber-50 text-amber-800 rounded-full uppercase animate-pulse">
                            ⏳ AI Analyzing...
                          </span>
                        )}
                        <span className="text-[9px] text-sandalwood-500 font-bold">
                          {new Date(issue.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="mt-4 pt-3 border-t border-blue-50 space-y-3">
                        {!isActionActive ? (
                          <div className="flex flex-wrap gap-1.5">
                            {allowedTransitions.map((tState) => (
                              <button
                                key={tState}
                                onClick={() => {
                                  setActiveIssueId(issue.id);
                                  setActionNotes('');
                                }}
                                className="px-2.5 py-1.5 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-[10px] font-extrabold uppercase transition-colors"
                              >
                                {STATUS_LABELS[tState]}
                              </button>
                            ))}
                            <button
                              onClick={() => setSelectedIssueId(issue.id)}
                              className="px-2.5 py-1.5 bg-white hover:bg-blue-50 text-blue-900 border border-blue-200 rounded-lg text-[10px] font-extrabold uppercase transition-all"
                            >
                              Details / Discuss
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100 animate-in slide-in-from-top-2 duration-200">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-black text-blue-950">PERFORMING WORKFLOW UPDATE</span>
                              <button onClick={() => setActiveIssueId(null)} className="text-xs text-red-600 font-bold hover:underline">
                                Cancel
                              </button>
                            </div>

                            {/* Department allocation selector if state transitions to ASSIGNED */}
                            {allowedTransitions.includes('ASSIGNED') && (
                              <div>
                                <label className="block text-[9px] font-black text-blue-900 uppercase tracking-wider mb-1">
                                  Select department allocation
                                </label>
                                <select
                                  value={actionDept}
                                  onChange={(e) => setActionDept(e.target.value)}
                                  className="w-full px-2 py-1.5 bg-white border border-blue-200 rounded text-xs font-bold text-black"
                                >
                                  {DEPARTMENTS.map((d) => (
                                    <option key={d} value={d}>{d}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <div>
                              <label className="block text-[9px] font-black text-blue-900 uppercase tracking-wider mb-1">
                                Progress Note / Resolution Details
                              </label>
                              <textarea
                                value={actionNotes}
                                onChange={(e) => setActionNotes(e.target.value)}
                                rows={2}
                                className="w-full p-2 bg-white border border-blue-200 rounded text-xs text-black leading-relaxed font-semibold resize-none"
                                placeholder="State actions taken, dispatch details, or spam reasons..."
                              />
                            </div>

                            <div className="flex gap-2">
                              {allowedTransitions.map((tState) => (
                                <button
                                  key={tState}
                                  disabled={actionSubmitting}
                                  onClick={() => handleStatusChange(issue.id, tState)}
                                  className="flex-1 py-1.5 bg-black hover:bg-blue-950 text-white rounded text-[10px] font-black uppercase disabled:opacity-50"
                                >
                                  Submit {STATUS_LABELS[tState]}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Project Creation / Edit Modal */}
      {showProjectModal && (
        <ProjectModal
          project={editingProject}
          language={language}
          onClose={() => setShowProjectModal(false)}
          onSaved={() => {
            fetchData();
            fetchStats();
          }}
        />
      )}

      {/* Selected Issue detail/timeline Modal */}
      {selectedIssueId && (
        <IssueDetailModal
          issueId={selectedIssueId}
          language={language}
          onClose={() => setSelectedIssueId(null)}
          onUpdate={fetchData}
        />
      )}
    </div>
  );
}
