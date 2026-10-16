export const SUPPORTED_LANGUAGES = [
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

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export function isLanguageCode(value: string): value is LanguageCode {
  return SUPPORTED_LANGUAGES.some(({ code }) => code === value);
}
