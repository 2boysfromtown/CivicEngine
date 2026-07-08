import React, { useState, useEffect } from 'react';
import { X, Briefcase, IndianRupee, Calendar, FileText } from 'lucide-react';
import { t } from '../i18n';
import { Project, DEPARTMENTS, ProjectStatus } from '../types';

interface ProjectModalProps {
  project?: Project | null;
  language: string;
  onClose: () => void;
  onSaved: (project: Project) => void;
}

const STATUS_OPTIONS: ProjectStatus[] = ['PROPOSED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'PAUSED'];

export default function ProjectModal({ project, language, onClose, onSaved }: ProjectModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [budget, setBudget] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('PROPOSED');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (project) {
      setTitle(project.title);
      setDescription(project.description || '');
      setDepartment((project.department as any) || DEPARTMENTS[0]);
      setBudget(project.allocatedBudget);
      setTargetDate(project.targetCompletionDate);
      setStatus(project.status);
    }
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      const token = localStorage.getItem('civicengine_token') || '';
      const method = project ? 'PATCH' : 'POST';
      const url = project ? `/api/projects/${project.id}` : '/api/projects';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          description,
          department,
          allocatedBudget: budget,
          targetCompletionDate: targetDate,
          status,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save project');
      }

      const savedProj = await response.json();
      onSaved(savedProj);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error saving project');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[2000] animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-sandalwood-200 shadow-2xl p-6 relative flex flex-col max-h-[90vh]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 hover:bg-sandalwood-100 rounded-lg text-sandalwood-500 hover:text-black transition-colors"
        >
          <X size={18} />
        </button>

        <h3 className="text-lg font-bold text-black flex items-center gap-2 mb-6 tracking-tight">
          <Briefcase size={20} className="text-sandalwood-600" />
          {project ? t(language, 'editProject') : t(language, 'addProject')}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 pr-1">
          <div>
            <label className="block text-xs font-bold text-black uppercase tracking-wider mb-1">
              {t(language, 'projectTitle')}
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-sandalwood-50 border border-sandalwood-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black text-sm text-black"
              placeholder="E.g. Ward 4 Road Overlay"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-black uppercase tracking-wider mb-1">
              {t(language, 'projectDescription')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-3.5 py-2.5 bg-sandalwood-50 border border-sandalwood-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black text-sm text-black placeholder-sandalwood-400"
              placeholder="Detail the scope of work, impact, and other specifications..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-black uppercase tracking-wider mb-1">
                {t(language, 'projectDepartment')}
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-sandalwood-50 border border-sandalwood-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black text-sm text-black"
              >
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-black uppercase tracking-wider mb-1">
                {t(language, 'projectStatus')}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="w-full px-3.5 py-2.5 bg-sandalwood-50 border border-sandalwood-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black text-sm text-black"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-black uppercase tracking-wider mb-1 flex items-center gap-1">
                <IndianRupee size={12} /> {t(language, 'projectBudget')}
              </label>
              <input
                type="text"
                required
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-sandalwood-50 border border-sandalwood-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black text-sm text-black"
                placeholder="₹4.2 Crores"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-black uppercase tracking-wider mb-1 flex items-center gap-1">
                <Calendar size={12} /> {t(language, 'projectTarget')}
              </label>
              <input
                type="date"
                required
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-sandalwood-50 border border-sandalwood-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black text-sm text-black"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-600 font-bold">{error}</p>}

          <div className="flex justify-end gap-3 pt-4 border-t border-sandalwood-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-sandalwood-200 rounded-xl text-sm font-semibold hover:bg-sandalwood-50 transition-colors"
            >
              {t(language, 'cancelProject')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-black text-white font-bold text-sm rounded-xl hover:bg-sandalwood-900 transition-colors"
            >
              {t(language, 'saveProject')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
