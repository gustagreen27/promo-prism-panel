// Gera Pix Copia e Cola (BR Code estático, padrão EMV/Bacen) com valor fixo.
const PIX_KEY = "68985151000180"; // CNPJ Agencia Next LTDA
const MERCHANT_NAME = "AGENCIA NEXT LTDA";
const MERCHANT_CITY = "ANAPOLIS";

function tlv(id: string, value: string) {
  return id + String(value.length).padStart(2, "0") + value;
}

function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** txid: só letras/números, até 25 caracteres. */
export function buildPixBrCode(amountCents: number, txid: string) {
  const ref = (txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25)) || "***";
  const payload =
    tlv("00", "01") +
    tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", PIX_KEY)) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", (amountCents / 100).toFixed(2)) +
    tlv("58", "BR") +
    tlv("59", MERCHANT_NAME) +
    tlv("60", MERCHANT_CITY) +
    tlv("62", tlv("05", ref)) +
    "6304";
  return payload + crc16(payload);
}

export function depositCode(depositId: string) {
  return "DEP" + depositId.replace(/-/g, "").slice(0, 10).toUpperCase();
}
