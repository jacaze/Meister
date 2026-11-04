export type ConsentKind = 'terms' | 'privacy' | 'ai_processing' | 'open_finance';

export interface ConsentRecord {
  readonly kind: ConsentKind;
  readonly version: string;
  readonly accepted: boolean;
  readonly acceptedAt: string;
  readonly ipAddress?: string | null;
}

export interface UserDataExport {
  readonly exportedAt: string;
  readonly legalDisclaimer: string;
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly accountType: string;
    readonly timezone: string;
    readonly createdAt: string;
  };
  readonly workspaces: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly entities: ReadonlyArray<{
      readonly id: string;
      readonly kind: string;
      readonly name: string;
      readonly cnpj?: string | null;
      readonly legalName?: string | null;
      readonly isMei: boolean;
    }>;
  }>;
  readonly transactions: ReadonlyArray<{
    readonly id: string;
    readonly entityId: string;
    readonly type: string;
    readonly amount: string;
    readonly description: string;
    readonly transactionDate: string;
    readonly paymentMethod?: string | null;
    readonly categoryName?: string | null;
    readonly status: string;
    readonly viaPersonalAccount: boolean;
  }>;
  readonly categories: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly slug: string;
  }>;
  readonly jars: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly percent?: number | null;
    readonly fixedAmount?: string | null;
    readonly rollover: boolean;
  }>;
  readonly dasCharges: ReadonlyArray<{
    readonly id: string;
    readonly competence: string;
    readonly amount: string;
    readonly status: string;
    readonly dueDate: string;
  }>;
  readonly lessonProgress: ReadonlyArray<{
    readonly lessonSlug: string;
    readonly status: string;
    readonly quizScore: number | null;
    readonly completedAt?: string | null;
  }>;
  readonly consents: ReadonlyArray<ConsentRecord>;
}
