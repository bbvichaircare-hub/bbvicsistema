import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Captura erros globais e mostra na tela (ajuda diagnosticar Safari)
window.onerror = function(msg, src, line, _col, _err) {
  const div = document.getElementById('root');
  if (div && div.innerHTML === '') {
    div.innerHTML = '<div style="padding:20px;font-family:sans-serif;color:red"><h3>Erro ao carregar</h3><p>' + msg + '</p><p>' + (src || '') + ':' + line + '</p></div>';
  }
};

window.addEventListener('unhandledrejection', function(e) {
  const div = document.getElementById('root');
  if (div && div.innerHTML === '') {
    div.innerHTML = '<div style="padding:20px;font-family:sans-serif;color:red"><h3>Erro promise</h3><p>' + (e.reason?.message || e.reason || 'unknown') + '</p></div>';
  }
});

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {error: string|null}> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err: any) {
    return { error: err?.message || String(err) };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding:20, fontFamily:'sans-serif', color:'red'}}>
          <h3>Erro na aplicação</h3>
          <p>{this.state.error}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} else {
  document.body.innerHTML = '<div style="padding:20px;color:red">Root element not found</div>';
}
