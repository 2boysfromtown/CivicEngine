import React, { useState, useEffect } from 'react';
import VoiceReporter from './VoiceReporter';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { ThumbsUp, ThumbsDown, MapPin, TrendingUp, MessageSquare, AlertTriangle, Building, ShieldAlert, Award, Star, Eye } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { t } from '../i18n';
import { Issue, Project, STATUS_COLORS, STATUS_LABELS } from '../types';
import { auth } from '../firebase';
import IssueDetailModal from './IssueDetailModal';
import FeedbackThread from './FeedbackThread';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Fix leaflet icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, 14);
  return null;
}

export default function CitizenDashboard({ language }: { language: string }) {
  const [location, setLocation] = useState<[number, number]>([12.687, 78.615]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTab, setActiveTab] = useState<'feed' | 'map'>('feed');
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  const fetchIssues = async () => {
    try {
      const token = localStorage.getItem('civicengine_token') || '';
      const res = await fetch('/api/issues', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch issues');
      const data = await res.json();
      setIssues(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('civicengine_token') || '';
      const res = await fetch('/api/projects', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      setProjects(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    // Get GPS coords
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation([pos.coords.latitude, pos.coords.longitude]),
        (err) => console.warn('Geolocation declined or timed out:', err),
        { timeout: 5000 }
      );
    }

    fetchIssues();
    fetchProjects();

    // 15 seconds polling interval for auto-refresh
    const interval = setInterval(() => {
      fetchIssues();
      fetchProjects();
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const handleUpvoteIssue = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening modal
    try {
      const token = localStorage.getItem('civicengine_token') || '';
      const response = await fetch(`/api/issues/${id}/upvote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        fetchIssues();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleVoteProject = async (id: string, isPositive: boolean) => {
    try {
      const token = localStorage.getItem('civicengine_token') || '';
      const response = await fetch(`/api/projects/${id}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isPositive }),
      });
      if (response.ok) {
        fetchProjects();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-20 md:pb-0">
      {/* Left Column: Voice Reporter */}
      <div className="lg:col-span-3 order-first lg:order-none">
        <div className="sticky top-20">
          <VoiceReporter
            language={language}
            location={location}
            onReportSubmitted={fetchIssues}
          />
        </div>
      </div>

      {/* Center Column: Feed & Projects */}
      <div className="lg:col-span-5 flex flex-col gap-4">
        {/* Mobile Tabs */}
        <div className="flex lg:hidden bg-white p-1 rounded-xl shadow-sm border border-sandalwood-200 mb-2">
          <button
            className={cn(
              'flex-1 py-2 text-xs font-bold rounded-lg transition-colors',
              activeTab === 'feed' ? 'bg-black text-white' : 'text-sandalwood-600'
            )}
            onClick={() => setActiveTab('feed')}
          >
            {t(language, 'feed')}
          </button>
          <button
            className={cn(
              'flex-1 py-2 text-xs font-bold rounded-lg transition-colors',
              activeTab === 'map' ? 'bg-black text-white' : 'text-sandalwood-600'
            )}
            onClick={() => setActiveTab('map')}
          >
            {t(language, 'mapView')}
          </button>
        </div>

        <div className={cn('flex flex-col gap-6', activeTab === 'feed' ? 'flex' : 'hidden lg:flex')}>
          <div className="flex items-center justify-between border-b-2 border-black pb-2">
            <h2 className="text-lg font-extrabold flex items-center gap-2">
              <TrendingUp size={18} /> {t(language, 'nearbyIssues')}
            </h2>
          </div>

          <div className="space-y-4">
            {issues.length === 0 ? (
              <p className="text-sm font-semibold text-sandalwood-500 text-center py-8">{t(language, 'noIssues')}</p>
            ) : (
              issues.map((issue) => {
                const isSpam = issue.status === 'REJECTED';
                const hasVoted = issue.upvotedBy?.includes(
                  auth.currentUser?.uid || ''
                );

                return (
                  <div
                    key={issue.id}
                    onClick={() => setSelectedIssueId(issue.id)}
                    className={cn(
                      'bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col transition-all hover:shadow-md hover:border-black cursor-pointer',
                      isSpam ? 'border-red-200 bg-red-50/10' : 'border-sandalwood-200'
                    )}
                  >
                    <div className="flex flex-1">
                      {/* Vote column */}
                      <div
                        className={cn(
                          'w-12 flex flex-col items-center py-4 border-r shrink-0 justify-start',
                          isSpam ? 'bg-red-50/30 border-red-100' : 'bg-sandalwood-50 border-sandalwood-100'
                        )}
                      >
                        <button
                          onClick={(e) => !isSpam && handleUpvoteIssue(issue.id, e)}
                          disabled={isSpam}
                          className={cn(
                            'transition-colors p-1.5 rounded-lg hover:bg-sandalwood-100',
                            hasVoted
                              ? 'text-green-600 bg-green-50 hover:bg-green-100'
                              : 'text-sandalwood-500 hover:text-black disabled:opacity-30'
                          )}
                          title={t(language, 'upvote')}
                        >
                          <ThumbsUp size={16} fill={hasVoted ? 'currentColor' : 'none'} />
                        </button>
                        <span
                          className={cn(
                            'font-bold text-xs my-1',
                            hasVoted ? 'text-green-600' : 'text-black'
                          )}
                        >
                          {issue.upvotes}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  'text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 uppercase tracking-wider',
                                  isSpam ? 'text-red-700 bg-red-100' : 'text-sandalwood-700 bg-sandalwood-100'
                                )}
                              >
                                <AlertTriangle size={10} /> {issue.category}
                              </span>

                               <span className={`px-2 py-0.5 text-[9px] font-extrabold border rounded-full uppercase ${STATUS_COLORS[issue.status]}`}>
                                {STATUS_LABELS[issue.status]}
                              </span>

                              {issue.aiStatus === 'PENDING' && (
                                <span className="px-2 py-0.5 text-[9px] font-extrabold border border-amber-200 bg-amber-50 text-amber-800 rounded-full uppercase animate-pulse">
                                  ⏳ AI Analyzing...
                                </span>
                              )}

                              {isSpam && (
                                <span className="text-[9px] font-extrabold bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                                  ❌ {t(language, 'rejectIssue')}
                                </span>
                              )}
                            </div>

                            <span className="text-[10px] font-bold text-sandalwood-500">
                              {new Date(issue.createdAt).toLocaleDateString()}
                            </span>
                          </div>

                          <h3
                            className={cn(
                              'font-bold text-black text-sm leading-snug mb-2 break-words',
                              isSpam && 'line-through text-sandalwood-500'
                            )}
                          >
                            {issue.summary}
                          </h3>

                          {/* Reference Number */}
                          <div className="text-[10px] font-bold text-sandalwood-500 mb-2">
                            {t(language, 'trackingNumber')}: {issue.trackingNumber}
                          </div>

                          {/* Spam Reason */}
                          {isSpam && issue.spamReason && (
                            <div className="text-[10px] text-red-700 bg-red-50 p-2 rounded-lg border border-red-100 mb-2 font-semibold">
                              {issue.spamReason}
                            </div>
                          )}

                          {/* Safety Hazard Alert */}
                          {issue.safetyHazardPresent && (
                            <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-[10px] font-black uppercase tracking-wider animate-pulse">
                              <ShieldAlert size={12} className="text-amber-700 shrink-0" />
                              <span className="truncate">⚠️ Safety Hazard: {issue.safetyHazardDetails || 'Immediate attention required'}</span>
                            </div>
                          )}

                          {/* Auto-generated tags */}
                          {issue.tags && issue.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {issue.tags.map((tag: string) => (
                                <span key={tag} className="text-[9px] font-black bg-sandalwood-50 text-sandalwood-700 px-2 py-0.5 rounded border border-sandalwood-200 uppercase tracking-wide">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-4 text-[10px] font-bold text-sandalwood-600 mt-2 pt-3 border-t border-sandalwood-100 items-center">
                          <div className="flex items-center gap-1">
                            <MessageSquare size={12} />
                            <span>{(issue.feedback || []).length} {t(language, 'comments')}</span>
                          </div>
                          <div
                            className={cn(
                              'flex items-center gap-1 px-1.5 py-0.5 rounded',
                              issue.severity >= 4 ? 'bg-red-50 text-red-600' : 'bg-sandalwood-50 text-sandalwood-700'
                            )}
                          >
                            {t(language, 'severity')} {issue.severity}
                          </div>
                          <div className="ml-auto text-sandalwood-500 flex items-center gap-1 hover:text-black">
                            <Eye size={12} />
                            <span>View details</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Optional Image */}
                    {issue.imageUrl && (
                      <div className="w-full h-36 border-t border-sandalwood-100 relative overflow-hidden bg-sandalwood-50">
                        <img
                          src={issue.imageUrl}
                          alt="Civic grievance visual evidence"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* PROJECTS SECTION */}
          <div className="flex items-center justify-between border-b-2 border-black pb-2 mt-4">
            <h2 className="text-lg font-extrabold flex items-center gap-2">
              <Building size={18} /> {t(language, 'projects')}
            </h2>
          </div>

          <div className="space-y-4">
            {projects.length === 0 ? (
              <p className="text-xs text-sandalwood-500 italic py-4">No active infrastructure projects.</p>
            ) : (
              projects.map((proj) => {
                const totalVotes = proj.positiveVotes + proj.negativeVotes;
                const positivePercentage = totalVotes > 0 ? (proj.positiveVotes / totalVotes) * 100 : 50;
                const hasUpvoted = proj.votedUsers?.[auth.currentUser?.uid || ''] === 'positive';
                const hasDownvoted = proj.votedUsers?.[auth.currentUser?.uid || ''] === 'negative';

                return (
                  <div
                    key={proj.id}
                    className="bg-white rounded-2xl shadow-sm border border-sandalwood-200 overflow-hidden p-4 space-y-4"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          {proj.department}
                        </span>
                        <h3 className="font-extrabold text-sm mt-2 text-black leading-snug">{proj.title}</h3>
                        <p className="text-[10px] font-bold text-sandalwood-500 mt-0.5">Budget: {proj.allocatedBudget} | Target: {proj.targetCompletionDate}</p>
                      </div>

                      {/* Vote Buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleVoteProject(proj.id, true)}
                          className={cn(
                            'flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-colors border',
                            hasUpvoted
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-sandalwood-50 hover:bg-sandalwood-100 text-sandalwood-700 border-sandalwood-200'
                          )}
                          title="Support Project"
                        >
                          <ThumbsUp size={12} fill={hasUpvoted ? 'currentColor' : 'none'} />
                          <span>{proj.positiveVotes}</span>
                        </button>
                        <button
                          onClick={() => handleVoteProject(proj.id, false)}
                          className={cn(
                            'flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-colors border',
                            hasDownvoted
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-sandalwood-50 hover:bg-sandalwood-100 text-sandalwood-700 border-sandalwood-200'
                          )}
                          title="Object / Criticize"
                        >
                          <ThumbsDown size={12} fill={hasDownvoted ? 'currentColor' : 'none'} />
                          <span>{proj.negativeVotes}</span>
                        </button>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-sandalwood-700 leading-relaxed font-medium">
                      {proj.description}
                    </p>

                    {/* Sentiment index bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-bold">
                        <span className="text-green-700">Citizen Support ({Math.round(positivePercentage)}%)</span>
                        <span className="text-red-700">Objections ({Math.round(100 - positivePercentage)}%)</span>
                      </div>
                      <div className="w-full bg-sandalwood-100 h-2 rounded-full overflow-hidden flex">
                        <div
                          className="bg-green-600 h-full transition-all duration-500"
                          style={{ width: `${positivePercentage}%` }}
                        />
                        <div
                          className="bg-red-600 h-full transition-all duration-500 animate-in"
                          style={{ width: `${100 - positivePercentage}%` }}
                        />
                      </div>
                    </div>

                    {/* View project feedback thread */}
                    <button
                      onClick={() => setExpandedProjectId(expandedProjectId === proj.id ? null : proj.id)}
                      className="text-xs font-bold text-sandalwood-600 hover:text-black flex items-center gap-1"
                    >
                      <MessageSquare size={12} />
                      <span>
                        {expandedProjectId === proj.id ? 'Hide Discussion' : `Join Discussion (${(proj.feedback || []).length})`}
                      </span>
                    </button>

                    {expandedProjectId === proj.id && (
                      <div className="border-t border-sandalwood-100 pt-3 animate-in fade-in duration-200">
                        <FeedbackThread
                          entityType="projects"
                          entityId={proj.id}
                          feedback={proj.feedback || []}
                          language={language}
                          showRating={true}
                          onFeedbackAdded={(entry) => {
                            setProjects(prev =>
                              prev.map(p =>
                                p.id === proj.id
                                  ? { ...p, feedback: [...(p.feedback || []), entry] }
                                  : p
                              )
                            );
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Map */}
      <div className={cn('lg:col-span-4', activeTab === 'map' ? 'block' : 'hidden lg:block')}>
        <div className="sticky top-20 bg-white rounded-2xl shadow-sm border border-sandalwood-200 overflow-hidden flex flex-col h-[400px] lg:h-[600px]">
          <div className="p-3 border-b border-sandalwood-200 bg-black text-white flex items-center justify-between">
            <h2 className="font-bold flex items-center gap-2 text-xs uppercase tracking-wider">
              <MapPin size={14} /> {t(language, 'nearbyIssues')}
            </h2>
            <span className="text-[10px] font-bold bg-white text-black px-2 py-0.5 rounded">
              {issues.length} {t(language, 'active')}
            </span>
          </div>
          <div className="flex-1 relative z-0">
            <MapContainer center={location} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              />
              <ChangeView center={location} />

              <Marker position={location}>
                <Popup>{t(language, 'youAreHere')}</Popup>
              </Marker>

              {issues
                .filter((i) => i.coordinates?.latitude && i.coordinates?.longitude)
                .map((issue) => (
                  <Marker
                    key={issue.id}
                    position={[issue.coordinates.latitude, issue.coordinates.longitude]}
                  >
                    <Popup>
                      <div className="w-48 font-sans space-y-2">
                        <div className="font-bold text-xs flex justify-between items-center">
                          <span>{issue.category}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${STATUS_COLORS[issue.status]}`}>
                            {STATUS_LABELS[issue.status]}
                          </span>
                        </div>
                        <p className="text-[11px] text-sandalwood-700 font-medium leading-relaxed truncate">{issue.summary}</p>
                        <div className="flex items-center justify-between mt-2 pt-1 border-t border-sandalwood-100">
                          <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Sev {issue.severity}</span>
                          <span className="flex items-center gap-1 text-[9px] font-bold bg-black text-white px-1.5 py-0.5 rounded">
                            <ThumbsUp size={10} /> {issue.upvotes}
                          </span>
                        </div>
                        <button
                          onClick={() => setSelectedIssueId(issue.id)}
                          className="w-full mt-2 py-1 text-[9px] font-extrabold uppercase bg-sandalwood-100 hover:bg-sandalwood-200 text-black rounded text-center"
                        >
                          Show Timeline
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                ))}
            </MapContainer>
          </div>
        </div>
      </div>

      {/* Selected Issue Timeline Modal */}
      {selectedIssueId && (
        <IssueDetailModal
          issueId={selectedIssueId}
          language={language}
          onClose={() => setSelectedIssueId(null)}
          onUpdate={fetchIssues}
        />
      )}
    </div>
  );
}
