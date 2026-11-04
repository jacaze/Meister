export interface PluggyConnectorInfo {
  readonly id: number;
  readonly name: string;
  readonly primaryColor?: string;
  readonly institutionUrl?: string;
  readonly imageUrl?: string;
}

export interface PluggyItemInfo {
  readonly id: string;
  readonly status: string;
  readonly executionStatus?: string;
  readonly connector?: PluggyConnectorInfo;
  readonly createdAt: string;
  readonly updatedAt?: string;
}

export interface PluggyAccountInfo {
  readonly id: string;
  readonly type: string; // 'BANK' | 'CREDIT'
  readonly subtype?: string; // 'CHECKING_ACCOUNT' | 'SAVINGS_ACCOUNT' | 'CREDIT_CARD'
  readonly name: string;
  readonly balance?: number;
  readonly currencyCode?: string;
  readonly number?: string;
}

export interface PluggyTransactionInfo {
  readonly id: string;
  readonly description: string;
  readonly descriptionRaw?: string;
  readonly amount: number; // In Pluggy: negative for expense, positive for income
  readonly date: string; // ISO string
  readonly category?: string;
  readonly categoryId?: string;
  readonly type?: string; // 'DEBIT' | 'CREDIT'
  readonly status?: string;
}

export interface BankingAggregator {
  validateCredentials(): Promise<{ valid: boolean; error?: string }>;
  createConnectToken(options?: { clientUserId?: string }): Promise<string>;
  fetchItem(itemId: string): Promise<PluggyItemInfo>;
  fetchAccounts(itemId: string): Promise<PluggyAccountInfo[]>;
  fetchTransactions(accountId: string, options?: { from?: string; to?: string }): Promise<PluggyTransactionInfo[]>;
  syncItem(itemId: string): Promise<{ status: string }>;
}
