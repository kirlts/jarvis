/**
 * PhoneInput — International phone number input with country code selector.
 *
 * Uses libphonenumber-js for:
 * - Validation against real-world numbering plans
 * - Auto-formatting as-you-type (national format)
 * - E.164 normalization for storage
 *
 * Design:
 * - Integrated country code dropdown with flag emoji
 * - Auto-format on blur (e.g. +56 9 9417 2921)
 * - Chile (+56) pre-selected by default
 * - Stores E.164 format internally (e.g. +56994172921)
 *
 * Props:
 * - value: E.164 string or raw digits
 * - onChange: (e164Value: string) => void — receives clean E.164 on every change
 * - placeholder?: string
 * - id?: string
 */
import { useState, useEffect, useRef, useMemo } from "react";
import {
  parsePhoneNumberFromString,
  AsYouType,
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js";

// ── Country list with flag emoji ────────────────────────────────────────
// We define a curated list of Latin American + common countries first,
// then fill in the rest alphabetically.
const PRIORITY_COUNTRIES: CountryCode[] = [
  "CL", "AR", "PE", "CO", "MX", "BR", "EC", "UY", "PY", "BO", "VE",
  "US", "ES", "GB", "DE", "FR", "IT",
];

function countryFlag(code: CountryCode): string {
  return code
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

interface CountryOption {
  code: CountryCode;
  dialCode: string;
  flag: string;
  label: string;
}

// Country name map (Spanish labels for relevant countries, English fallback)
const COUNTRY_NAMES: Partial<Record<CountryCode, string>> = {
  CL: "Chile", AR: "Argentina", PE: "Perú", CO: "Colombia", MX: "México",
  BR: "Brasil", EC: "Ecuador", UY: "Uruguay", PY: "Paraguay", BO: "Bolivia",
  VE: "Venezuela", US: "Estados Unidos", ES: "España", GB: "Reino Unido",
  DE: "Alemania", FR: "Francia", IT: "Italia", PT: "Portugal", CR: "Costa Rica",
  PA: "Panamá", DO: "Rep. Dominicana", GT: "Guatemala", HN: "Honduras",
  SV: "El Salvador", NI: "Nicaragua", CU: "Cuba", PR: "Puerto Rico",
  CA: "Canadá", AU: "Australia", NZ: "Nueva Zelanda", JP: "Japón",
  KR: "Corea del Sur", CN: "China", IN: "India", RU: "Rusia",
};

function buildCountryOptions(): CountryOption[] {
  const allCodes = getCountries();
  const prioritySet = new Set(PRIORITY_COUNTRIES);

  const makeOption = (code: CountryCode): CountryOption => ({
    code,
    dialCode: `+${getCountryCallingCode(code)}`,
    flag: countryFlag(code),
    label: COUNTRY_NAMES[code] || code,
  });

  const priorityOptions = PRIORITY_COUNTRIES
    .filter((c) => allCodes.includes(c))
    .map(makeOption);

  const restOptions = allCodes
    .filter((c) => !prioritySet.has(c))
    .map(makeOption)
    .sort((a, b) => a.label.localeCompare(b.label, "es"));

  return [...priorityOptions, ...restOptions];
}

interface Props {
  value: string;
  onChange: (e164Value: string) => void;
  placeholder?: string;
  id?: string;
}

/**
 * Format a phone number for display.
 * Returns formatted string like "+56 9 9417 2921" or raw input if unparseable.
 */
function formatForDisplay(e164: string, country: CountryCode): string {
  if (!e164) return "";
  const parsed = parsePhoneNumberFromString(e164, country);
  if (parsed && parsed.isValid()) {
    return parsed.formatInternational();
  }
  return e164;
}

/**
 * Detect country from an E.164 string.
 */
function detectCountry(e164: string): CountryCode {
  if (!e164) return "CL";
  const parsed = parsePhoneNumberFromString(e164);
  return (parsed?.country as CountryCode) || "CL";
}

export function PhoneInput({ value, onChange, placeholder, id }: Props) {
  const countries = useMemo(() => buildCountryOptions(), []);
  const [country, setCountry] = useState<CountryCode>(() => detectCountry(value));
  const [displayValue, setDisplayValue] = useState(() => {
    if (!value) return "";
    const parsed = parsePhoneNumberFromString(value, country);
    return parsed ? parsed.nationalNumber : value.replace(/^\+\d+/, "");
  });
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedCountry = countries.find((c) => c.code === country) || countries[0];

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setDropdownSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleInputChange = (raw: string) => {
    // Strip non-digit chars except leading +
    const digits = raw.replace(/[^\d]/g, "");
    setDisplayValue(digits);

    // Build E.164 and validate
    const fullNumber = `+${getCountryCallingCode(country)}${digits}`;
    const parsed = parsePhoneNumberFromString(fullNumber, country);

    if (parsed && parsed.isValid()) {
      setIsValid(true);
      onChange(parsed.format("E.164"));
    } else {
      setIsValid(digits.length > 0 ? false : null);
      onChange(fullNumber);
    }
  };

  const handleBlur = () => {
    // Auto-format on blur
    const fullNumber = `+${getCountryCallingCode(country)}${displayValue}`;
    const parsed = parsePhoneNumberFromString(fullNumber, country);
    if (parsed && parsed.isValid()) {
      // Show formatted national number
      setDisplayValue(parsed.nationalNumber);
      setIsValid(true);
    }
  };

  const handleCountrySelect = (code: CountryCode) => {
    setCountry(code);
    setShowDropdown(false);
    setDropdownSearch("");

    // Revalidate with new country
    if (displayValue) {
      const fullNumber = `+${getCountryCallingCode(code)}${displayValue}`;
      const parsed = parsePhoneNumberFromString(fullNumber, code);
      if (parsed && parsed.isValid()) {
        onChange(parsed.format("E.164"));
        setIsValid(true);
      } else {
        onChange(fullNumber);
        setIsValid(displayValue.length > 0 ? false : null);
      }
    }

    inputRef.current?.focus();
  };

  const filteredCountries = dropdownSearch
    ? countries.filter(
        (c) =>
          c.label.toLowerCase().includes(dropdownSearch.toLowerCase()) ||
          c.dialCode.includes(dropdownSearch) ||
          c.code.toLowerCase().includes(dropdownSearch.toLowerCase())
      )
    : countries;

  const borderColor =
    isValid === true
      ? "var(--success)"
      : isValid === false
      ? "var(--danger)"
      : "var(--border-subtle)";

  return (
    <div style={{ position: "relative" }} ref={dropdownRef}>
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          border: `1.5px solid ${borderColor}`,
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          transition: "border-color 0.2s ease",
          background: "var(--surface-0)",
        }}
      >
        {/* Country selector button */}
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-1)",
            padding: "var(--sp-2) var(--sp-2)",
            background: "var(--surface-1)",
            border: "none",
            borderRight: "1px solid var(--border-subtle)",
            cursor: "pointer",
            fontSize: "var(--text-sm)",
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            minWidth: "90px",
          }}
          title={`${selectedCountry.flag} ${selectedCountry.label} (${selectedCountry.dialCode})`}
        >
          <span style={{ fontSize: "1.1rem" }}>{selectedCountry.flag}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
            {selectedCountry.dialCode}
          </span>
          <span style={{ fontSize: "10px", opacity: 0.5, marginLeft: "2px" }}>▼</span>
        </button>

        {/* Phone number input */}
        <input
          ref={inputRef}
          id={id}
          type="tel"
          inputMode="numeric"
          value={displayValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder || "9 9417 2921"}
          style={{
            flex: 1,
            padding: "var(--sp-2) var(--sp-2)",
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: "var(--text-sm)",
            fontFamily: "var(--font-mono)",
            color: "var(--text-primary)",
            letterSpacing: "0.5px",
          }}
        />

        {/* Validation indicator */}
        {isValid !== null && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 var(--sp-2)",
              fontSize: "14px",
            }}
          >
            {isValid ? "✓" : "✗"}
          </div>
        )}
      </div>

      {/* Formatted preview */}
      {isValid && displayValue && (
        <div
          style={{
            marginTop: "4px",
            fontSize: "var(--text-xs)",
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {formatForDisplay(`+${getCountryCallingCode(country)}${displayValue}`, country)}
        </div>
      )}

      {/* Country dropdown */}
      {showDropdown && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 1000,
            maxHeight: "280px",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Search */}
          <div style={{ padding: "var(--sp-2)", borderBottom: "1px solid var(--border-subtle)" }}>
            <input
              autoFocus
              className="form-input"
              placeholder="Buscar país..."
              value={dropdownSearch}
              onChange={(e) => setDropdownSearch(e.target.value)}
              style={{ fontSize: "var(--text-sm)" }}
            />
          </div>

          {/* Options */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filteredCountries.map((c, i) => (
              <div
                key={c.code}
                onClick={() => handleCountrySelect(c.code)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--sp-2)",
                  padding: "var(--sp-2) var(--sp-3)",
                  cursor: "pointer",
                  background: c.code === country ? "var(--surface-2)" : "transparent",
                  borderBottom:
                    // Visual separator after priority countries
                    i === PRIORITY_COUNTRIES.length - 1
                      ? "1px solid var(--border-subtle)"
                      : "none",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background =
                    c.code === country ? "var(--surface-2)" : "transparent")
                }
              >
                <span style={{ fontSize: "1rem" }}>{c.flag}</span>
                <span style={{ flex: 1, fontSize: "var(--text-sm)" }}>{c.label}</span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-xs)",
                    color: "var(--text-tertiary)",
                  }}
                >
                  {c.dialCode}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Utility: Format an E.164 number for display in lists and badges.
 * e.g. "56994172921" → "+56 9 9417 2921"
 */
export function formatPhoneForDisplay(raw: string): string {
  if (!raw) return "";
  const normalized = raw.startsWith("+") ? raw : `+${raw}`;
  const parsed = parsePhoneNumberFromString(normalized);
  if (parsed && parsed.isValid()) {
    return parsed.formatInternational();
  }
  // Fallback: manual format for Chilean numbers
  if (raw.startsWith("56") && raw.length >= 11) {
    return `+${raw.substring(0, 2)} ${raw.substring(2, 3)} ${raw.substring(3, 7)} ${raw.substring(7)}`;
  }
  return normalized;
}
