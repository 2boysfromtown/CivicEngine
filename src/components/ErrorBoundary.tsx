import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React render cycle:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-sandalwood-50 flex items-center justify-center p-6 text-center">
          <div className="bg-white p-8 rounded-2xl shadow-xl border border-sandalwood-200 max-w-md w-full space-y-6">
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-xl bg-red-100 text-red-700 flex items-center justify-center">
                <AlertTriangle size={24} />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-black tracking-tight">Application Crash</h2>
              <p className="text-xs text-sandalwood-600 font-semibold leading-relaxed">
                An unexpected runtime error occurred. Please click reload to refresh the portal.
              </p>
              {this.state.error?.message && (
                <div className="mt-4 p-3 bg-sandalwood-50 border border-sandalwood-150 rounded-lg text-left">
                  <span className="text-[10px] font-bold text-sandalwood-500 uppercase tracking-widest block mb-1">Details</span>
                  <code className="text-[10px] font-mono text-red-600 break-all">{this.state.error.message}</code>
                </div>
              )}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 bg-black hover:bg-sandalwood-900 text-white font-extrabold text-sm rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
