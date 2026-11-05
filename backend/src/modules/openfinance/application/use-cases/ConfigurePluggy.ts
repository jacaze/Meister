export interface PluggyConfigStatus {
  readonly hasCredentials: boolean;
}

export function getPluggyConfig(): PluggyConfigStatus {
  const clientId = process.env.PLUGGY_CLIENT_ID?.trim();
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET?.trim();
  const hasCredentials = Boolean(clientId && clientSecret);

  return {
    hasCredentials,
  };
}
