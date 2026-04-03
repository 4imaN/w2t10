/**
 * Masks a phone number to format like (415) ***-**21
 * Shows area code and last 2 digits only.
 */
function maskPhone(phone) {
  if (!phone) return null;

  // Strip non-digit characters
  const digits = phone.replace(/\D/g, '');

  if (digits.length < 7) {
    return '***-' + digits.slice(-2);
  }

  if (digits.length >= 10) {
    const area = digits.slice(-10, -7);
    const last2 = digits.slice(-2);
    return `(${area}) ***-**${last2}`;
  }

  const last2 = digits.slice(-2);
  return `***-**${last2}`;
}

module.exports = { maskPhone };
