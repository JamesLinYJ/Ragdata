import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  PlugZap,
  RefreshCcw,
  Save,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { StatusBadge } from '../components/status-badge';
import {
  fetchLlmCatalog,
  fetchLlmFactories,
  fetchMyLlmsDetailed,
  fetchSystemConfig,
  fetchSystemStatus,
  fetchSystemVersion,
  fetchTenantInfo,
  saveFactoryApiKey,
  updateTenantInfo,
  verifyFactoryApiKey,
} from '../lib/ragflow';
import type {
  FactoryApiKeyPayload,
  LlmCatalog,
  LlmCatalogItem,
  LlmFactory,
  MyLlmDetailMap,
  TenantInfo,
} from '../types/ragflow';

type SettingsState = {
  tenant: TenantInfo | null;
  llmCatalog: LlmCatalog;
  llmFactories: LlmFactory[];
  myLlms: MyLlmDetailMap;
  systemVersion: Record<string, unknown> | null;
  systemStatus: Record<string, unknown> | null;
  systemConfig: Record<string, unknown> | null;
};

type ProviderForm = FactoryApiKeyPayload;
const BUSINESS_SPACE_NAME = '知识工作空间';
const revealDelay = (delay: string) => ({ '--delay': delay } as CSSProperties);
const CURATED_MODEL_PRESETS = {
  Gemini: {
    chat: [
      { value: 'gemini-2.5-flash@Gemini', label: 'gemini-2.5-flash · Gemini（推荐）' },
      { value: 'gemini-2.5-pro@Gemini', label: 'gemini-2.5-pro · Gemini（高质量）' },
      {
        value: 'gemini-2.5-flash-lite@Gemini',
        label: 'gemini-2.5-flash-lite · Gemini（轻量）',
      },
      {
        value: 'gemini-3-pro-preview@Gemini',
        label: 'gemini-3-pro-preview · Gemini（预览）',
      },
      {
        value: 'gemini-3-flash-preview@Gemini',
        label: 'gemini-3-flash-preview · Gemini（预览）',
      },
    ],
    embedding: [
      {
        value: 'gemini-embedding-001@Gemini',
        label: 'gemini-embedding-001 · Gemini（推荐）',
      },
    ],
    image2text: [
      { value: 'gemini-2.5-flash@Gemini', label: 'gemini-2.5-flash · Gemini（推荐）' },
      { value: 'gemini-2.5-pro@Gemini', label: 'gemini-2.5-pro · Gemini（高质量）' },
      {
        value: 'gemini-3-pro-preview@Gemini',
        label: 'gemini-3-pro-preview · Gemini（预览）',
      },
      {
        value: 'gemini-3-flash-preview@Gemini',
        label: 'gemini-3-flash-preview · Gemini（预览）',
      },
    ],
  },
} as const;

type ModelOption = {
  factory: string;
  label: string;
  value: string;
  available: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown, fallback = '') {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean);
  }
  if (typeof value === 'string') {
    return normalizeTags(value);
  }
  return [];
}

function normalizeTags(tags?: string | string[]) {
  if (Array.isArray(tags)) return tags;
  if (!tags) return [];
  return String(tags)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasTag(item: LlmCatalogItem, tag: string) {
  return normalizeTags(item.tags)
    .map((value) => value.toUpperCase())
    .includes(tag.toUpperCase());
}

function itemSupportsType(item: LlmCatalogItem, type: string) {
  const modelTypes = Array.isArray(item.model_type)
    ? item.model_type
    : [String(item.model_type)];

  if (modelTypes.includes(type) || modelTypes.some((value) => value.includes(type))) {
    return true;
  }

  if (type === 'chat') {
    return hasTag(item, 'CHAT');
  }

  if (type === 'embedding') {
    return hasTag(item, 'TEXT EMBEDDING');
  }

  if (type === 'image2text') {
    return hasTag(item, 'IMAGE2TEXT');
  }

  if (type === 'speech2text') {
    return hasTag(item, 'SPEECH2TEXT');
  }

  return false;
}

function normalizeFactory(factory: unknown): LlmFactory {
  const source = asRecord(factory);
  return {
    name: asString(source.name),
    tags: asStringArray(source.tags),
    model_types: asStringArray(source.model_types),
    logo: asString(source.logo),
    rank: typeof source.rank === 'number' ? source.rank : undefined,
    status: asString(source.status),
  };
}

function normalizeMyLlms(value: unknown): MyLlmDetailMap {
  const source = asRecord(value);
  return Object.fromEntries(
    Object.entries(source).map(([factoryName, entry]) => {
      const record = asRecord(entry);
      const llmList = Array.isArray(record.llm)
        ? record.llm.map((item) => {
            const llm = asRecord(item);
            return {
              id: asString(llm.id),
              type: asString(llm.type),
              name: asString(llm.name),
              used_token:
                typeof llm.used_token === 'number' ? llm.used_token : undefined,
              api_base: asString(llm.api_base),
              max_tokens:
                typeof llm.max_tokens === 'number' ? llm.max_tokens : undefined,
              status: asString(llm.status),
            };
          })
        : [];

      return [
        factoryName,
        {
          tags: asStringArray(record.tags),
          llm: llmList,
        },
      ];
    }),
  );
}

function normalizeLlmCatalog(value: unknown): LlmCatalog {
  const source = asRecord(value);
  return Object.fromEntries(
    Object.entries(source).map(([factoryName, items]) => [
      factoryName,
      Array.isArray(items)
        ? items.map((item) => {
            const record = asRecord(item);
            return {
              id: asString(record.id) || null,
              llm_name: asString(record.llm_name),
              model_type: Array.isArray(record.model_type)
                ? record.model_type.map((type) => asString(type))
                : asString(record.model_type),
              fid: asString(record.fid) || factoryName,
              available:
                typeof record.available === 'boolean' ? record.available : undefined,
              status: asString(record.status),
              tags: asStringArray(record.tags),
            };
          })
        : [],
    ]),
  );
}

function flattenCatalogByType(catalog: LlmCatalog, type: string) {
  const seen = new Set<string>();
  const options: ModelOption[] = [];

  Object.entries(catalog).forEach(([factory, items]) => {
    items
      .filter((item) => itemSupportsType(item, type))
      .forEach((item) => {
        const value = `${item.llm_name}@${item.fid || factory}`;
        if (seen.has(value)) {
          return;
        }
        seen.add(value);
        options.push({
          factory,
          label: `${item.llm_name} · ${factory}${item.available === false ? '（不可用）' : ''}`,
          value,
          available: item.available !== false,
        });
      });
  });

  return options;
}

function mergeCuratedOptions(
  options: ModelOption[],
  curated: ReadonlyArray<{ value: string; label: string }> = [],
) {
  const seen = new Set(options.map((item) => item.value));
  const merged = [...options];

  curated.forEach((item) => {
    if (seen.has(item.value)) {
      return;
    }

    merged.push({
      factory: item.value.split('@').at(1) || 'Preset',
      label: item.label,
      value: item.value,
      available: true,
    });
  });

  return merged;
}

function findModelLabel(options: ModelOption[], value: string) {
  return options.find((item) => item.value === value)?.label || value;
}

function getFactoryFromModelValue(value: string) {
  return value.split('@').at(1) || '';
}

function normalizeModelValue(value: string) {
  const replacements: Record<string, string> = {
    'gemini-3-flash@Gemini': 'gemini-3-flash-preview@Gemini',
    'gemini-3.1-pro-preview@Gemini': 'gemini-3-pro-preview@Gemini',
    'gemini-3.1-flash-lite-preview@Gemini': 'gemini-2.5-flash-lite@Gemini',
    'gemini-embedding-2-preview@Gemini': 'gemini-embedding-001@Gemini',
  };

  return replacements[value] || value;
}

function formatModelType(type: string) {
  const mapping: Record<string, string> = {
    chat: '聊天',
    embedding: '嵌入',
    rerank: '重排',
    image2text: '图像理解',
    speech2text: '语音识别',
    tts: '语音合成',
    ocr: 'OCR',
  };

  return mapping[type] || type;
}

export function SettingsPage() {
  const [state, setState] = useState<SettingsState>({
    tenant: null,
    llmCatalog: {},
    llmFactories: [],
    myLlms: {},
    systemVersion: null,
    systemStatus: null,
    systemConfig: null,
  });
  const [form, setForm] = useState({
    llm_id: '',
    embd_id: '',
    img2txt_id: '',
    asr_id: '',
  });
  const [providerForm, setProviderForm] = useState<ProviderForm>({
    llm_factory: '',
    api_key: '',
    base_url: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerVerifying, setProviderVerifying] = useState(false);
  const [showAllFactories, setShowAllFactories] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  async function loadSettings() {
    setLoading(true);
    setError('');

    try {
      const [
        tenant,
        llmCatalog,
        llmFactories,
        myLlms,
        systemVersion,
        systemStatus,
        systemConfig,
      ] = await Promise.all([
        fetchTenantInfo(),
        fetchLlmCatalog(),
        fetchLlmFactories(),
        fetchMyLlmsDetailed(),
        fetchSystemVersion(),
        fetchSystemStatus(),
        fetchSystemConfig(),
      ]);

      setState({
        tenant,
        llmCatalog: normalizeLlmCatalog(llmCatalog),
        llmFactories: llmFactories.map(normalizeFactory).filter((item) => item.name),
        myLlms: normalizeMyLlms(myLlms),
        systemVersion: asRecord(systemVersion),
        systemStatus: asRecord(systemStatus),
        systemConfig: asRecord(systemConfig),
      });
      setForm({
        llm_id: normalizeModelValue(tenant.llm_id || ''),
        embd_id: normalizeModelValue(tenant.embd_id || ''),
        img2txt_id: normalizeModelValue(tenant.img2txt_id || ''),
        asr_id: normalizeModelValue(tenant.asr_id || ''),
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '加载配置失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  const connectedFactories = useMemo(() => Object.keys(state.myLlms), [state.myLlms]);

  useEffect(() => {
    if (providerForm.llm_factory || !state.llmFactories.length) {
      return;
    }

    const preferredFactory =
      connectedFactories.find((factory) =>
        state.llmFactories.some((item) => item.name === factory),
      ) ||
      state.llmFactories.find((item) => item.name === 'Gemini')?.name ||
      state.llmFactories[0]?.name;

    if (!preferredFactory) {
      return;
    }

    setProviderForm((current) => ({
      ...current,
      llm_factory: preferredFactory,
    }));
  }, [connectedFactories, providerForm.llm_factory, state.llmFactories]);

  const selectedFactory = useMemo(
    () =>
      state.llmFactories.find((item) => item.name === providerForm.llm_factory) || null,
    [providerForm.llm_factory, state.llmFactories],
  );
  const connectedFactorySet = useMemo(() => new Set(connectedFactories), [connectedFactories]);
  const isSelectedFactoryConnected = selectedFactory
    ? connectedFactorySet.has(selectedFactory.name)
    : false;
  const chatOptions = useMemo(
    () =>
      mergeCuratedOptions(
        flattenCatalogByType(state.llmCatalog, 'chat'),
        providerForm.llm_factory === 'Gemini' && isSelectedFactoryConnected
          ? CURATED_MODEL_PRESETS.Gemini.chat
          : [],
      ),
    [isSelectedFactoryConnected, providerForm.llm_factory, state.llmCatalog],
  );
  const embeddingOptions = useMemo(
    () =>
      mergeCuratedOptions(
        flattenCatalogByType(state.llmCatalog, 'embedding'),
        providerForm.llm_factory === 'Gemini' && isSelectedFactoryConnected
          ? CURATED_MODEL_PRESETS.Gemini.embedding
          : [],
      ),
    [isSelectedFactoryConnected, providerForm.llm_factory, state.llmCatalog],
  );
  const imageOptions = useMemo(
    () =>
      mergeCuratedOptions(
        flattenCatalogByType(state.llmCatalog, 'image2text'),
        providerForm.llm_factory === 'Gemini' && isSelectedFactoryConnected
          ? CURATED_MODEL_PRESETS.Gemini.image2text
          : [],
      ),
    [isSelectedFactoryConnected, providerForm.llm_factory, state.llmCatalog],
  );
  const asrOptions = useMemo(
    () => flattenCatalogByType(state.llmCatalog, 'speech2text'),
    [state.llmCatalog],
  );
  const visibleFactories = useMemo(
    () => (showAllFactories ? state.llmFactories : state.llmFactories.slice(0, 12)),
    [showAllFactories, state.llmFactories],
  );
  const recommendedChat = useMemo(
    () => chatOptions.find((item) => item.available)?.value || '',
    [chatOptions],
  );
  const recommendedEmbedding = useMemo(
    () => embeddingOptions.find((item) => item.available)?.value || '',
    [embeddingOptions],
  );
  const recommendedImage = useMemo(
    () => imageOptions.find((item) => item.available)?.value || '',
    [imageOptions],
  );
  const recommendedAsr = useMemo(
    () => asrOptions.find((item) => item.available)?.value || '',
    [asrOptions],
  );
  const readiness = {
    llm: Boolean(form.llm_id),
    embd: Boolean(form.embd_id),
    img2txt: Boolean(form.img2txt_id),
    asr: Boolean(form.asr_id),
  };
  const selectedModelCount = [form.llm_id, form.embd_id, form.img2txt_id, form.asr_id].filter(
    Boolean,
  ).length;
  const baseUrlPlaceholder = useMemo(() => {
    const factoryName = selectedFactory?.name;
    if (factoryName === 'Ollama') return 'http://127.0.0.1:11434/v1';
    if (factoryName === 'OpenAI-API-Compatible') {
      return 'https://your-endpoint.example.com/v1';
    }
    if (factoryName === 'Azure-OpenAI') {
      return 'https://your-resource.openai.azure.com/openai/deployments/...';
    }
    return '非官方地址时再填写，可留空';
  }, [selectedFactory]);
  const featuredModelGroups = useMemo(() => {
    if (providerForm.llm_factory !== 'Gemini') {
      return [];
    }

    return [
      {
        title: '聊天模型',
        hint: '适合默认问答和对话体验',
        items: CURATED_MODEL_PRESETS.Gemini.chat.slice(0, 4).map((item) => ({
          ...item,
          available: isSelectedFactoryConnected,
        })),
        onPick: (value: string) =>
          setForm((current) => ({
            ...current,
            llm_id: value,
          })),
      },
      {
        title: '嵌入模型',
        hint: '决定检索与知识库召回效果',
        items: CURATED_MODEL_PRESETS.Gemini.embedding.slice(0, 3).map((item) => ({
          ...item,
          available: isSelectedFactoryConnected,
        })),
        onPick: (value: string) =>
          setForm((current) => ({
            ...current,
            embd_id: value,
          })),
      },
      {
        title: '图像理解',
        hint: '适合图片、图表和混合文档',
        items: CURATED_MODEL_PRESETS.Gemini.image2text.slice(0, 3).map((item) => ({
          ...item,
          available: isSelectedFactoryConnected,
        })),
        onPick: (value: string) =>
          setForm((current) => ({
            ...current,
            img2txt_id: value,
          })),
      },
    ].filter((group) => group.items.length);
  }, [isSelectedFactoryConnected, providerForm.llm_factory]);

  async function handleSave() {
    if (!state.tenant?.tenant_id) {
      setError('当前无法保存设置');
      return;
    }

    setSaving(true);
    setFeedback('');
    setError('');

    try {
      const requiredFactories = [
        getFactoryFromModelValue(form.llm_id),
        getFactoryFromModelValue(form.embd_id),
        getFactoryFromModelValue(form.img2txt_id),
        getFactoryFromModelValue(form.asr_id),
      ].filter(Boolean);

      const unauthorizedFactory = requiredFactories.find(
        (factory) => !connectedFactorySet.has(factory),
      );

      if (unauthorizedFactory) {
        throw new Error(`请先完成 ${unauthorizedFactory} 的连接保存，再将它设为默认模型`);
      }

      await updateTenantInfo({
        tenant_id: state.tenant.tenant_id,
        name: state.tenant.name,
        llm_id: normalizeModelValue(form.llm_id),
        embd_id: normalizeModelValue(form.embd_id),
        img2txt_id: normalizeModelValue(form.img2txt_id),
        asr_id: normalizeModelValue(form.asr_id),
      });
      setFeedback('设置已保存');
      await loadSettings();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '保存配置失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleProviderAction(mode: 'verify' | 'save') {
    if (!providerForm.llm_factory || !providerForm.api_key.trim()) {
      setError('先选择供应商并填写 API Key');
      return;
    }

    setFeedback('');
    setError('');

    if (mode === 'verify') {
      setProviderVerifying(true);
    } else {
      setProviderSaving(true);
    }

    try {
      if (mode === 'verify') {
        const result = await verifyFactoryApiKey({
          ...providerForm,
          api_key: providerForm.api_key.trim(),
          base_url: providerForm.base_url?.trim(),
        });

        if (!result.success) {
          throw new Error(result.message || '验证失败，请检查 API Key 或 Base URL');
        }

        setFeedback('连接验证通过');
        return;
      }

      await saveFactoryApiKey({
        ...providerForm,
        api_key: providerForm.api_key.trim(),
        base_url: providerForm.base_url?.trim(),
      });
      setFeedback('设置已更新');
      setProviderForm((current) => ({
        ...current,
        api_key: '',
      }));
      await loadSettings();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '保存失败');
    } finally {
      setProviderVerifying(false);
      setProviderSaving(false);
    }
  }

  function handleApplyRecommended() {
    if (!recommendedChat && !recommendedEmbedding) {
      setError('当前没有可用选项');
      return;
    }

    setError('');
    setFeedback('已填入可用选项');
    setForm((current) => ({
      llm_id: current.llm_id || recommendedChat,
      embd_id: current.embd_id || recommendedEmbedding,
      img2txt_id: current.img2txt_id || recommendedImage,
      asr_id: current.asr_id || recommendedAsr,
    }));
  }

  return (
    <section className="page page-enter">
      <header className="page-header">
        <div className="page-intro">
          <span className="page-eyebrow">配置中心</span>
          <h1 className="headline-with-icon">
            <Settings size={28} className="accent-icon" />
            设置
          </h1>
          <p className="page-lead">管理当前空间的连接来源、默认模型和运行状态。</p>
        </div>
        <div className="toolbar page-actions">
          <button className="secondary-button" onClick={loadSettings}>
            <RefreshCcw size={16} />
            <span>刷新</span>
          </button>
          <StatusBadge tone={loading ? 'warning' : 'success'}>
            {loading ? '加载中' : '配置页就绪'}
          </StatusBadge>
        </div>
      </header>

      {feedback ? <div className="feedback feedback-success">{feedback}</div> : null}
      {error ? <div className="feedback feedback-error">{error}</div> : null}

      <div className="settings-banner reveal-up">
        <div className="settings-banner-main">
          <div>
            <span className="page-eyebrow">当前空间</span>
            <h2 className="section-heading">{BUSINESS_SPACE_NAME}</h2>
            <p className="page-lead">
              这里统一维护来源连接、默认模型和当前空间的生效状态。
            </p>
          </div>
          <div className="info-grid">
            <div className="info-chip">
              <strong>{form.llm_id || '未选择'}</strong>
              <span>默认聊天模型</span>
            </div>
            <div className="info-chip">
              <strong>{form.embd_id || '未选择'}</strong>
              <span>默认嵌入模型</span>
            </div>
            <div className="info-chip">
              <strong>{connectedFactories.length}</strong>
              <span>已连接来源</span>
            </div>
          </div>
        </div>
        <div className="settings-banner-side">
          <div className="pill-row">
            <span className="soft-pill">{selectedModelCount} 项已选择</span>
            <span className="soft-pill">{state.llmFactories.length} 个候选来源</span>
          </div>
          <div className="provider-summary">
            <small className="muted">
              当前默认来源：{providerForm.llm_factory || '尚未选择'}
            </small>
            <small className="muted">
              {readiness.llm && readiness.embd
                ? '核心模型已经就绪，可以直接用于知识库解析和问答。'
                : '先完成来源连接并选择聊天与嵌入模型，当前空间才能完整运行。'}
            </small>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <article className="stat-card reveal-up" style={revealDelay('40ms')}>
          <div className="stat-card-top">
            <span className="stat-label">系统版本</span>
            <span className="stat-icon">
              <Settings size={18} />
            </span>
          </div>
          <strong>{String(state.systemVersion?.version || '-')}</strong>
          <small>当前版本信息</small>
        </article>
        <article className="stat-card reveal-up" style={revealDelay('80ms')}>
          <div className="stat-card-top">
            <span className="stat-label">当前空间</span>
            <span className="stat-icon">
              <Sparkles size={18} />
            </span>
          </div>
          <strong className="stat-strong-compact">{BUSINESS_SPACE_NAME}</strong>
          <small>{state.tenant?.tenant_id || '-'}</small>
        </article>
        <article className="stat-card reveal-up" style={revealDelay('120ms')}>
          <div className="stat-card-top">
            <span className="stat-label">可用来源</span>
            <span className="stat-icon">
              <PlugZap size={18} />
            </span>
          </div>
          <strong>{connectedFactories.length}</strong>
          <small>当前已配置数量</small>
        </article>
        <article className="stat-card reveal-up" style={revealDelay('160ms')}>
          <div className="stat-card-top">
            <span className="stat-label">系统状态</span>
            <span className="stat-icon">
              <CheckCircle2 size={18} />
            </span>
          </div>
          <strong>
            {String(
              (state.systemConfig?.register_enabled ??
                state.systemConfig?.registerEnabled ??
                '-') as string | number,
            )}
          </strong>
          <small>当前状态信息</small>
        </article>
      </div>

      <div className="card-grid">
        <article className="card surface-accent reveal-up" style={revealDelay('80ms')}>
          <div className="section-title">
            <div>
              <h2>连接设置</h2>
              <p className="muted">维护当前可用的连接来源。</p>
            </div>
            <StatusBadge tone={connectedFactories.length ? 'success' : 'warning'}>
              {connectedFactories.length ? '已配置' : '未配置'}
            </StatusBadge>
          </div>

          <div className="stack">
            <label className="field">
              <span>来源</span>
              <select
                className="native-select"
                value={providerForm.llm_factory}
                onChange={(event) =>
                  setProviderForm((current) => ({
                    ...current,
                    llm_factory: event.target.value,
                  }))
                }
              >
                <option value="">请选择</option>
                {state.llmFactories.map((factory) => (
                  <option key={factory.name} value={factory.name}>
                    {factory.name}
                    {connectedFactories.includes(factory.name) ? '（已连接）' : ''}
                  </option>
                ))}
              </select>
            </label>

            {selectedFactory ? (
              <div className="provider-summary">
                <div className="tag-row">
                  {selectedFactory.model_types?.map((type) => (
                    <span key={type} className="tag-pill">
                      {formatModelType(type)}
                    </span>
                  ))}
                </div>
                <small className="muted">
                  {connectedFactories.includes(selectedFactory.name)
                    ? '当前来源已配置，可以直接设为默认模型。'
                    : '当前只是候选来源，先验证并保存连接后才能设为默认模型。'}
                </small>
                {selectedFactory.name === 'Gemini' ? (
                  <small className="muted">
                    当前推荐优先使用 `gemini-2.5-flash`、`gemini-2.5-pro`、
                    `gemini-2.5-flash-lite` 和 `gemini-embedding-001`；
                    `Gemini 3` 仅保留为预览候选。
                  </small>
                ) : null}
              </div>
            ) : null}

            <label className="field">
              <span>API Key</span>
              <div className="field-input">
                <KeyRound size={16} />
                <input
                  type="password"
                  placeholder="请输入"
                  value={providerForm.api_key}
                  onChange={(event) =>
                    setProviderForm((current) => ({
                      ...current,
                      api_key: event.target.value,
                    }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Base URL（可选）</span>
              <input
                placeholder={baseUrlPlaceholder}
                value={providerForm.base_url || ''}
                onChange={(event) =>
                  setProviderForm((current) => ({
                    ...current,
                    base_url: event.target.value,
                  }))
                }
              />
            </label>

            <div className="toolbar toolbar-wrap">
              <button
                className="secondary-button"
                onClick={() => handleProviderAction('verify')}
                disabled={providerSaving || providerVerifying}
              >
                {providerVerifying ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                <span>{providerVerifying ? '验证中...' : '验证连接'}</span>
              </button>
              <button
                className="primary-button"
                onClick={() => handleProviderAction('save')}
                disabled={providerSaving || providerVerifying}
              >
                {providerSaving ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <PlugZap size={16} />
                )}
                <span>{providerSaving ? '保存中...' : '保存连接'}</span>
              </button>
            </div>
          </div>
        </article>

        <article className="card reveal-up" style={revealDelay('120ms')}>
          <div className="section-title">
            <div>
              <h2>状态检查</h2>
              <p className="muted">查看当前关键选项的配置情况。</p>
            </div>
            <StatusBadge tone={readiness.llm && readiness.embd ? 'success' : 'warning'}>
              {readiness.llm && readiness.embd ? '已完成' : '待完善'}
            </StatusBadge>
          </div>

          <div className="readiness-list">
            <div className="readiness-item">
              <div>
                <strong>聊天模型</strong>
                <small>{form.llm_id || '尚未选择'}</small>
              </div>
              <StatusBadge tone={readiness.llm ? 'success' : 'warning'}>
                {readiness.llm ? '已就绪' : '必选'}
              </StatusBadge>
            </div>
            <div className="readiness-item">
              <div>
                <strong>嵌入模型</strong>
                <small>{form.embd_id || '尚未选择'}</small>
              </div>
              <StatusBadge tone={readiness.embd ? 'success' : 'warning'}>
                {readiness.embd ? '已就绪' : '必选'}
              </StatusBadge>
            </div>
            <div className="readiness-item">
              <div>
                <strong>图片理解</strong>
                <small>{form.img2txt_id || '可选'}</small>
              </div>
              <StatusBadge tone={readiness.img2txt ? 'success' : 'neutral'}>
                {readiness.img2txt ? '已配置' : '可选'}
              </StatusBadge>
            </div>
            <div className="readiness-item">
              <div>
                <strong>语音识别</strong>
                <small>{form.asr_id || '可选'}</small>
              </div>
              <StatusBadge tone={readiness.asr ? 'success' : 'neutral'}>
                {readiness.asr ? '已配置' : '可选'}
              </StatusBadge>
            </div>
          </div>

          <div className="toolbar toolbar-wrap">
            <button className="ghost-button" onClick={handleApplyRecommended}>
              <Sparkles size={16} />
              <span>填入推荐模型</span>
            </button>
            <button className="primary-button" onClick={handleSave} disabled={saving}>
              {saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
              <span>{saving ? '保存中...' : '保存模型配置'}</span>
            </button>
          </div>
        </article>
      </div>

      <div className="card-grid">
        <article className="card reveal-up" style={revealDelay('120ms')}>
          <div className="section-title">
            <div>
              <h2>默认模型配置</h2>
              <p className="muted">这里决定知识库解析、聊天和多模态功能走哪几个模型。</p>
            </div>
            <StatusBadge tone={form.llm_id && form.embd_id ? 'success' : 'warning'}>
              {form.llm_id && form.embd_id ? '核心模型已选' : '仍缺核心模型'}
            </StatusBadge>
          </div>

          <div className="stack">
            {featuredModelGroups.length ? (
              <div className="model-curation">
                <div className="model-curation-head">
                  <div>
                    <strong>Gemini 精选组合</strong>
                    <small>稳定版和新预览版都可以直接套用。</small>
                  </div>
                  <span className="tag-pill">自由切换</span>
                </div>

                <div className="model-curation-grid">
                  {featuredModelGroups.map((group) => (
                    <section key={group.title} className="model-curation-card">
                      <div className="model-curation-title">
                        <strong>{group.title}</strong>
                        <small>{group.hint}</small>
                      </div>
                      <div className="model-chip-list">
                        {group.items.map((item) => (
                          <button
                            key={item.value}
                            type="button"
                            className={`model-chip ${item.available ? '' : 'model-chip-disabled'}`}
                            onClick={() => {
                              if (!item.available) {
                                setError('先在上方完成 Gemini 连接保存，再选择这些模型');
                                return;
                              }
                              setError('');
                              group.onPick(item.value);
                            }}
                          >
                            <span>{item.label.replace(' · Gemini', '')}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
                {!isSelectedFactoryConnected ? (
                  <small className="muted">
                    这些是可选的 Gemini 新模型，完成连接保存后才会进入可用列表。
                  </small>
                ) : null}
              </div>
            ) : null}

            <label className="field">
              <span>默认聊天模型</span>
              <select
                value={form.llm_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, llm_id: event.target.value }))
                }
                className="native-select"
              >
                <option value="">请选择聊天模型</option>
                {chatOptions.map((item) => (
                  <option key={`${item.factory}-${item.value}`} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>默认嵌入模型</span>
              <select
                value={form.embd_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, embd_id: event.target.value }))
                }
                className="native-select"
              >
                <option value="">请选择嵌入模型</option>
                {embeddingOptions.map((item) => (
                  <option key={`${item.factory}-${item.value}`} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>图片理解模型</span>
              <select
                value={form.img2txt_id}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    img2txt_id: event.target.value,
                  }))
                }
                className="native-select"
              >
                <option value="">未配置</option>
                {imageOptions.map((item) => (
                  <option key={`${item.factory}-${item.value}`} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>语音识别模型</span>
              <select
                value={form.asr_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, asr_id: event.target.value }))
                }
                className="native-select"
              >
                <option value="">未配置</option>
                {asrOptions.map((item) => (
                  <option key={`${item.factory}-${item.value}`} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </article>

        <article className="card reveal-up" style={revealDelay('180ms')}>
          <div className="section-title">
            <div>
              <h2>当前组合</h2>
              <p className="muted">这里展示当前已经生效的关键模型。</p>
            </div>
            <AlertTriangle size={18} />
          </div>

          <div className="selection-summary">
            <div className="selection-summary-item">
              <span>聊天</span>
              <strong>{form.llm_id ? findModelLabel(chatOptions, form.llm_id) : '尚未选择'}</strong>
            </div>
            <div className="selection-summary-item">
              <span>嵌入</span>
              <strong>
                {form.embd_id ? findModelLabel(embeddingOptions, form.embd_id) : '尚未选择'}
              </strong>
            </div>
            <div className="selection-summary-item">
              <span>图像理解</span>
              <strong>
                {form.img2txt_id
                  ? findModelLabel(imageOptions, form.img2txt_id)
                  : '未配置'}
              </strong>
            </div>
            <div className="selection-summary-item">
              <span>语音识别</span>
              <strong>{form.asr_id ? findModelLabel(asrOptions, form.asr_id) : '未配置'}</strong>
            </div>
          </div>

          <ul className="feature-list">
            <li>嵌入模型决定文档解析和检索效果。</li>
            <li>聊天模型决定回答质量和对话风格。</li>
            <li>连接保存后，再保存默认模型配置即可生效。</li>
            <li>更新后回到知识库页重新解析文档即可使用新模型。</li>
          </ul>
        </article>
      </div>

      <div className="card-grid">
        <article className="card">
          <div className="section-title">
            <div>
              <h2>来源列表</h2>
              <p className="muted">选择一个来源以查看和编辑。</p>
            </div>
            <StatusBadge tone={state.llmFactories.length ? 'success' : 'neutral'}>
              {`${state.llmFactories.length} 个候选供应商`}
            </StatusBadge>
          </div>

          <div className="provider-grid">
            {visibleFactories.map((factory, index) => {
              const isConnected = connectedFactories.includes(factory.name);
              const isSelected = providerForm.llm_factory === factory.name;
              const tags = normalizeTags(factory.tags);

              return (
                <button
                  key={factory.name}
                  className={`provider-card reveal-up ${isSelected ? 'provider-card-active' : ''}`}
                  style={revealDelay(`${index * 30}ms`)}
                  onClick={() =>
                    setProviderForm((current) => ({
                      ...current,
                      llm_factory: factory.name,
                    }))
                  }
                >
                  <div className="provider-card-head">
                    <strong>{factory.name}</strong>
                    <StatusBadge tone={isConnected ? 'success' : 'neutral'}>
                      {isConnected ? '已连接' : '未连接'}
                    </StatusBadge>
                  </div>
                  <div className="tag-row">
                    {factory.model_types?.slice(0, 4).map((type) => (
                      <span key={type} className="tag-pill">
                        {formatModelType(type)}
                      </span>
                    ))}
                  </div>
                  {tags.length ? (
                    <small className="muted">{tags.join(' · ')}</small>
                  ) : (
                    <small className="muted">可用于当前空间</small>
                  )}
                </button>
              );
            })}
          </div>

          {state.llmFactories.length > 12 ? (
            <div className="toolbar toolbar-wrap">
              <button
                className="ghost-button"
                onClick={() => setShowAllFactories((current) => !current)}
              >
                <span>{showAllFactories ? '收起供应商列表' : '展开全部供应商'}</span>
              </button>
            </div>
          ) : null}
        </article>

        <article className="card reveal-up" style={revealDelay('220ms')}>
          <h2>已配置项</h2>
          <div className="list-panel settings-panel">
            {Object.entries(state.myLlms).map(([factory, value]) => (
              <div key={factory} className="list-item static-item">
                <div>
                  <strong>{factory}</strong>
                  <small>
                    {value.llm.length} 个模型 ·{' '}
                    {value.llm.map((item) => item.name).join('、') || '暂未返回模型名'}
                  </small>
                </div>
                <span>{normalizeTags(value.tags).join(', ') || '无标签'}</span>
              </div>
            ))}
            {!Object.keys(state.myLlms).length && !loading ? (
              <div className="empty-hint">
                当前暂无可用项。
              </div>
            ) : null}
          </div>
        </article>
      </div>

      <div className="card-grid">
        <article className="card">
          <div className="section-title">
            <div>
              <h2>诊断信息</h2>
              <p className="muted">用于查看当前状态详情。</p>
            </div>
            <button
              className="ghost-button"
              onClick={() => setShowDiagnostics((current) => !current)}
            >
              <span>{showDiagnostics ? '收起' : '展开'}</span>
            </button>
          </div>

          {showDiagnostics ? (
            <pre className="json-box">
              {JSON.stringify(
                {
                  systemStatus: state.systemStatus,
                  systemConfig: state.systemConfig,
                },
                null,
                2,
              )}
            </pre>
          ) : (
            <div className="empty-hint">当前未展开。</div>
          )}
        </article>
      </div>
    </section>
  );
}
