import React, { useState, useEffect } from 'react';
import { X, Calendar, MapPin, Shield, AlertTriangle, Clock, RefreshCw, FileText, CheckCircle2, Building } from 'lucide-react';
import { t } from '../i18n';
import { Issue, StatusChange, STATUS_LABELS, STATUS_COLORS } from '../types';
import FeedbackThread from './FeedbackThread';

interface IssueDetailModalProps {
  issueId: string;
  language: string;
  onClose: () => void;
  onUpdate: () => void;
}

export default function IssueDetailModal({ issueId, language, onClose, onUpdate }: IssueDetailModalProps) {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTimeline = async () => {
    try {
      const token = localStorage.getItem('civicengine_token') || '';
      const response = await fetch(`/api/issues/${issueId}/timeline`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch issue details');
      const data = await response.json();
      setIssue(data.issue);
    } catch (err: any) {
      setError(err.message || 'Error loading details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeline();
  }, [issueId]);

  const handleGenerateRTIDraft = () => {
    if (!issue) return;
    const rtiContent = `APPLICATION FOR SEEKING INFORMATION UNDER THE RIGHT TO INFORMATION ACT, 2005
---------------------------------------------------------------------------

To,
The Public Information Officer (PIO)
Municipal Office, ${issue.ward || 'General Ward'},
${issue.municipality || 'Municipal Corporation'},
India

Subject: Request for Information under Section 6(1) of the Right to Information Act, 2005.

1. Name of the Applicant: ${issue.reportedByName || 'Citizen'}
2. Address: Resident of ${issue.ward || 'Resolved Ward'} Area
3. Particulars of Information Required:
   Regarding the unresolved municipal grievance registered on CivicEngine.
   
   A. Grievance Category: ${issue.category}
   B. Grievance Tracking ID: ${issue.trackingNumber}
   C. Date of Filing Grievance: ${new Date(issue.createdAt).toLocaleDateString()}
   D. GPS Coordinates: Latitude ${issue.coordinates?.latitude || 'N/A'}, Longitude ${issue.coordinates?.longitude || 'N/A'}
   E. Reported Grievance Summary: ${issue.summary}

4. Specific Information Requested:
   Under Section 6(1) of the RTI Act 2005, please provide the following records:
   I. Provide copies of all file notes, logs, and correspondence regarding the action taken to resolve the grievance with Tracking ID ${issue.trackingNumber}.
   II. Provide the names, designations, and office addresses of all public servants and contractors assigned to address this grievance, along with the SLA timelines.
   III. Provide the details of the municipal budget allocated for infrastructure projects in category "${issue.category}" for this ward (${issue.ward}) during the current financial year.
   IV. Provide copies of the daily progress logs and inspection reports filed by the supervising engineer for this location.

5. I state that the information sought does not fall within the restrictions contained in Section 8 and 9 of the RTI Act, 2005 and to the best of my knowledge it pertains to your office.

6. Application Fee Details:
   Standard application fee of Rs. 10/- will be paid separately via Indian Postal Order (IPO) / Demand Draft / Online Payment Gateway.

Date: ${new Date().toLocaleDateString()}
Place: ${issue.municipality || 'India'}

Applicant Signature: _________________________
`;

    const blob = new Blob([rtiContent], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `RTI_Application_${issue.trackingNumber.replace(/\\//g, '_')}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[2000] animate-in fade-in duration-200">
        <div className="bg-white p-8 rounded-2xl border border-sandalwood-200 flex flex-col items-center gap-3">
          <RefreshCw size={24} className="animate-spin text-sandalwood-600" />
          <p className="text-sm font-semibold text-sandalwood-700">{t(language, 'loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !issue) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[2000] animate-in fade-in duration-200">
        <div className="bg-white p-6 rounded-2xl border border-sandalwood-200 text-center max-w-sm">
          <p className="text-sm font-bold text-red-600 mb-4">{error || 'Issue not found'}</p>
          <button onClick={onClose} className="px-4 py-2 bg-black text-white rounded-lg text-sm font-bold">
            {t(language, 'close')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[2000] animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-sandalwood-200 shadow-2xl p-6 relative flex flex-col max-h-[90vh]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 hover:bg-sandalwood-100 rounded-lg text-sandalwood-500 hover:text-black transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 border-b border-sandalwood-100 pb-4 mb-4">
          <div className="p-2.5 bg-sandalwood-50 border border-sandalwood-200 rounded-xl">
            <Shield size={20} className="text-sandalwood-600" />
          </div>
          <div>
            <h3 className="font-bold text-black text-base">{t(language, 'issueDetails')}</h3>
            <p className="text-xs text-sandalwood-500 font-bold">{t(language, 'trackingNumber')}: {issue.trackingNumber}</p>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 pr-1 space-y-5">
          {/* Main Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <span className="text-[10px] font-bold text-sandalwood-500 uppercase tracking-wider">{t(language, 'category')}</span>
                <p className="text-sm font-bold text-black">{issue.category}</p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-sandalwood-500 uppercase tracking-wider">{t(language, 'status')}</span>
                <div>
                  <span className={`inline-block px-2 py-0.5 text-xs font-bold border rounded-full uppercase ${STATUS_COLORS[issue.status]}`}>
                    {STATUS_LABELS[issue.status]}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-sandalwood-500 uppercase tracking-wider">{t(language, 'severity')}</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <AlertTriangle size={14} className={issue.severity >= 4 ? 'text-red-600' : 'text-yellow-600'} />
                  <span className="text-xs font-bold text-black">{issue.severity} / 5</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-sandalwood-500 uppercase tracking-wider">{t(language, 'wardDetected')}</span>
                <div className="flex items-center gap-1 text-xs text-black font-semibold mt-0.5">
                  <MapPin size={12} className="text-sandalwood-500" />
                  <span>{issue.ward} ({issue.municipality})</span>
                </div>
              </div>

              {issue.slaDeadline && (
                <div>
                  <span className="text-[10px] font-bold text-sandalwood-500 uppercase tracking-wider flex items-center gap-1">
                    <Clock size={10} /> {t(language, 'slaDeadline')}
                  </span>
                  <p className={`text-xs font-bold ${new Date(issue.slaDeadline) < new Date() && issue.status !== 'RESOLVED' && issue.status !== 'CLOSED' ? 'text-red-600' : 'text-black'}`}>
                    {new Date(issue.slaDeadline).toLocaleString()}
                    {new Date(issue.slaDeadline) < new Date() && issue.status !== 'RESOLVED' && issue.status !== 'CLOSED' && (
                      <span className="ml-1 text-[9px] bg-red-100 text-red-700 px-1 py-0.5 rounded uppercase font-extrabold">OVERDUE</span>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* Visual Proof */}
            {issue.imageUrl && (
              <div className="border border-sandalwood-200 rounded-xl overflow-hidden bg-sandalwood-50 flex items-center justify-center max-h-48">
                <img src={issue.imageUrl} alt="Civic grievance visual evidence" className="object-contain max-h-full max-w-full" />
              </div>
            )}
          </div>

          {/* Description */}
          <div className="p-3.5 bg-sandalwood-50 border border-sandalwood-200 rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-sandalwood-500 uppercase tracking-wider flex items-center gap-1">
              <FileText size={12} /> {t(language, 'summary')}
            </span>
            <p className="text-xs text-black font-medium leading-relaxed">{issue.summary}</p>
          </div>

          {/* Resolution notes */}
          {issue.resolutionNotes && (
            <div className="p-3.5 bg-green-50 border border-green-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-green-700 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 size={12} /> {t(language, 'resolutionNotes')}
              </span>
              <p className="text-xs text-green-950 font-bold leading-relaxed">{issue.resolutionNotes}</p>
            </div>
          )}

          {/* History Timeline */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold text-sandalwood-500 uppercase tracking-wider block">{t(language, 'timeline')}</span>
            <div className="relative border-l border-sandalwood-200 pl-4 ml-2 space-y-4">
              {/* Creation Log */}
              <div className="relative">
                <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-sandalwood-400 border border-white" />
                <div className="text-xs text-sandalwood-600">
                  <span className="font-bold text-black">{issue.reportedByName || 'Citizen'}</span> reported issue on <span className="font-semibold">{new Date(issue.createdAt).toLocaleString()}</span>
                </div>
              </div>

              {/* Status History Logs */}
              {issue.statusHistory?.map((h, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-black border border-white" />
                  <div className="text-xs text-sandalwood-600">
                    <span className="font-bold text-black">{h.byDisplayName}</span> ({h.byRole}) updated status from <span className="font-bold">{STATUS_LABELS[h.from]}</span> to <span className="font-bold text-black">{STATUS_LABELS[h.to]}</span> on <span className="font-semibold">{new Date(h.timestamp).toLocaleString()}</span>
                    {h.note && <p className="mt-1 italic text-sandalwood-800 bg-sandalwood-50 p-1.5 rounded border border-sandalwood-100">Note: {h.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RTI Act 2005 Appeal Draft Generator */}
          {issue.status !== 'RESOLVED' && issue.status !== 'CLOSED' && (
            <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-start gap-2.5">
                <Building size={16} className="text-amber-800 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">RTI Act 2005 Citizen Empowerment</h4>
                  <p className="text-[11px] text-amber-800 leading-relaxed font-semibold mt-0.5">
                    Under Section 6(1) of the Indian Right to Information Act 2005, you have the legal right to request information regarding delays, budget allocations, and responsible officers for unresolved civic grievances.
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleGenerateRTIDraft()}
                className="w-full py-2 bg-amber-900 hover:bg-amber-950 text-white rounded-lg text-xs font-black uppercase transition-colors tracking-wider"
              >
                Generate Pre-Filled RTI Draft Receipt
              </button>
            </div>
          )}

          {/* Comments section */}
          <FeedbackThread
            entityType="issues"
            entityId={issue.id}
            feedback={issue.feedback || []}
            language={language}
            onFeedbackAdded={(entry) => {
              setIssue(prev => prev ? { ...prev, feedback: [...(prev.feedback || []), entry] } : null);
              onUpdate();
            }}
          />
        </div>
      </div>
    </div>
  );
}
