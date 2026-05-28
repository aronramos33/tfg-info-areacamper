const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

function normalizeDNI(s: string): string {
  return s.replace(/[\s-]/g, '').toUpperCase().trim();
}

export function isValidDNI(raw: string): boolean {
  const v = normalizeDNI(raw);
  const m = v.match(/^(\d{8})([A-Z])$/);
  if (!m) return false;
  return m[2] === DNI_LETTERS[parseInt(m[1], 10) % 23];
}

export function isValidNIE(raw: string): boolean {
  const v = normalizeDNI(raw);
  const m = v.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (!m) return false;
  const prefix = m[1] === 'X' ? '0' : m[1] === 'Y' ? '1' : '2';
  return m[3] === DNI_LETTERS[parseInt(prefix + m[2], 10) % 23];
}

export function isValidDNINIE(raw: string): boolean {
  const v = normalizeDNI(raw);
  if (!v) return true;
  if (/^\d{8}[A-Z]$/.test(v)) return isValidDNI(v);
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) return isValidNIE(v);
  return false;
}

export function isValidPassport(raw: string): boolean {
  return /^[A-Z0-9]{6,}$/.test(raw.replace(/\s/g, '').toUpperCase());
}

export function validateDoc(
  docType: 'dni' | 'nie' | 'passport',
  raw: string,
): string | null {
  if (!raw.trim()) return 'El número de documento es obligatorio.';
  if (docType === 'dni' && !isValidDNI(raw))
    return 'DNI inválido. Formato: 8 dígitos + letra correcta (ej: 12345678Z).';
  if (docType === 'nie' && !isValidNIE(raw))
    return 'NIE inválido. Formato: X/Y/Z + 7 dígitos + letra (ej: X1234567L).';
  if (docType === 'passport' && !isValidPassport(raw))
    return 'Pasaporte inválido. Mínimo 6 caracteres alfanuméricos.';
  return null;
}

export function isValidName(s: string): boolean {
  const v = s.trim();
  if (v.length < 2) return false;
  return /^[a-zA-ZáéíóúäëïöüàèìòùâêîôûñÑÁÉÍÓÚÜÀÈÌÒÙÂÊÎÔÛÄËÏÖÜ\s'\-]+$/.test(v);
}

export function isValidLocalPhone(local: string): boolean {
  return local.replace(/[^\d]/g, '').length >= 6;
}
