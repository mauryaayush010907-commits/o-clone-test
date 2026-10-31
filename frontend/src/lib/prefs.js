/**
 * Optional matchmaking preferences (browser side).
 *
 * Everything is optional: defaultPrefs() means "match me with anyone
 * instantly". Preferences persist to localStorage so users configure them
 * once and reuse them across video and text sessions.
 */

export const GENDERS = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
];

// Full ISO 3166-1 alpha-2 country list, sorted by display name. "xx" is the
// reserved "Prefer not to say" pseudo-code used by the "About you" selector.
export const COUNTRIES = (() => {
  const list = [
    ["af", "Afghanistan"], ["al", "Albania"], ["dz", "Algeria"], ["ad", "Andorra"], ["ao", "Angola"],
    ["ag", "Antigua and Barbuda"], ["ar", "Argentina"], ["am", "Armenia"], ["au", "Australia"], ["at", "Austria"],
    ["az", "Azerbaijan"], ["bs", "Bahamas"], ["bh", "Bahrain"], ["bd", "Bangladesh"], ["bb", "Barbados"],
    ["by", "Belarus"], ["be", "Belgium"], ["bz", "Belize"], ["bj", "Benin"], ["bt", "Bhutan"],
    ["bo", "Bolivia"], ["ba", "Bosnia and Herzegovina"], ["bw", "Botswana"], ["br", "Brazil"], ["bn", "Brunei"],
    ["bg", "Bulgaria"], ["bf", "Burkina Faso"], ["bi", "Burundi"], ["kh", "Cambodia"], ["cm", "Cameroon"],
    ["ca", "Canada"], ["cv", "Cape Verde"], ["cf", "Central African Republic"], ["td", "Chad"], ["cl", "Chile"],
    ["cn", "China"], ["co", "Colombia"], ["km", "Comoros"], ["cg", "Congo"], ["cr", "Costa Rica"],
    ["ci", "Côte d'Ivoire"], ["hr", "Croatia"], ["cu", "Cuba"], ["cy", "Cyprus"], ["cz", "Czechia"],
    ["dk", "Denmark"], ["dj", "Djibouti"], ["dm", "Dominica"], ["do", "Dominican Republic"], ["ec", "Ecuador"],
    ["eg", "Egypt"], ["sv", "El Salvador"], ["gq", "Equatorial Guinea"], ["er", "Eritrea"], ["ee", "Estonia"],
    ["et", "Ethiopia"], ["fj", "Fiji"], ["fi", "Finland"], ["fr", "France"], ["ga", "Gabon"],
    ["gm", "Gambia"], ["ge", "Georgia"], ["de", "Germany"], ["gh", "Ghana"], ["gr", "Greece"],
    ["gd", "Grenada"], ["gt", "Guatemala"], ["gn", "Guinea"], ["gw", "Guinea-Bissau"], ["gy", "Guyana"],
    ["ht", "Haiti"], ["hn", "Honduras"], ["hk", "Hong Kong"], ["hu", "Hungary"], ["is", "Iceland"],
    ["in", "India"], ["id", "Indonesia"], ["ir", "Iran"], ["iq", "Iraq"], ["ie", "Ireland"],
    ["il", "Israel"], ["it", "Italy"], ["jm", "Jamaica"], ["jp", "Japan"], ["jo", "Jordan"],
    ["kz", "Kazakhstan"], ["ke", "Kenya"], ["ki", "Kiribati"], ["kw", "Kuwait"], ["kg", "Kyrgyzstan"],
    ["la", "Laos"], ["lv", "Latvia"], ["lb", "Lebanon"], ["ls", "Lesotho"], ["lr", "Liberia"],
    ["ly", "Libya"], ["li", "Liechtenstein"], ["lt", "Lithuania"], ["lu", "Luxembourg"], ["mo", "Macau"],
    ["mg", "Madagascar"], ["mw", "Malawi"], ["my", "Malaysia"], ["mv", "Maldives"], ["ml", "Mali"],
    ["mt", "Malta"], ["mh", "Marshall Islands"], ["mr", "Mauritania"], ["mu", "Mauritius"], ["mx", "Mexico"],
    ["fm", "Micronesia"], ["md", "Moldova"], ["mc", "Monaco"], ["mn", "Mongolia"], ["me", "Montenegro"],
    ["ma", "Morocco"], ["mz", "Mozambique"], ["mm", "Myanmar"], ["na", "Namibia"], ["nr", "Nauru"],
    ["np", "Nepal"], ["nl", "Netherlands"], ["nz", "New Zealand"], ["ni", "Nicaragua"], ["ne", "Niger"],
    ["ng", "Nigeria"], ["kp", "North Korea"], ["mk", "North Macedonia"], ["no", "Norway"], ["om", "Oman"],
    ["pk", "Pakistan"], ["pw", "Palau"], ["ps", "Palestine"], ["pa", "Panama"], ["pg", "Papua New Guinea"],
    ["py", "Paraguay"], ["pe", "Peru"], ["ph", "Philippines"], ["pl", "Poland"], ["pt", "Portugal"],
    ["qa", "Qatar"], ["ro", "Romania"], ["ru", "Russia"], ["rw", "Rwanda"], ["kn", "Saint Kitts and Nevis"],
    ["lc", "Saint Lucia"], ["vc", "Saint Vincent and the Grenadines"], ["ws", "Samoa"], ["sm", "San Marino"],
    ["st", "São Tomé and Príncipe"], ["sa", "Saudi Arabia"], ["sn", "Senegal"], ["rs", "Serbia"], ["sc", "Seychelles"],
    ["sl", "Sierra Leone"], ["sg", "Singapore"], ["sk", "Slovakia"], ["si", "Slovenia"], ["sb", "Solomon Islands"],
    ["so", "Somalia"], ["za", "South Africa"], ["kr", "South Korea"], ["ss", "South Sudan"], ["es", "Spain"],
    ["lk", "Sri Lanka"], ["sd", "Sudan"], ["sr", "Suriname"], ["se", "Sweden"], ["ch", "Switzerland"],
    ["sy", "Syria"], ["tw", "Taiwan"], ["tj", "Tajikistan"], ["tz", "Tanzania"], ["th", "Thailand"],
    ["tl", "Timor-Leste"], ["tg", "Togo"], ["to", "Tonga"], ["tt", "Trinidad and Tobago"], ["tn", "Tunisia"],
    ["tr", "Turkey"], ["tm", "Turkmenistan"], ["tv", "Tuvalu"], ["ug", "Uganda"], ["ua", "Ukraine"],
    ["ae", "United Arab Emirates"], ["gb", "United Kingdom"], ["us", "United States"], ["uy", "Uruguay"],
    ["uz", "Uzbekistan"], ["vu", "Vanuatu"], ["va", "Vatican City"], ["ve", "Venezuela"], ["vn", "Vietnam"],
    ["ye", "Yemen"], ["zm", "Zambia"], ["zw", "Zimbabwe"],
  ];
  return list
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
})();

export const MAX_COUNTRIES = 5;
export const MAX_LANGUAGES = 5;

export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "pt", name: "Portuguese" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "ru", name: "Russian" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "hi", name: "Hindi" },
  { code: "ar", name: "Arabic" },
  { code: "tr", name: "Turkish" },
  { code: "pl", name: "Polish" },
  { code: "nl", name: "Dutch" },
  { code: "sv", name: "Swedish" },
  { code: "no", name: "Norwegian" },
  { code: "fi", name: "Finnish" },
  { code: "da", name: "Danish" },
  { code: "cs", name: "Czech" },
  { code: "el", name: "Greek" },
  { code: "he", name: "Hebrew" },
  { code: "id", name: "Indonesian" },
  { code: "vi", name: "Vietnamese" },
  { code: "th", name: "Thai" },
  { code: "bn", name: "Bengali" },
  { code: "ur", name: "Urdu" },
  { code: "uk", name: "Ukrainian" },
  { code: "fa", name: "Persian" },
  { code: "ro", name: "Romanian" },
  { code: "hu", name: "Hungarian" },
];

const KEY = "drift-prefs-v1";
let initializedForPageLoad = false;

export function defaultPrefs() {
  return {
    countries: [],
    languages: [],
    gender: null,
    myCountry: null,
    myGender: null,
  };
}

export function loadPrefs() {
  try {
    if (!initializedForPageLoad) {
      localStorage.removeItem(KEY);
      initializedForPageLoad = true;
      return defaultPrefs();
    }
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    const d = defaultPrefs();
    if (!raw || typeof raw !== "object") return d;
    return {
      countries: Array.isArray(raw.countries) ? raw.countries.filter((c) => typeof c === "string").slice(0, 5) : [],
      languages: Array.isArray(raw.languages) ? raw.languages.filter((c) => typeof c === "string").slice(0, 5) : [],
      gender: raw.gender === "male" || raw.gender === "female" ? raw.gender : null,
      myCountry: typeof raw.myCountry === "string" ? raw.myCountry : null,
      myGender: raw.myGender === "male" || raw.myGender === "female" ? raw.myGender : null,
    };
  } catch {
    return defaultPrefs();
  }
}

export function savePrefs(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode etc. — non-fatal */
  }
}

/** Number of ACTIVE partner-filters (not about-me fields). */
export function activeCount(p) {
  if (!p) return 0;
  return (p.countries?.length || 0) + (p.languages?.length || 0) + (p.gender ? 1 : 0);
}

/** Payload for `match:find`. */
export function toFindPayload(mode, p) {
  let myLanguage = null;
  try {
    const nav = (typeof navigator !== "undefined" && navigator.language) || "";
    myLanguage = nav.split("-")[0].toLowerCase() || null;
  } catch {
    myLanguage = null;
  }
  return {
    mode,
    prefs: {
      countries: p.countries || [],
      languages: p.languages || [],
      gender: p.gender || null,
      myCountry: p.myCountry || null,
      myGender: p.myGender || null,
      myLanguage,
    },
  };
}
