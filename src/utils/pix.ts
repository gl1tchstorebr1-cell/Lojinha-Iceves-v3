// Official Banco Central do Brasil (Bacen) Pix EMV Standard Utilities

export function calculatePixCrc16(payload: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function formatEmvField(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

export function cleanTextForPix(text: string, maxLength: number): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function generateBacenPixPayload(params: {
  pixKey?: string;
  receiverName?: string;
  city?: string;
  amount?: number;
  txId?: string;
}): string {
  const { 
    pixKey, 
    receiverName = 'CAMPUS EDUCACIONAL', 
    city = 'SAO PAULO', 
    amount, 
    txId = '***' 
  } = params;

  const cleanKey = (pixKey || 'financeiro@campus.edu.br').trim();
  const cleanName = cleanTextForPix(receiverName, 25) || 'CAMPUS EDUCACIONAL';
  const cleanCity = cleanTextForPix(city, 15) || 'SAO PAULO';
  const cleanTxId = cleanTextForPix(txId, 25) || '***';

  // 00: Format Indicator (01)
  let payload = formatEmvField('00', '01');

  // 26: Merchant Account Information (Pix standard)
  const gui = formatEmvField('00', 'br.gov.bcb.pix');
  const keyField = formatEmvField('01', cleanKey);
  payload += formatEmvField('26', `${gui}${keyField}`);

  // 52: Merchant Category Code (0000)
  payload += formatEmvField('52', '0000');

  // 53: Transaction Currency (986 = BRL)
  payload += formatEmvField('53', '986');

  // 54: Transaction Amount
  if (amount && amount > 0) {
    payload += formatEmvField('54', Number(amount).toFixed(2));
  }

  // 58: Country Code (BR)
  payload += formatEmvField('58', 'BR');

  // 59: Merchant Name
  payload += formatEmvField('59', cleanName);

  // 60: Merchant City
  payload += formatEmvField('60', cleanCity);

  // 62: Additional Data Field (TxID)
  const txField = formatEmvField('05', cleanTxId);
  payload += formatEmvField('62', txField);

  // 63: CRC16 Checksum
  payload += '6304';
  const crc = calculatePixCrc16(payload);
  return `${payload}${crc}`;
}
