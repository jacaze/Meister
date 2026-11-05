export interface PluggyConfigStatus {
  readonly hasCredentials: boolean;
  readonly clientIdMasked: string | null;
}

export function getPluggyConfig(): PluggyConfigStatus {
  const clientId = process.env.PLUGGY_CLIENT_ID?.trim();
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET?.trim();
  const hasCredentials = Boolean(clientId && clientSecret);

  let clientIdMasked: string | null = null;
  if (clientId && clientId.length > 8) {
    clientIdMasked = `${clientId.slice(0, 4)}...${clientId.slice(-4)}`;
  } else if (clientId) {
    clientIdMasked = 'Configurado';
  }

  return {
    hasCredentials,
    clientIdMasked,
  };
}
