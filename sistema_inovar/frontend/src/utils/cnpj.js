const CNPJ_PATTERN = /^[A-Z0-9]{12}[0-9]{2}$/;
const FIRST_DIGIT_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const SECOND_DIGIT_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeCnpj(value) {
  return String(value || '').toUpperCase().replace(/[.\-/\s]/g, '');
}

export function formatCnpj(value) {
  const normalized = normalizeCnpj(value).replace(/[^A-Z0-9]/g, '').slice(0, 14);
  if (normalized.length <= 2) return normalized;
  if (normalized.length <= 5) return `${normalized.slice(0, 2)}.${normalized.slice(2)}`;
  if (normalized.length <= 8) return `${normalized.slice(0, 2)}.${normalized.slice(2, 5)}.${normalized.slice(5)}`;
  if (normalized.length <= 12) return `${normalized.slice(0, 2)}.${normalized.slice(2, 5)}.${normalized.slice(5, 8)}/${normalized.slice(8)}`;
  return `${normalized.slice(0, 2)}.${normalized.slice(2, 5)}.${normalized.slice(5, 8)}/${normalized.slice(8, 12)}-${normalized.slice(12)}`;
}

function calculateDigit(characters, weights) {
  const total = [...characters].reduce(
    (sum, character, index) => sum + (character.charCodeAt(0) - 48) * weights[index],
    0,
  );
  const remainder = total % 11;
  return remainder < 2 ? '0' : String(11 - remainder);
}

export function isValidCnpj(value) {
  const normalized = normalizeCnpj(value);
  if (!CNPJ_PATTERN.test(normalized) || new Set(normalized.slice(0, 12)).size === 1) return false;
  const firstDigit = calculateDigit(normalized.slice(0, 12), FIRST_DIGIT_WEIGHTS);
  const secondDigit = calculateDigit(normalized.slice(0, 12) + firstDigit, SECOND_DIGIT_WEIGHTS);
  return normalized.endsWith(firstDigit + secondDigit);
}
