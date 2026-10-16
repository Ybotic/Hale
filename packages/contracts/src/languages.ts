export const SARVAM_LANGUAGES = [
  { code: "as-IN", name: "Assamese" },
  { code: "bn-IN", name: "Bengali" },
  { code: "brx-IN", name: "Bodo" },
  { code: "doi-IN", name: "Dogri" },
  { code: "en-IN", name: "English" },
  { code: "gu-IN", name: "Gujarati" },
  { code: "hi-IN", name: "Hindi" },
  { code: "kn-IN", name: "Kannada" },
  { code: "ks-IN", name: "Kashmiri" },
  { code: "kok-IN", name: "Konkani" },
  { code: "mai-IN", name: "Maithili" },
  { code: "ml-IN", name: "Malayalam" },
  { code: "mni-IN", name: "Manipuri" },
  { code: "mr-IN", name: "Marathi" },
  { code: "ne-IN", name: "Nepali" },
  { code: "od-IN", name: "Odia" },
  { code: "pa-IN", name: "Punjabi" },
  { code: "sa-IN", name: "Sanskrit" },
  { code: "sat-IN", name: "Santali" },
  { code: "sd-IN", name: "Sindhi" },
  { code: "ta-IN", name: "Tamil" },
  { code: "te-IN", name: "Telugu" },
  { code: "ur-IN", name: "Urdu" },
] as const;

export type SarvamLanguageCode = (typeof SARVAM_LANGUAGES)[number]["code"];

// Saaras v4 and Sarvam Translate cover 22 Indian languages plus English.
export const SARVAM_SPEECH_TO_TEXT_CODES = SARVAM_LANGUAGES.map(({ code }) => code);
export const SARVAM_TRANSLATION_CODES = SARVAM_LANGUAGES.map(({ code }) => code);

// Sarvam-105B's documented native-language set.
export const SARVAM_CHAT_CODES = [
  "bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN",
] as const satisfies readonly SarvamLanguageCode[];

// Bulbul v3 covers 10 Indian languages plus English. Bulbul v4 Flash currently
// omits Malayalam and Odia, so v3 is used as the initial all-coverage model.
export const SARVAM_TEXT_TO_SPEECH_CODES = SARVAM_CHAT_CODES;

export function isSarvamLanguageCode(value: string): value is SarvamLanguageCode {
  return SARVAM_LANGUAGES.some(({ code }) => code === value);
}

export function supportsSarvamChat(code: string): code is (typeof SARVAM_CHAT_CODES)[number] {
  return SARVAM_CHAT_CODES.includes(code as (typeof SARVAM_CHAT_CODES)[number]);
}

export function supportsSarvamTextToSpeech(code: string): code is (typeof SARVAM_TEXT_TO_SPEECH_CODES)[number] {
  return SARVAM_TEXT_TO_SPEECH_CODES.includes(code as (typeof SARVAM_TEXT_TO_SPEECH_CODES)[number]);
}
