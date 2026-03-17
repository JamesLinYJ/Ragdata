import type {
  AuthSession,
  ChatMessage,
  Conversation,
  ConversationSeed,
  Dialog,
  DialogListData,
  DocumentListData,
  FactoryApiKeyPayload,
  FactoryApiKeyVerification,
  KnowledgeBase,
  KnowledgeListData,
  LlmCatalog,
  LlmFactory,
  LoginPayload,
  MyLlmDetailMap,
  StreamEvent,
  StreamMessageEndData,
  StreamMessageData,
  TobaccoSeedResult,
  TenantInfo,
  UserProfile,
} from '../types/ragflow';
import { request, buildUrl } from './http';
import { encryptPassword } from './security';
import { tobaccoSeedFiles } from './tobacco-seed';

export async function login(email: string, password: string): Promise<AuthSession> {
  const { data, response } = await request<LoginPayload>('/v1/user/login', {
    method: 'POST',
    skipAuth: true,
    body: { email, password: encryptPassword(password) },
  });

  const authorization =
    response.headers.get('Authorization') || `Bearer ${data.access_token}`;

  return {
    authorization,
    token: data.access_token,
    user: {
      name: data.nickname,
      email: data.email,
      avatar: data.avatar,
    },
  };
}

export async function register(email: string, nickname: string, password: string) {
  const { data } = await request('/v1/user/register', {
    method: 'POST',
    skipAuth: true,
    body: {
      email,
      nickname,
      password: encryptPassword(password),
    },
  });

  return data;
}

export async function fetchUserInfo(): Promise<UserProfile> {
  const { data } = await request<{ email: string; nickname: string; avatar?: string }>(
    '/v1/user/info',
  );

  return {
    name: data.nickname,
    email: data.email,
    avatar: data.avatar,
  };
}

export async function fetchTenantInfo(): Promise<TenantInfo> {
  const { data } = await request<TenantInfo>('/v1/user/tenant_info');
  return data;
}

export async function updateTenantInfo(payload: {
  tenant_id: string;
  name?: string;
  llm_id: string;
  embd_id: string;
  asr_id: string;
  img2txt_id: string;
}) {
  const { data } = await request<boolean>('/v1/user/set_tenant_info', {
    method: 'POST',
    body: payload,
  });

  return data;
}

export async function fetchLlmCatalog(modelType?: string): Promise<LlmCatalog> {
  const { data } = await request<LlmCatalog>('/v1/llm/list', {
    query: modelType
      ? {
          model_type: modelType,
        }
      : undefined,
  });

  return data;
}

export async function fetchMyLlmsDetailed(): Promise<MyLlmDetailMap> {
  const { data } = await request<MyLlmDetailMap>('/v1/llm/my_llms', {
    query: {
      include_details: 'true',
    },
  });

  return data;
}

export async function fetchLlmFactories(): Promise<LlmFactory[]> {
  const { data } = await request<LlmFactory[]>('/v1/llm/factories');
  return Array.isArray(data) ? data : [];
}

export async function verifyFactoryApiKey(
  payload: FactoryApiKeyPayload,
): Promise<FactoryApiKeyVerification> {
  const { data } = await request<FactoryApiKeyVerification>('/v1/llm/set_api_key', {
    method: 'POST',
    body: {
      ...payload,
      verify: true,
    } as Record<string, unknown>,
  });

  return data;
}

export async function saveFactoryApiKey(payload: FactoryApiKeyPayload) {
  const { data } = await request<boolean>('/v1/llm/set_api_key', {
    method: 'POST',
    body: payload as Record<string, unknown>,
  });

  return data;
}

export async function fetchSystemVersion(): Promise<{ version?: string; [key: string]: unknown }> {
  const { data } = await request<{ version?: string; [key: string]: unknown }>(
    '/v1/system/version',
  );
  return data;
}

export async function fetchSystemStatus(): Promise<Record<string, unknown>> {
  const { data } = await request<Record<string, unknown>>('/v1/system/status');
  return data;
}

export async function fetchSystemConfig(): Promise<Record<string, unknown>> {
  const { data } = await request<Record<string, unknown>>('/v1/system/config');
  return data;
}

export async function listKnowledgeBases(options?: {
  page?: number;
  pageSize?: number;
  keywords?: string;
  ownerIds?: string[];
}): Promise<KnowledgeListData> {
  const { data } = await request<KnowledgeListData>('/v1/kb/list', {
    method: 'POST',
    query: {
      page: options?.page ?? 1,
      page_size: options?.pageSize ?? 50,
      keywords: options?.keywords ?? '',
    },
    body: {
      owner_ids: options?.ownerIds,
    },
  });

  return data;
}

export async function createKnowledgeBase(name: string): Promise<KnowledgeBase> {
  const { data } = await request<{ kb_id: string }>('/v1/kb/create', {
    method: 'POST',
    body: { name },
  });

  return {
    id: data.kb_id,
    name,
  };
}

export async function deleteKnowledgeBase(kbId: string) {
  await request('/v1/kb/rm', {
    method: 'POST',
    body: { kb_id: kbId },
  });
}

export async function listDocuments(kbId: string): Promise<DocumentListData> {
  const { data } = await request<DocumentListData>('/v1/document/list', {
    method: 'POST',
    query: {
      kb_id: kbId,
      page: 1,
      page_size: 100,
    },
    body: {},
  });
  return data;
}

export async function uploadDocuments(kbId: string, files: File[]) {
  const formData = new FormData();
  formData.append('kb_id', kbId);
  files.forEach((file) => formData.append('file', file));

  const { data } = await request('/v1/document/upload', {
    method: 'POST',
    body: formData,
  });
  return data;
}

export async function runDocuments(documentIds: string[], run = 1) {
  await request('/v1/document/run', {
    method: 'POST',
    body: {
      doc_ids: documentIds,
      run,
    },
  });
}

export async function listDialogs(options?: {
  page?: number;
  pageSize?: number;
  keywords?: string;
}): Promise<DialogListData> {
  const { data } = await request<DialogListData>(
    buildDialogQueryPath('/v1/dialog/next', {
      page: options?.page ?? 1,
      pageSize: options?.pageSize ?? 50,
      keywords: options?.keywords ?? '',
    }),
    {
      method: 'POST',
      body: {},
    },
  );

  return data;
}

function buildDialogQueryPath(
  path: string,
  options: { page: number; pageSize: number; keywords: string },
) {
  const url = new URL(path, 'http://local');
  url.searchParams.set('page', String(options.page));
  url.searchParams.set('page_size', String(options.pageSize));
  if (options.keywords) {
    url.searchParams.set('keywords', options.keywords);
  }
  return `${url.pathname}${url.search}`;
}

export async function createDialog(input: {
  name: string;
  kbIds: string[];
  llmId?: string;
  dialogId?: string;
}): Promise<Dialog | null> {
  const { data } = await request<Dialog | null>('/v1/dialog/set', {
    method: 'POST',
    body: {
      ...(input.dialogId ? { dialog_id: input.dialogId } : {}),
      name: input.name,
      icon: '💬',
      language: 'English',
      description: '',
      kb_ids: input.kbIds,
      llm_id: input.llmId,
      llm_setting: {},
      similarity_threshold: 0.2,
      vector_similarity_weight: 0.3,
      top_n: 8,
      top_k: 1024,
      prompt_config: {
        empty_response: '',
        prologue: '你好，请输入你的问题，我会结合知识库内容为你回答。',
        quote: true,
        keyword: false,
        tts: false,
        system: 'You are a professional tobacco knowledge assistant.',
        refine_multiturn: false,
        use_kg: false,
        reasoning: false,
        parameters: [],
        toc_enhance: false,
      },
    },
  });

  return data;
}

export async function listConversations(dialogId: string): Promise<Conversation[]> {
  const { data } = await request<Conversation[]>(
    `/v1/conversation/list?dialog_id=${encodeURIComponent(dialogId)}`,
  );
  return data ?? [];
}

export async function getConversation(conversationId: string): Promise<Conversation> {
  const { data } = await request<Conversation>(
    `/v1/conversation/get?conversation_id=${encodeURIComponent(conversationId)}`,
  );
  return data;
}

export async function createConversationSeed(
  dialogId: string,
  name: string,
  conversationId: string,
): Promise<ConversationSeed> {
  const { data } = await request<ConversationSeed>('/v1/conversation/set', {
    method: 'POST',
    body: {
      dialog_id: dialogId,
      name,
      is_new: true,
      conversation_id: conversationId,
      message: [
        {
          role: 'assistant',
          content: name,
          conversationId,
        },
      ],
    },
  });

  return data;
}

export async function streamConversation(
  body: {
    conversation_id: string;
    messages: ChatMessage[];
    reasoning?: boolean;
    internet?: boolean;
  },
  handlers: {
    onMessage: (chunk: string) => void;
    onReference?: (reference: StreamMessageEndData['reference']) => void;
    onEvent?: (event: StreamEvent<StreamMessageData | StreamMessageEndData>) => void;
  },
  signal?: AbortSignal,
) {
  const response = await fetch(buildUrl('/v1/conversation/completion'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: localStorage.getItem('know-ragflow-session')
        ? JSON.parse(localStorage.getItem('know-ragflow-session') || '{}').authorization || ''
        : '',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`对话请求失败：${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';

    for (const chunk of chunks) {
      const lines = chunk
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      const dataLine = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s*/, ''))
        .join('\n');

      if (!dataLine) continue;

      const parsed = JSON.parse(dataLine) as StreamEvent<
        StreamMessageData | StreamMessageEndData
      >;

      handlers.onEvent?.(parsed);

      if (parsed.event === 'message') {
        handlers.onMessage((parsed.data as StreamMessageData)?.content || '');
      }

      if (parsed.event === 'message_end') {
        handlers.onReference?.((parsed.data as StreamMessageEndData)?.reference);
      }
    }
  }
}

export async function createTobaccoKnowledgeBase(): Promise<TobaccoSeedResult> {
  const knowledgeList = await listKnowledgeBases({ pageSize: 100 });
  let kb = knowledgeList.kbs.find((item) => item.name === '示例知识库');

  if (!kb) {
    kb = await createKnowledgeBase('示例知识库');
  }

  const files = tobaccoSeedFiles.map(
    (item) => new File([item.content], item.fileName, { type: 'text/markdown;charset=utf-8' }),
  );
  await uploadDocuments(kb.id, files);

  const documents = await listDocuments(kb.id);
  const documentIds = documents.docs.map((item) => item.id);

  if (documentIds.length > 0) {
    await runDocuments(documentIds, 1);
  }

  return {
    kbId: kb.id,
    kbName: kb.name,
    uploadedCount: files.length,
    parsedCount: documentIds.length,
  };
}
