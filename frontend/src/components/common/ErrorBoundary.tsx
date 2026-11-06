import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import Mel from '../brand/Mel.js';
import { ArrowsClockwise } from '../ui/icons.js';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-canvas text-ink flex items-center justify-center p-6">
          <div className="max-w-md w-full card-surface p-8 text-center space-y-5 shadow-[var(--shadow-card)]">
            <div className="flex justify-center">
              <Mel mood="alert" size={110} />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-extrabold text-ink tracking-tight">
                Tivemos um imprevisto técnico
              </h2>
              <p className="text-xs sm:text-sm text-muted leading-relaxed">
                Não se preocupe: suas transações e dados financeiros continuam seguros. Um erro temporário impediu a exibição desta tela.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="min-h-[44px] px-6 py-2.5 rounded-2xl bg-primary text-on-primary font-bold text-xs hover:bg-primary-deep transition flex items-center justify-center gap-2 mx-auto shadow-[var(--shadow-honey)]"
              >
                <ArrowsClockwise size={18} weight="bold" />
                <span>Recarregar Página</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
