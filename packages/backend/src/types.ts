export interface JsonRpcRequestBase {
  rpcUrl?: string;
  programId?: string;
}

export interface AgentJobConfig extends JsonRpcRequestBase {
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
