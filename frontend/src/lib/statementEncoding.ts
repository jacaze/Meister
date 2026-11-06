/**
 * Decodifica extratos (OFX/CSV) de bancos brasileiros.
 *
 * O cabeçalho do OFX (CHARSET:1252, ENCODING:USASCII) muitas vezes mente: há bancos que geram
 * UTF-8 e declaram 1252. Por isso a ordem é pelos bytes, não pelo cabeçalho:
 * 1. BOM UTF-8 → UTF-8.
 * 2. Bytes válidos em UTF-8 → UTF-8 (texto puro ASCII também cai aqui).
 * 3. Senão → windows-1252 (superconjunto do latin1 usado por Itaú, BB, Caixa, Bradesco).
 *
 * Decodificar errado muda a descrição e, com ela, o identificador da transação no backend —
 * o mesmo extrato importado de novo viraria duplicata.
 */
export function decodeStatement(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
