import React, { Component, type ErrorInfo, type ReactNode } from 'react';

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
        <div className="min-h-screen bg-[#131313] text-[#e5e2e1] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#1c1b1b] border border-[#eb5757]/30 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-[#eb5757]/15 border border-[#eb5757]/30 flex items-center justify-center text-[#eb5757] mx-auto">
              <span className="material-symbols-outlined text-2xl">warning</span>
            </div>
            <h3 className="text-lg font-bold text-white">Ops, algo deu errado nesta tela</h3>
            <p className="text-xs text-[#99907b]">
              {this.state.error?.message || 'Ocorreu um erro inesperado ao carregar os dados.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-5 py-2.5 rounded-xl bg-[#f2c94c] text-[#131313] text-xs font-bold hover:scale-[1.02] transition"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
