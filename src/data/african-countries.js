/**
 * African Union member states (55), used by the community join form.
 * Kept alphabetical so the dropdown needs no sorting at runtime.
 */
export const AFRICAN_COUNTRIES = [
  'Algeria',
  'Angola',
  'Benin',
  'Botswana',
  'Burkina Faso',
  'Burundi',
  'Cabo Verde',
  'Cameroon',
  'Central African Republic',
  'Chad',
  'Comoros',
  'Congo (Democratic Republic of the)',
  'Congo (Republic of the)',
  "Côte d'Ivoire",
  'Djibouti',
  'Egypt',
  'Equatorial Guinea',
  'Eritrea',
  'Eswatini',
  'Ethiopia',
  'Gabon',
  'Gambia',
  'Ghana',
  'Guinea',
  'Guinea-Bissau',
  'Kenya',
  'Lesotho',
  'Liberia',
  'Libya',
  'Madagascar',
  'Malawi',
  'Mali',
  'Mauritania',
  'Mauritius',
  'Morocco',
  'Mozambique',
  'Namibia',
  'Niger',
  'Nigeria',
  'Rwanda',
  'São Tomé and Príncipe',
  'Senegal',
  'Seychelles',
  'Sierra Leone',
  'Somalia',
  'South Africa',
  'South Sudan',
  'Sudan',
  'Tanzania',
  'Togo',
  'Tunisia',
  'Uganda',
  'Western Sahara',
  'Zambia',
  'Zimbabwe',
];

/** Case-insensitive lookup used to validate submitted values server side. */
const BY_KEY = new Map(AFRICAN_COUNTRIES.map((c) => [c.toLowerCase(), c]));

/**
 * Return the canonical spelling of a country name, or null if it is not an
 * African Union member state.
 */
export function canonicalCountry(value) {
  return BY_KEY.get(String(value || '').trim().toLowerCase()) || null;
}
