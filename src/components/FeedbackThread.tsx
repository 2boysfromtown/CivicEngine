import React, { useState } from 'react';
import { MessageSquare, Send, User, Star } from 'lucide-react';
import { t } from '../i18n';
import { FeedbackEntry } from '../types';

interface FeedbackThreadProps {
  entityType: 'issues' | 'projects';
  entityId: string;
  feedback: FeedbackEntry[];
  language: string;
  onFeedbackAdded: (newEntry: FeedbackEntry) => void;
  showRating?: boolean;
}

export default function FeedbackThread({
  entityType,
  entityId,
  feedback,
  language,
  onFeedbackAdded,
  showRating = false,
}: FeedbackThreadProps) {
  const [text, setText] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      const token = localStorage.getItem('civicengine_token') || '';
      const response = await fetch(`/api/${entityType}/${entityId}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text,
          rating: showRating && rating ? rating : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to post feedback');
      }

      const newEntry = await response.json();
      onFeedbackAdded(newEntry);
      setText('');
      setRating(null);
    } catch (err: any) {
      setError(err.message || 'Error submitting comment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-t border-sandalwood-100 pt-4 mt-4 space-y-4">
      <div className="flex items-center gap-2 text-xs font-bold text-sandalwood-700 uppercase tracking-wider mb-2">
        <MessageSquare size={14} />
        <span>{t(language, 'comments')} ({feedback?.length || 0})</span>
      </div>

      {/* Feed list */}
      <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
        {!feedback || feedback.length === 0 ? (
          <p className="text-xs text-sandalwood-500 italic py-2">{t(language, 'noFeedbackYet')}</p>
        ) : (
          feedback.map((entry) => (
            <div key={entry.id} className="p-3 bg-sandalwood-50 rounded-lg border border-sandalwood-100 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-black flex items-center gap-1.5">
                  <User size={12} className="text-sandalwood-500" />
                  {entry.displayName}
                  {entry.role === 'authority' && (
                    <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-blue-100 text-blue-800 rounded uppercase tracking-wider">
                      {t(language, 'authority')}
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-sandalwood-500 font-medium">
                  {new Date(entry.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-xs text-sandalwood-800 leading-relaxed break-words">{entry.text}</p>
              {entry.rating && (
                <div className="flex items-center gap-0.5 mt-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={10}
                      className={i < (entry.rating || 0) ? "fill-yellow-400 text-yellow-400" : "text-sandalwood-300"}
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input box */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {showRating && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-sandalwood-700">{t(language, 'rateProject')}:</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onClick={() => setRating(star)}
                  className="focus:outline-none"
                >
                  <Star
                    size={16}
                    className={star <= (rating || 0) ? "fill-yellow-400 text-yellow-400" : "text-sandalwood-300 hover:text-yellow-300"}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={submitting}
            placeholder={t(language, 'feedbackPlaceholder')}
            className="flex-1 px-3 py-2 bg-sandalwood-50 border border-sandalwood-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-black text-black placeholder-sandalwood-400"
          />
          <button
            type="submit"
            disabled={submitting || !text.trim()}
            className="px-3 py-2 bg-black text-white rounded-lg hover:bg-sandalwood-900 transition-colors flex items-center justify-center disabled:opacity-50"
            title={t(language, 'submitFeedback')}
          >
            <Send size={14} />
          </button>
        </div>
        {error && <p className="text-[10px] text-red-600 font-semibold">{error}</p>}
      </form>
    </div>
  );
}
