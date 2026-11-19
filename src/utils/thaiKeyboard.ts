/**
 * Utility to convert Thai Kedmanee keyboard input to English QWERTY.
 * Useful when hardware USB / Bluetooth barcode scanners type into a PC/tablet
 * while the system language is mistakenly set to Thai (TH).
 */

const KEDMANEE_MAP: Record<string, string> = {
  // Number row unshifted
  'ๅ': '1',
  '/': '2',
  '-': '3',
  'ภ': '4',
  'ถ': '5',
  'ุ': '6',
  'ึ': '7',
  'ค': '8',
  'ต': '9',
  'จ': '0',
  'ข': '-',
  'ช': '=',

  // Number row shifted
  '+': '!',
  '๑': '@',
  '๒': '#',
  '๓': '$',
  '๔': '%',
  'ู': '^',
  '฿': '&',
  '๕': '*',
  '๖': '(',
  '๗': ')',
  '๘': '_',
  '๙': '+',

  // Top row unshifted
  'ๆ': 'q',
  'ไ': 'w',
  'ำ': 'e',
  'พ': 'r',
  'ะ': 't',
  'ั': 'y',
  'ี': 'u',
  'ร': 'i',
  'น': 'o',
  'ย': 'p',
  'บ': '[',
  'ล': ']',
  'ฃ': '\\',

  // Top row shifted
  '๐': 'Q',
  '"': 'W',
  'ฎ': 'E',
  'ธ': 'T',
  'ํ': 'T',
  '๊': 'Y',
  'ณ': 'U',
  'ฯ': 'I',
  'ญ': 'O',
  'ฐ': 'P',
  'ฅ': '{',
  '}': '}',

  // Home row unshifted
  'ฟ': 'a',
  'ห': 's',
  'ก': 'd',
  'ด': 'f',
  'เ': 'g',
  '้': 'h',
  '่': 'j',
  'า': 'k',
  'ส': 'l',
  'ว': ';',
  'ง': "'",

  // Home row shifted
  'ฤ': 'A',
  'ฆ': 'S',
  'ฏ': 'D',
  'โ': 'F',
  'ฌ': 'G',
  '็': 'H',
  '๋': 'J',
  'ษ': 'K',
  'ศ': 'L',
  'ซ': ':',
  '.': '"',

  // Bottom row unshifted
  'ผ': 'z',
  'ป': 'x',
  'แ': 'c',
  'อ': 'v',
  'ิ': 'b',
  'ื': 'n',
  'ท': 'm',
  'ม': ',',
  'ใ': '.',
  'ฝ': '/',

  // Bottom row shifted
  '(': 'Z',
  ')': 'X',
  'ฉ': 'C',
  'ฮ': 'V',
  'ฺ': 'B',
  '์': 'N',
  '?': 'M',
  'ฒ': '<',
  'ฬ': '>',
  'ฦ': '?',
};

/**
 * Checks if string contains Thai characters
 */
export function hasThaiCharacters(text: string): boolean {
  return /[\u0E00-\u0E7F]/.test(text);
}

/**
 * Transliterates Thai Kedmanee characters into standard QWERTY ASCII characters.
 * If text does not contain Thai characters, returns original text.
 */
export function convertKedmaneeToEnglish(text: string): string {
  if (!text || !hasThaiCharacters(text)) {
    return text;
  }

  let converted = '';
  for (const char of text) {
    if (KEDMANEE_MAP[char] !== undefined) {
      converted += KEDMANEE_MAP[char];
    } else {
      converted += char;
    }
  }
  return converted;
}
