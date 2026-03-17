import {
  LoaderCircle,
  MessageSquareText,
  RefreshCcw,
  SendHorizontal,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { StatusBadge } from '../components/status-badge';
import {
  createConversationSeed,
  createDialog,
  fetchTenantInfo,
  getConversation,
  listConversations,
  listDialogs,
  listKnowledgeBases,
  streamConversation,
} from '../lib/ragflow';
import type {
  ChatMessage,
  Conversation,
  Dialog,
  KnowledgeBase,
  Reference,
  TenantInfo,
} from '../types/ragflow';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

function generateConversationId() {
  return crypto.randomUUID().replaceAll('-', '');
}

function revealDelay(delay: string) {
  return { '--delay': delay } as CSSProperties;
}

export function ChatPage() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [selectedDialogId, setSelectedDialogId] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const selectedDialog = useMemo(
    () => dialogs.find((item) => item.id === selectedDialogId) || null,
    [dialogs, selectedDialogId],
  );

  async function ensureSingleAssistant(
    kbList: KnowledgeBase[],
    tenantInfo: TenantInfo | null,
    existingDialogs: Dialog[],
  ) {
    if (existingDialogs.length > 0) {
      return existingDialogs;
    }

    const defaultKbIds = kbList.slice(0, 1).map((item) => item.id);
    if (!defaultKbIds.length) {
      return existingDialogs;
    }

    const created = await createDialog({
      name: '知识助手',
      kbIds: defaultKbIds,
      llmId: tenantInfo?.llm_id,
    });

    return created ? [created] : existingDialogs;
  }

  async function loadBootData(preferredDialogId?: string) {
    setLoading(true);
    setError('');

    try {
      const [tenantInfo, kbResult, dialogResult] = await Promise.all([
        fetchTenantInfo(),
        listKnowledgeBases({ pageSize: 100 }),
        listDialogs({ pageSize: 100 }),
      ]);

      const ensuredDialogs = await ensureSingleAssistant(
        kbResult.kbs,
        tenantInfo,
        dialogResult.dialogs,
      );

      setTenant(tenantInfo);
      setKnowledgeBases(kbResult.kbs);
      setDialogs(ensuredDialogs);

      const nextDialogId =
        preferredDialogId || selectedDialogId || ensuredDialogs[0]?.id || '';
      setSelectedDialogId(nextDialogId);

      if (!selectedKbIds.length) {
        setSelectedKbIds(
          ensuredDialogs[0]?.kb_ids || kbResult.kbs.slice(0, 1).map((item) => item.id),
        );
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '加载聊天页失败');
    } finally {
      setLoading(false);
    }
  }

  async function loadConversations(dialogId: string) {
    if (!dialogId) {
      setConversations([]);
      setSelectedConversationId('');
      setMessages([]);
      return;
    }

    try {
      const result = await listConversations(dialogId);
      setConversations(result);
      if (!result.length) {
        setSelectedConversationId('');
        setMessages([]);
        return;
      }

      const hasCurrentSelection = selectedConversationId
        ? result.some((item) => item.id === selectedConversationId)
        : false;

      if (!selectedConversationId || !hasCurrentSelection) {
        setSelectedConversationId(result[0].id);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '读取会话失败');
    }
  }

  async function loadConversationMessages(conversationId: string) {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    try {
      const result = await getConversation(conversationId);
      setMessages(result.message || []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '读取消息失败');
    }
  }

  useEffect(() => {
    loadBootData();
  }, []);

  useEffect(() => {
    if (selectedDialogId) {
      const dialog = dialogs.find((item) => item.id === selectedDialogId);
      if (dialog?.kb_ids?.length) {
        setSelectedKbIds(dialog.kb_ids);
      }
      loadConversations(selectedDialogId);
    }
  }, [selectedDialogId, dialogs]);

  useEffect(() => {
    if (selectedConversationId) {
      loadConversationMessages(selectedConversationId);
    }
  }, [selectedConversationId]);

  useEffect(() => {
    const target = scrollRef.current;
    if (!target) return;
    target.scrollTo({ top: target.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function handleSendMessage() {
    if (!selectedDialogId) {
      setError('当前无法发起对话');
      return;
    }
    if (!prompt.trim() || sending) return;

    setSending(true);
    setFeedback('');
    setError('');

    const nextAbortController = new AbortController();
    abortRef.current = nextAbortController;

    const question = prompt.trim();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
    };
    const assistantPlaceholderId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantPlaceholderId,
      role: 'assistant',
      content: '',
    };

    let nextConversationId = selectedConversationId;
    let baseMessages = [...messages];

    try {
      if (!nextConversationId) {
        nextConversationId = generateConversationId();
        const seed = await createConversationSeed(
          selectedDialogId,
          question,
          nextConversationId,
        );
        baseMessages = seed.message || [];
        setSelectedConversationId(nextConversationId);
      }

      setPrompt('');
      setMessages((current) => [...current, userMessage, assistantMessage]);

      let fullAnswer = '';
      let reference: Reference | undefined;

      await streamConversation(
        {
          conversation_id: nextConversationId,
          messages: [...baseMessages, userMessage],
          reasoning: false,
          internet: false,
        },
        {
          onMessage(chunk) {
            fullAnswer += chunk;
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantPlaceholderId
                  ? { ...item, content: fullAnswer, reference }
                  : item,
              ),
            );
          },
          onReference(nextReference) {
            reference = nextReference;
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantPlaceholderId
                  ? { ...item, content: fullAnswer, reference }
                  : item,
              ),
            );
          },
        },
        nextAbortController.signal,
      );

      await loadConversations(selectedDialogId);
      if (nextConversationId) {
        setSelectedConversationId(nextConversationId);
      }
    } catch (nextError) {
      if (nextError instanceof DOMException && nextError.name === 'AbortError') {
        return;
      }
      setError(nextError instanceof Error ? nextError.message : '发送消息失败');
      setMessages((current) => current.filter((item) => item.id !== assistantPlaceholderId));
      setPrompt(question);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="page page-enter page-wide">
      <header className="page-header">
        <div className="page-intro">
          <span className="page-eyebrow">问答中心</span>
          <h1 className="headline-with-icon">
            <MessageSquareText size={28} className="accent-icon" />
            对话
          </h1>
          <p className="page-lead">围绕当前知识库发起问答，查看历史会话并持续追问。</p>
        </div>
        <div className="toolbar page-actions">
          <button className="secondary-button" onClick={() => loadBootData(selectedDialogId)}>
            <RefreshCcw size={16} />
            <span>刷新</span>
          </button>
          <StatusBadge tone={selectedDialog ? 'success' : 'warning'}>
            {selectedDialog ? '可用' : '未就绪'}
          </StatusBadge>
        </div>
      </header>

      {feedback ? <div className="feedback feedback-success">{feedback}</div> : null}
      {error ? <div className="feedback feedback-error">{error}</div> : null}

      <div className="chat-layout">
        <aside className="card chat-side reveal-up">
          <div className="chat-summary-card reveal-up" style={revealDelay('60ms')}>
            <div className="chat-summary-grid">
              <div>
                <strong>{knowledgeBases.filter((item) => selectedKbIds.includes(item.id)).length}</strong>
                <span>关联知识库</span>
              </div>
              <div>
                <strong>{loading ? '...' : conversations.length}</strong>
                <span>历史会话</span>
              </div>
              <div>
                <strong>{tenant?.llm_id ? '已配置' : '待配置'}</strong>
                <span>模型状态</span>
              </div>
            </div>
          </div>

          <div className="section-title">
            <h2>历史记录</h2>
          </div>
          <div className="list-panel">
            <button
              className={!selectedConversationId ? 'list-item list-item-active' : 'list-item'}
              onClick={() => {
                setSelectedConversationId('');
                setMessages([]);
              }}
            >
              <div>
                <strong>新会话</strong>
                <small>开始一轮新的知识问答</small>
              </div>
            </button>
            {conversations.map((item, index) => (
              <button
                key={item.id}
                className={
                  item.id === selectedConversationId
                    ? 'list-item list-item-active reveal-right'
                    : 'list-item reveal-right'
                }
                style={revealDelay(`${index * 40}ms`)}
                onClick={() => setSelectedConversationId(item.id)}
              >
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.update_date || item.create_date || '未记录时间'}</small>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <article className="card chat-main reveal-up" style={revealDelay('100ms')}>
          <div className="section-title">
            <div>
              <h2>{selectedDialog?.name || '知识助手'}</h2>
              <p className="section-note">
                模型：{tenant?.llm_id || '未配置'} ·
                知识库：{selectedKbIds.length ? selectedKbIds.length : 0} 个
              </p>
            </div>
            <StatusBadge tone={sending ? 'warning' : 'success'}>
              {sending ? '正在回答' : '准备就绪'}
            </StatusBadge>
          </div>

          <div ref={scrollRef} className="message-board">
            {messages.map((item, index) => (
              <div
                key={item.id || `${item.role}-${index}`}
                className={item.role === 'user' ? 'message message-user' : 'message message-assistant'}
              >
                <div className={item.role === 'user' ? 'message-role message-role-user' : 'message-role'}>{item.role === 'user' ? '你' : '助手'}</div>
                <div className="message-content">
                  {item.role === 'assistant' && item.content === '' && sending && item.id === messages[messages.length - 1]?.id ? (
                    <div className="typing-indicator">
                      <div className="typing-dot"></div>
                      <div className="typing-dot"></div>
                      <div className="typing-dot"></div>
                    </div>
                  ) : (
                    <div className="markdown-body">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code(props) {
                            const { children, className, node, ref, ...rest } = props;
                            const match = /language-(\w+)/.exec(className || '');
                            return match ? (
                              <SyntaxHighlighter
                                {...rest}
                                PreTag="div"
                                children={String(children).replace(/\n$/, '')}
                                language={match[1]}
                                style={vscDarkPlus}
                              />
                            ) : (
                              <code {...rest} className={className}>
                                {children}
                              </code>
                            );
                          }
                        }}
                      >
                        {item.content || '...'}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
                {item.reference?.chunks?.length ? (
                  <div className="reference-box">
                    <strong>引用片段</strong>
                    {item.reference.chunks.slice(0, 3).map((chunk) => (
                      <div key={chunk.id} className="reference-item">
                        <span>{chunk.document_name}</span>
                        <small>相似度 {chunk.similarity ?? '-'}</small>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {!messages.length ? (
              <div className="empty-hint large-empty">
                这里会显示问答内容。直接输入问题即可开始一轮新的知识问答。
              </div>
            ) : null}
          </div>

          <div className="composer">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="请输入你的问题，比如：烤烟和晒烟在工艺上有什么不同？"
              rows={4}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  handleSendMessage();
                }
              }}
            />
            <div className="composer-footer">
              <span className="composer-note">按 <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> 快速发送，支持多行输入。</span>
              <div className="toolbar composer-actions">
                <div className="composer-action-slot">
                  {sending ? (
                    <button
                      className="secondary-button button-compact"
                      onClick={() => abortRef.current?.abort()}
                    >
                      停止回答
                    </button>
                  ) : null}
                </div>
                <button
                  className="primary-button button-compact"
                  onClick={handleSendMessage}
                  disabled={sending}
                >
                  {sending ? <LoaderCircle className="spin" size={16} /> : <SendHorizontal size={16} />}
                  <span>{sending ? '发送中...' : '发送消息'}</span>
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
