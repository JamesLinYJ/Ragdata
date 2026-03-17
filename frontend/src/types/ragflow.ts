export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export interface UserProfile {
  name: string;
  email: string;
  avatar?: string;
}

export interface LoginPayload {
  access_token: string;
  email: string;
  nickname: string;
  avatar?: string;
}

export interface AuthSession {
  authorization: string;
  token: string;
  user: UserProfile;
}

export interface TenantInfo {
  llm_id?: string;
  embd_id?: string;
  asr_id?: string;
  img2txt_id?: string;
  tenant_id?: string;
  name?: string;
  [key: string]: unknown;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  avatar?: string;
  description?: string;
  chunk_num?: number;
  doc_num?: number;
  create_date?: string;
  update_date?: string;
  language?: string;
  permission?: string;
}

export interface KnowledgeListData {
  kbs: KnowledgeBase[];
  total: number;
}

export interface DocumentInfo {
  id: string;
  kb_id: string;
  name: string;
  suffix?: string;
  type?: string;
  run?: string;
  progress?: number;
  progress_msg?: string;
  size?: number;
  chunk_num?: number;
  token_num?: number;
  update_date?: string;
  create_date?: string;
}

export interface DocumentListData {
  docs: DocumentInfo[];
  total: number;
}

export interface PromptConfig {
  empty_response: string;
  prologue: string;
  quote: boolean;
  keyword: boolean;
  tts: boolean;
  system: string;
  refine_multiturn: boolean;
  use_kg: boolean;
  reasoning: boolean;
  parameters: Array<{
    key: string;
    optional: boolean;
  }>;
  toc_enhance?: boolean;
}

export interface Dialog {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  kb_ids: string[];
  kb_names?: string[];
  llm_id?: string;
  update_date?: string;
  prompt_config?: Partial<PromptConfig>;
}

export interface DialogListData {
  dialogs: Dialog[];
  total: number;
}

export interface ReferenceChunk {
  id: string;
  document_id: string;
  document_name: string;
  similarity?: number;
  content?: string | null;
}

export interface Reference {
  chunks: ReferenceChunk[];
  total: number;
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reference?: Reference;
  conversationId?: string;
}

export interface Conversation {
  id: string;
  name: string;
  dialog_id: string;
  message: ChatMessage[];
  update_date?: string;
  create_date?: string;
}

export interface ConversationSeed {
  message: ChatMessage[];
}

export interface StreamEvent<T = unknown> {
  event: string;
  data: T;
  message_id?: string;
  session_id?: string;
  created_at?: number;
  task_id?: string;
}

export interface StreamMessageData {
  content?: string;
  audio_binary?: string;
  outputs?: unknown;
}

export interface StreamMessageEndData {
  reference?: Reference;
}

export interface TobaccoSeedResult {
  kbId: string;
  kbName: string;
  uploadedCount: number;
  parsedCount: number;
}

export interface LlmCatalogItem {
  id?: string | null;
  llm_name: string;
  model_type: string | string[];
  fid: string;
  available?: boolean;
  status?: string;
  tags?: string[];
}

export type LlmCatalog = Record<string, LlmCatalogItem[]>;

export interface MyLlmDetailItem {
  id?: string;
  type: string;
  name: string;
  used_token?: number;
  api_base?: string;
  max_tokens?: number;
  status?: string;
}

export type MyLlmDetailMap = Record<
  string,
  {
    tags?: string | string[];
    llm: MyLlmDetailItem[];
  }
>;

export interface LlmFactory {
  name: string;
  tags?: string | string[];
  model_types?: string[];
  logo?: string;
  rank?: number;
  status?: string;
}

export type FactoryApiKeyPayload = Record<string, string | undefined> & {
  llm_factory: string;
  api_key: string;
  base_url?: string;
};

export interface FactoryApiKeyVerification {
  success: boolean;
  message?: string;
}
