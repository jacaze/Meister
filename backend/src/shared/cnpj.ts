export function normalizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, '');
}

export function isValidCnpj(cnpjRaw: string): boolean {
  const cnpj = normalizeCnpj(cnpjRaw);
  if (cnpj.length !== 14) {
    return false;
  }
  if (/^(\d)\1{13}$/.test(cnpj)) {
    return false;
  }

  const weightsFirst = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(cnpj[i]) * weightsFirst[i]!;
  }
  let rem = sum % 11;
  const d1 = rem < 2 ? 0 : 11 - rem;
  if (Number(cnpj[12]) !== d1) {
    return false;
  }

  const weightsSecond = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += Number(cnpj[i]) * weightsSecond[i]!;
  }
  rem = sum % 11;
  const d2 = rem < 2 ? 0 : 11 - rem;
  return Number(cnpj[13]) === d2;
}

export function formatCnpj(cnpjRaw: string): string {
  const c = normalizeCnpj(cnpjRaw);
  if (c.length !== 14) {
    return cnpjRaw;
  }
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12, 14)}`;
}
