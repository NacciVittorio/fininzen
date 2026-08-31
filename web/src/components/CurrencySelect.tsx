"use client";

const ASSET_CURRENCIES = [
    ["EUR", "EUR — Euro"],
    ["USD", "USD — US Dollar"],
    ["GBP", "GBP — British Pound"],
    ["CHF", "CHF — Swiss Franc"],
    ["JPY", "JPY — Japanese Yen"],
    ["CAD", "CAD — Canadian Dollar"],
    ["AUD", "AUD — Australian Dollar"],
    ["NZD", "NZD — New Zealand Dollar"],
    ["SEK", "SEK — Swedish Krona"],
    ["NOK", "NOK — Norwegian Krone"],
    ["DKK", "DKK — Danish Krone"],
    ["PLN", "PLN — Polish Zloty"],
    ["CZK", "CZK — Czech Koruna"],
    ["HUF", "HUF — Hungarian Forint"],
    ["RON", "RON — Romanian Leu"],
] as const;

export default function CurrencySelect({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) {
    const currency = (value || "EUR").toUpperCase();
    const isListed = ASSET_CURRENCIES.some(([code]) => code === currency);

    return (
        <select
            className="inp"
            value={currency}
            onChange={(event) => onChange(event.target.value)}
        >
            {!isListed && <option value={currency}>{currency}</option>}
            {ASSET_CURRENCIES.map(([code, label]) => (
                <option key={code} value={code}>
                    {label}
                </option>
            ))}
        </select>
    );
}
