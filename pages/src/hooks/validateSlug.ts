const germanCharacterReplacements: Record<string, string> = {
  ß: 'ss',
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
}

export const formatSlug = (val: string): string =>
  val
    .toString() // Cast to string (optional)
    .toLowerCase() // Convert the string to lowercase letters
    .replace(/[äöüß]/g, (match) => germanCharacterReplacements[match])
    .normalize('NFKD') // The normalize() using NFKD method returns the Unicode Normalization Form of a given string.
    .trim() // Remove whitespace from both sides of a string
    .replace(/\s+/g, '-') // Replace spaces with hyphen
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/-{2,}/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, '') // Trim hyphens from start and end

/**
 * Same as formatSlug, except that it does not remove hyphens from the end of the string. Also converts spaces at the end of the string to hyphens.
 *
 * This is used to format a slug while typing.
 */
export const liveFormatSlug = (val: string): string =>
  val
    .toString() // Cast to string (optional)
    .toLowerCase() // Convert the string to lowercase letters
    .replace(/[äöüß]/g, (match) => germanCharacterReplacements[match])
    .normalize('NFKD') // The normalize() using NFKD method returns the Unicode Normalization Form of a given string.
    .replace(/\s+/g, '-') // Replace spaces with hyphen
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/-{2,}/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+/, '') // Trim hyphens from start
    // place trim at the end to replace inner whitespaces with hyphens:
    .trim() // Remove whitespace from both sides of a string
