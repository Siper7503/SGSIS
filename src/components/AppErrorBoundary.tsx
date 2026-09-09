import React from 'react';

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Erreur inattendue de l interface.'
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Erreur de rendu SGSIS:', error, info.componentStack);
  }

  handleReload = () => window.location.reload();

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <section className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-700">!</div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">Le module a rencontre une erreur</h1>
          <p className="mt-2 text-sm text-slate-600">Vos donnees restent conservees. Rechargez la page pour reprendre votre travail.</p>
          <p className="mt-3 break-words rounded-lg bg-slate-50 p-3 text-left text-xs text-slate-500">{this.state.message}</p>
          <button type="button" onClick={this.handleReload} className="mt-5 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
            Recharger l application
          </button>
        </section>
      </main>
    );
  }
}
