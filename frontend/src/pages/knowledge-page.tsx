import type { CSSProperties } from 'react';
import { Database, LoaderCircle, Plus, RefreshCcw, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StatusBadge } from '../components/status-badge';
import {
  createKnowledgeBase,
  createTobaccoKnowledgeBase,
  deleteKnowledgeBase,
  listDocuments,
  listKnowledgeBases,
  runDocuments,
  uploadDocuments,
} from '../lib/ragflow';
import type { DocumentInfo, KnowledgeBase } from '../types/ragflow';

export function KnowledgePage() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKbId, setSelectedKbId] = useState('');
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [newKnowledgeName, setNewKnowledgeName] = useState('');
  const [loading, setLoading] = useState(true);
  const [docLoading, setDocLoading] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const selectedKnowledgeBase = useMemo(
    () => knowledgeBases.find((item) => item.id === selectedKbId) || null,
    [knowledgeBases, selectedKbId],
  );
  const totalDocumentCount = useMemo(
    () => knowledgeBases.reduce((count, item) => count + (item.doc_num ?? 0), 0),
    [knowledgeBases],
  );
  const revealDelay = (delay: string) => ({ '--delay': delay } as CSSProperties);

  async function loadKnowledgeBases(preferredId?: string) {
    setLoading(true);
    setError('');

    try {
      const result = await listKnowledgeBases({ pageSize: 100 });
      setKnowledgeBases(result.kbs);
      const nextId = preferredId || selectedKbId || result.kbs[0]?.id || '';
      setSelectedKbId(nextId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '加载知识库失败');
    } finally {
      setLoading(false);
    }
  }

  async function loadDocuments(kbId: string) {
    if (!kbId) {
      setDocuments([]);
      return;
    }

    setDocLoading(true);
    setError('');

    try {
      const result = await listDocuments(kbId);
      setDocuments(result.docs);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '加载文档失败');
    } finally {
      setDocLoading(false);
    }
  }

  useEffect(() => {
    loadKnowledgeBases();
  }, []);

  useEffect(() => {
    if (selectedKbId) {
      loadDocuments(selectedKbId);
    }
  }, [selectedKbId]);

  async function handleCreateKnowledgeBase() {
    if (!newKnowledgeName.trim()) return;

    setBusyLabel('正在创建知识库...');
    setFeedback('');
    setError('');

    try {
      const created = await createKnowledgeBase(newKnowledgeName.trim());
      setNewKnowledgeName('');
      setFeedback(`知识库“${created.name}”已创建`);
      await loadKnowledgeBases(created.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '创建失败');
    } finally {
      setBusyLabel('');
    }
  }

  async function handleDeleteKnowledgeBase() {
    if (!selectedKnowledgeBase) return;
    const confirmed = window.confirm(`确认删除知识库“${selectedKnowledgeBase.name}”吗？`);
    if (!confirmed) return;

    setBusyLabel('正在删除知识库...');
    setFeedback('');
    setError('');

    try {
      await deleteKnowledgeBase(selectedKnowledgeBase.id);
      setFeedback(`已删除“${selectedKnowledgeBase.name}”`);
      setSelectedKbId('');
      await loadKnowledgeBases();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '删除失败');
    } finally {
      setBusyLabel('');
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (!selectedKbId || !fileList?.length) return;

    setBusyLabel('正在上传文档...');
    setFeedback('');
    setError('');

    try {
      await uploadDocuments(selectedKbId, Array.from(fileList));
      setFeedback(`已上传 ${fileList.length} 份文档`);
      await loadDocuments(selectedKbId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '上传失败');
    } finally {
      setBusyLabel('');
      if (uploadInputRef.current) {
        uploadInputRef.current.value = '';
      }
    }
  }

  async function handleRunAllDocuments() {
    if (!documents.length) return;

    setBusyLabel('正在触发解析...');
    setFeedback('');
    setError('');

    try {
      await runDocuments(documents.map((item) => item.id), 1);
      setFeedback(`已提交 ${documents.length} 份文档解析任务`);
      await loadDocuments(selectedKbId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '解析失败');
    } finally {
      setBusyLabel('');
    }
  }

  async function handleCreateTobacco() {
    setBusyLabel('正在创建示例知识库...');
    setFeedback('');
    setError('');

    try {
      const result = await createTobaccoKnowledgeBase();
      setFeedback(
        `“${result.kbName}”已就绪，上传 ${result.uploadedCount} 份文档，提交 ${result.parsedCount} 份解析任务`,
      );
      await loadKnowledgeBases(result.kbId);
      await loadDocuments(result.kbId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '示例知识库创建失败');
    } finally {
      setBusyLabel('');
    }
  }

  return (
    <section className="page page-enter">
      <header className="page-header">
        <div className="page-intro">
          <span className="page-eyebrow">内容中心</span>
          <h1 className="headline-with-icon">
            <Database size={28} className="accent-icon" />
            知识库
          </h1>
          <p className="page-lead">统一维护知识库、文档上传和解析任务，保持内容可检索、可问答。</p>
        </div>
        <div className="toolbar page-actions">
          <button className="secondary-button" onClick={() => loadKnowledgeBases(selectedKbId)}>
            <RefreshCcw size={16} />
            <span>刷新</span>
          </button>
          <button className="primary-button" onClick={handleCreateTobacco}>
            <Plus size={16} />
            <span>一键创建示例知识库</span>
          </button>
        </div>
      </header>

      {feedback ? <div className="feedback feedback-success">{feedback}</div> : null}
      {error ? <div className="feedback feedback-error">{error}</div> : null}

      <div className="workspace-banner reveal-up">
        <div>
          <strong>当前内容空间</strong>
          <p>
            {selectedKnowledgeBase?.name || '尚未选择知识库'}
            {selectedKnowledgeBase ? ' · 可继续上传文档或触发解析' : ' · 请先创建或选择一个知识库'}
          </p>
        </div>
        <div className="pill-row">
          <span className="soft-pill">{loading ? '...' : `${knowledgeBases.length} 个知识库`}</span>
          <span className="soft-pill">{loading ? '...' : `${totalDocumentCount} 份文档`}</span>
          <span className="soft-pill">{docLoading ? '读取中' : `${documents.length} 份当前文档`}</span>
        </div>
      </div>

      <div className="split-layout">
        <article className="card reveal-up" style={revealDelay('60ms')}>
          <div className="section-title">
            <div>
              <h2>知识库列表</h2>
              <p className="section-note">选择一个知识库后，可继续查看和维护对应文档。</p>
            </div>
            <StatusBadge tone="neutral">
              {loading ? '加载中' : `${knowledgeBases.length} 个`}
            </StatusBadge>
          </div>

          <div className="stack">
            <div className="inline-form">
              <input
                value={newKnowledgeName}
                onChange={(event) => setNewKnowledgeName(event.target.value)}
                placeholder="输入新的知识库名称"
              />
              <button className="primary-button" onClick={handleCreateKnowledgeBase}>
                <Plus size={16} />
                <span>创建</span>
              </button>
            </div>

            <div className="list-panel">
              {knowledgeBases.map((item, index) => (
                <button
                  key={item.id}
                  className={
                    item.id === selectedKbId
                      ? 'list-item list-item-active list-item-accent reveal-right'
                      : 'list-item list-item-accent reveal-right'
                  }
                  style={revealDelay(`${index * 50}ms`)}
                  onClick={() => setSelectedKbId(item.id)}
                >
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.update_date || item.create_date || '未记录时间'}</small>
                  </div>
                  <span>{item.doc_num ?? 0} 文档</span>
                </button>
              ))}
              {!knowledgeBases.length && !loading ? (
                <div className="empty-hint">还没有知识库，先创建一个吧。</div>
              ) : null}
            </div>

            <button
              className="ghost-button danger-button"
              onClick={handleDeleteKnowledgeBase}
              disabled={!selectedKnowledgeBase}
            >
              <Trash2 size={16} />
              <span>删除当前知识库</span>
            </button>
          </div>
        </article>

        <article className="card reveal-up" style={revealDelay('120ms')}>
          <div className="section-title">
            <div>
              <h2>{selectedKnowledgeBase?.name || '文档列表'}</h2>
              <p className="section-note">支持上传本地文件，并将内容提交到后端执行解析。</p>
            </div>
            <StatusBadge tone={documents.length ? 'success' : 'warning'}>
              {docLoading ? '读取中' : `${documents.length} 份文档`}
            </StatusBadge>
          </div>

          <div className="toolbar">
            <button
              className="secondary-button"
              onClick={() => uploadInputRef.current?.click()}
              disabled={!selectedKbId}
            >
              <Upload size={16} />
              <span>上传文档</span>
            </button>
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              hidden
              onChange={handleUpload}
            />
            <button
              className="primary-button"
              onClick={handleRunAllDocuments}
              disabled={!selectedKbId || !documents.length}
            >
              <LoaderCircle className={busyLabel ? 'spin' : ''} size={16} />
              <span>解析全部文档</span>
            </button>
          </div>

          {busyLabel ? <div className="feedback feedback-info">{busyLabel}</div> : null}

          <div className="table-like">
            <div className="table-row table-head">
              <span>名称</span>
              <span>类型</span>
              <span>状态</span>
              <span>Chunk</span>
              <span>更新时间</span>
            </div>
            {documents.map((item, index) => (
              <div
                key={item.id}
                className="table-row reveal-up"
                style={revealDelay(`${index * 40}ms`)}
              >
                <span className="table-cell-truncate" title={item.name}>{item.name}</span>
                <span>{item.suffix || item.type || '-'}</span>
                <span className="table-cell-truncate" title={item.progress_msg || item.run || '待处理'}>
                  {(item.progress_msg || item.run || '待处理').split('\n').filter(Boolean).pop() || '待处理'}
                </span>
                <span>{item.chunk_num ?? 0}</span>
                <span className="table-cell-truncate">{item.update_date || item.create_date || '-'}</span>
              </div>
            ))}
            {!documents.length && !docLoading ? (
              <div className="empty-hint">选择知识库后，这里会显示上传的文档。</div>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
}
