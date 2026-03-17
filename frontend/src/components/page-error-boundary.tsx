import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  title?: string;
};

type State = {
  hasError: boolean;
  message: string;
};

export class PageErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || '页面加载失败',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('PageErrorBoundary', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section className="page">
        <article className="card fallback-panel page-enter">
          <div className="fallback-stack">
            <div className="error-callout">
              <AlertTriangle size={24} className="accent-icon" />
              <div>
                <h2>{this.props.title || '页面暂时不可用'}</h2>
                <p>请刷新后重试。</p>
              </div>
            </div>
            <div className="feedback feedback-error">{this.state.message}</div>
            <button className="primary-button" onClick={this.handleReload}>
              <RefreshCcw size={16} />
              <span>重新加载页面</span>
            </button>
          </div>
        </article>
      </section>
    );
  }
}
