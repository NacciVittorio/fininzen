"use client";

import FieldLabel from "../../../components/FieldLabel";
import { Icon } from "../../../components/ui";
import TickerResultsDrop from "../TickerResultsDrop";
import type { Translator } from "../../../types";
import type { AssetForm } from "../../../context/useAppProviderState";
import type {
    TickerResult,
    TickerSearchOrigin,
} from "../../../context/useImportAndTicker";

export default function TickerField({
    assetForm,
    tickerQuery,
    tickerResults,
    tickerLoading,
    showTickerDrop,
    tickerSearchOrigin,
    setShowTickerDrop,
    handleTickerInput,
    handleIsinInput,
    selectTicker,
    T,
}: {
    assetForm: AssetForm;
    tickerQuery: string;
    tickerResults: readonly TickerResult[];
    tickerLoading: boolean;
    showTickerDrop: boolean;
    tickerSearchOrigin: TickerSearchOrigin;
    setShowTickerDrop: (value: boolean) => void;
    handleTickerInput: (value: string) => void;
    handleIsinInput: (value: string) => void;
    selectTicker: (result: string | TickerResult) => void;
    T: Translator;
}) {
    return (
        <>
            <div style={{ position: "relative" }}>
                <FieldLabel text={T("label_ticker")} />
                <div style={{ position: "relative" }}>
                    <input
                        className="inp"
                        placeholder={T("placeholder_ticker")}
                        value={tickerQuery}
                        onChange={(event) =>
                            handleTickerInput(event.target.value)
                        }
                        onFocus={() =>
                            tickerResults.length > 0 && setShowTickerDrop(true)
                        }
                        onBlur={() =>
                            setTimeout(() => setShowTickerDrop(false), 150)
                        }
                        autoComplete="off"
                    />
                    {tickerLoading && (
                        <div
                            style={{
                                position: "absolute",
                                right: 12,
                                top: "50%",
                                transform: "translateY(-50%)",
                                fontSize: 12,
                                color: "var(--fg-soft)",
                            }}
                        >
                            <Icon name="refresh" size={16} />
                        </div>
                    )}
                </div>
                {showTickerDrop &&
                    tickerSearchOrigin === "ticker" &&
                    tickerResults.length > 0 && (
                        <TickerResultsDrop
                            results={tickerResults}
                            onSelect={selectTicker}
                            T={T}
                        />
                    )}
            </div>

            <div style={{ position: "relative" }}>
                <FieldLabel text={T("label_isin")} />
                <input
                    className="inp"
                    placeholder={T("placeholder_isin")}
                    value={assetForm.isin}
                    onChange={(event) => handleIsinInput(event.target.value)}
                    onFocus={() =>
                        tickerSearchOrigin === "isin" &&
                        tickerResults.length > 0 &&
                        setShowTickerDrop(true)
                    }
                    onBlur={() =>
                        setTimeout(() => setShowTickerDrop(false), 150)
                    }
                    maxLength={12}
                    autoComplete="off"
                />
                {showTickerDrop &&
                    tickerSearchOrigin === "isin" &&
                    tickerResults.length > 0 && (
                        <TickerResultsDrop
                            results={tickerResults}
                            onSelect={selectTicker}
                            T={T}
                        />
                    )}
                {assetForm.isin && !assetForm.ticker && (
                    <div
                        style={{
                            marginTop: 5,
                            color: "var(--warning)",
                            fontSize: 11,
                        }}
                    >
                        {tickerSearchOrigin === "isin" &&
                        showTickerDrop &&
                        !tickerLoading &&
                        tickerResults.length === 0
                            ? T("isin_no_match")
                            : T("isin_requires_symbol")}
                    </div>
                )}
            </div>
        </>
    );
}
