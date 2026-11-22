import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('Portal ErrorBoundary:', error);
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; path?: string };
        if (parsed.error) {
          friendly = `${parsed.error}${parsed.path ? ` (${parsed.path})` : ''}`;
        }
      } catch {
        // Keep original message
      }

      return (
        <div className="min-h-screen bg-[#F7F6F9] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-[#E4DEF2] rounded-2xl p-8 text-center">
            <h1 className="text-xl font-bold text-[#1B162B]">Something went wrong</h1>
            <p className="mt-2 text-sm text-[#615A78] break-words">{friendly}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 px-5 py-2.5 rounded-xl bg-[#6D28D9] text-white text-sm font-medium hover:bg-[#5B21B6] transition-colors cursor-pointer"
            >
              Reload Portal
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
