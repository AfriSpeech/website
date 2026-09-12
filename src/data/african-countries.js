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

/**
 * Catch-all for diaspora members and international collaborators. Pinned to
 * the end of the list rather than sorted into it.
 */
export const OTHER_COUNTRY = 'Other / Outside Africa';

/** Everything the country field offers, in display order. */
export const COUNTRY_OPTIONS = [...AFRICAN_COUNTRIES, OTHER_COUNTRY];

/** Case-insensitive lookup used to validate submitted values server side. */
const BY_KEY = new Map(COUNTRY_OPTIONS.map((c) => [c.toLowerCase(), c]));

/**
 * Return the canonical spelling of a country name, or null if it is neither an
 * African Union member state nor the catch-all option.
 */
export function canonicalCountry(value) {
  return BY_KEY.get(String(value || '').trim().toLowerCase()) || null;
}
