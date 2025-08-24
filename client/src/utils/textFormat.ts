/**
 * Formats a name to proper case - first letter of each word capitalized, rest lowercase
 * Example: "andy HALSE" becomes "Andy Halse"
 */
export function formatProperCase(text: string): string {
  if (!text) return text;
  
  return text
    .trim()
    .toLowerCase()
    .split(' ')
    .map(word => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Formats text for names, handling multiple spaces and cleaning up the input
 */
export function formatName(text: string): string {
  if (!text) return text;
  
  // Remove extra spaces and format to proper case
  return text
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim()
    .toLowerCase()
    .split(' ')
    .map(word => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}