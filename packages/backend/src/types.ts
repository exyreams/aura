export interface JsonRpcRequestBase {
  rpcUrl?: string;
  programId?: string;
}

export interface AgentJobConfig extends JsonRpcRequestBase {
  agentId: string;
  treasury: string;
  strategy: string;
  mode: "public" | "confidential";
  model: string;
  apiKey: string;
  endpoint?: string;
  intervalMs?: number;
  maxTradeSizeUsd: number;
  recipient: string;
  txType: number;
  chain: number;
}

export interface ApiResponseMeta {
  requestId: string;
  timestamp: string;
}

export interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
  meta: ApiResponseMeta;
}

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: ApiResponseMeta;
}
