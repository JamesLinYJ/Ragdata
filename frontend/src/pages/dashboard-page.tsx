import type { CSSProperties } from 'react';
import {
  Database,
  House,
  MessageSquareText,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { API_BASE } from '../lib/http';
import {
  fetchTenantInfo,
  listDialogs,
  listKnowledgeBases,
} from '../lib/ragflow';
import type { TenantInfo } from '../types/ragflow';
import { StatusBadge } from '../components/status-badge';

const BUSINESS_SPACE_NAME = '知识工作空间';
const revealDelay = (delay: string) => ({ '--delay': delay } as CSSProperties);

type DashboardState = {
  tenant: TenantInfo | null;
  knowledgeCount: number;
  dialogCount: number;
};

export function DashboardPage() {
  const [state, setState] = useState<DashboardState>({
    tenant: null,
    knowledgeCount: 0,
    dialogCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ... useEffect part ...
  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        const [tenant, knowledge, dialogs] = await Promise.all([
          fetchTenantInfo(),
          listKnowledgeBases({ pageSize: 100 }),
          listDialogs({ pageSize: 100 }),
        ]);

        if (!mounted) return;
        setState({
          tenant,
          knowledgeCount: knowledge.total ?? knowledge.kbs.length,
          dialogCount: dialogs.total ?? dialogs.dialogs.length,
        });
      } catch (nextError) {
        if (!mounted) return;
        setError(nextError instanceof Error ? nextError.message : '加载首页失败');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="page page-enter">
      <header className="page-header">
        <div className="page-intro">
          <span className="page-eyebrow">概览</span>
          <h1 className="headline-with-icon">
            <House size={28} className="accent-icon" />
            首页
          </h1>
          <p className="page-lead">查看当前空间的内容规模、问答入口和系统使用情况。</p>
        </div>
        <div className="page-actions">
          <StatusBadge tone="success">运行正常</StatusBadge>
        </div>
      </header>

      {error ? <div className="feedback feedback-error">{error}</div> : null}

      <article className="card hero-card card-surface-soft reveal-up">
        <div className="hero-grid">
          <div className="hero-summary">
            <div>
              <span className="page-eyebrow">当前空间</span>
              <h2 className="section-heading">{BUSINESS_SPACE_NAME}</h2>
              <p className="page-lead">
                这里汇总知识内容、问答入口和模型配置状态，方便快速进入日常使用。
              </p>
            </div>
            <div className="metric-strip">
              <div className="metric-chip">
                <div>
                  <strong>{loading ? '...' : state.knowledgeCount}</strong>
                  <span>知识库</span>
                </div>
                <Database size={18} color="var(--accent-color)" />
              </div>
              <div className="metric-chip">
                <div>
                  <strong>{loading ? '...' : state.dialogCount}</strong>
                  <span>会话入口</span>
                </div>
                <MessageSquareText size={18} color="var(--accent-color)" />
              </div>
              <div className="metric-chip">
                <div>
                  <strong>{state.tenant?.llm_id ? '已配置' : '待配置'}</strong>
                  <span>聊天模型</span>
                </div>
                <Sparkles size={18} color="var(--accent-color)" />
              </div>
            </div>
          </div>

          <div className="action-list">
            <div className="action-item">
              <Workflow size={18} color="var(--accent-color)" />
              <div>
                <strong>内容处理</strong>
                <p>支持上传文档、解析内容并进行后续检索。</p>
              </div>
            </div>
            <div className="action-item">
              <MessageSquareText size={18} color="var(--accent-color)" />
              <div>
                <strong>问答入口</strong>
                <p>基于当前知识库进行问答，保留历史记录。</p>
              </div>
            </div>
            <div className="action-item">
              <Sparkles size={18} color="var(--accent-color)" />
              <div>
                <strong>模型配置</strong>
                <p>在设置页维护聊天与嵌入模型，保持服务可用。</p>
              </div>
            </div>
          </div>
        </div>
      </article>

      <div className="stats-grid">
        <article className="stat-card reveal-up" style={revealDelay('40ms')}>
          <div className="stat-card-top">
            <span className="stat-label">内容主题</span>
            <span className="stat-icon">
              <Database size={18} />
            </span>
          </div>
          <strong>示例知识库</strong>
          <small>用于承载当前演示内容。</small>
        </article>
        <article className="stat-card reveal-up" style={revealDelay('80ms')}>
          <div className="stat-card-top">
            <span className="stat-label">知识库数量</span>
            <span className="stat-icon">
              <Workflow size={18} />
            </span>
          </div>
          <strong>{loading ? '...' : state.knowledgeCount}</strong>
          <small>当前空间中已创建的内容集合。</small>
        </article>
        <article className="stat-card reveal-up" style={revealDelay('120ms')}>
          <div className="stat-card-top">
            <span className="stat-label">问答入口</span>
            <span className="stat-icon">
              <MessageSquareText size={18} />
            </span>
          </div>
          <strong>{loading ? '...' : state.dialogCount}</strong>
          <small>当前可用的对话入口数量。</small>
        </article>
        <article className="stat-card reveal-up" style={revealDelay('160ms')}>
          <div className="stat-card-top">
            <span className="stat-label">聊天模型</span>
            <span className="stat-icon">
              <Sparkles size={18} />
            </span>
          </div>
          <strong className="stat-strong-compact">
            {loading ? '...' : state.tenant?.llm_id || '尚未设置'}
          </strong>
          <small>当前空间使用的默认聊天模型。</small>
        </article>
      </div>

      <div className="card-grid">
        <article className="card reveal-up" style={revealDelay('120ms')}>
          <h2>常用功能</h2>
          <ul className="feature-list">
            <li>维护知识库与文档列表</li>
            <li>执行内容解析与召回配置</li>
            <li>围绕知识库进行检索问答</li>
            <li>快速创建示例知识库并导入示例文档</li>
            <li>查看当前模型和服务状态</li>
          </ul>
        </article>

        <article className="card reveal-up" style={revealDelay('180ms')}>
          <h2>服务信息</h2>
          <div className="inline-code">{API_BASE}</div>
          <p className="muted">
            当前后端服务访问入口，适用于接口联调和运行状态确认。
          </p>
        </article>
      </div>
    </section>
  );
}
