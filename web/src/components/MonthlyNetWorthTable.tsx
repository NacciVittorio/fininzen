"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useApp } from "../context/useApp";
import { API } from "../utils/api";
import { useMediaQuery } from "../utils/useMediaQuery";
import MnwGrid from "./networth/MnwGrid";
import { getVisibleMonths } from "./networth/mnwConstants";
import MnwAssetList from "./networth/MnwAssetList";
import type { MnwMode, MnwMonthRange, MnwOverview } from "./networth/mnwTypes";

// Orchestrator for the monthly net worth section: owns prefs + data fetching
// and picks the presentation — full matrix grid on ≥1024px (macOS landscape),
// per-asset grouped list on smaller viewports (no horizontal scroll).
//
// The grid-vs-list split is intentional and stays per-viewport. Only the prefs
// (year/range/mode) are synced across devices via updateMonthlyOverviewPrefs,
// so both presentations request the same year → identical underlying numbers.
export default function MonthlyNetWorthTable() {
    const {
        T,
        apiFetch,
        monthlyOverview,
        monthlyOverviewAvailableYears,
        monthlyOverviewPrefs,
        updateMonthlyOverviewPrefs,
        monthlyOverviewRefreshKey,
    } = useApp();

    const isDesktop = useMediaQuery("(min-width: 1024px)");

    const { year, monthRange } = monthlyOverviewPrefs;
    // Compare mode is desktop-only: the mobile list replaces it with the
    // per-asset year selector in the detail sheet. The stored preference is
    // not erased — desktop keeps honoring it.
    const mode: MnwMode = isDesktop
        ? monthlyOverviewPrefs.mode || "single"
        : "single";
    const yearA = monthlyOverviewPrefs.yearA || new Date().getFullYear() - 1;
    const yearB = monthlyOverviewPrefs.yearB || new Date().getFullYear();
    const overview = monthlyOverview as unknown as MnwOverview | null;

    const [overviewA, setOverviewA] = useState<MnwOverview | null>(null);
    const [overviewB, setOverviewB] = useState<MnwOverview | null>(null);
    const [compareLoading, setCompareLoading] = useState(false);
    const [prevYearOverview, setPrevYearOverview] =
        useState<MnwOverview | null>(null);

    // Track last-seen year and overview to avoid a duplicate fetch when year
    // advances by 1: monthlyOverview in context still holds year-1 data while
    // AppContext's fetch for the new year is in flight.
    const prevYearVal = useRef(year);
    const prevOverviewRef = useRef<MnwOverview | null>(null);
    useEffect(() => {
        prevOverviewRef.current = overview;
    }, [overview]);

    const fetchOverviewForYear = useCallback(
        async (yr: number): Promise<MnwOverview | null> => {
            try {
                const res = await apiFetch(
                    `${API}/portfolio/monthly-overview/?year=${yr}`,
                );
                if (!res.ok) return null;
                return (await res.json()) as MnwOverview;
            } catch {
                return null;
            }
        },
        [apiFetch],
    );

    useEffect(() => {
        if (mode !== "compare") return;
        setCompareLoading(true);
        setOverviewA(null);
        setOverviewB(null);
        Promise.all([
            fetchOverviewForYear(yearA),
            fetchOverviewForYear(yearB),
        ]).then(([a, b]) => {
            setOverviewA(a);
            setOverviewB(b);
            setCompareLoading(false);
        });
    }, [mode, yearA, yearB, monthlyOverviewRefreshKey, fetchOverviewForYear]);

    // Updates state + localStorage cache + server sync (see context helper).
    const updatePrefs = updateMonthlyOverviewPrefs;

    // The fetch on year change is driven by AppContext's effect that watches
    // monthlyOverviewPrefs.year, so changeYear only needs to update prefs.
    const changeYear = useCallback(
        (delta: number) => {
            updatePrefs({ year: year + delta });
        },
        [year, updatePrefs],
    );

    // Fetch previous year data when visible months span into it (single mode,
    // grid only — the mobile list shows one month at a time).
    useEffect(() => {
        if (mode !== "single" || !isDesktop) return;
        const visMonths = getVisibleMonths(year, monthRange);
        const needsPrevYear = visMonths.some((vm) => vm.year === year - 1);
        if (needsPrevYear) {
            if (
                prevYearVal.current === year - 1 &&
                prevOverviewRef.current != null
            ) {
                // year advanced by exactly 1: context still holds year-1 data, reuse it
                setPrevYearOverview(prevOverviewRef.current);
            } else {
                fetchOverviewForYear(year - 1).then((data) => {
                    setPrevYearOverview(data);
                });
            }
        } else {
            setPrevYearOverview(null);
        }
        prevYearVal.current = year;
    }, [
        mode,
        isDesktop,
        year,
        monthRange,
        monthlyOverviewRefreshKey,
        fetchOverviewForYear,
    ]);

    const changeRange = useCallback(
        (range: MnwMonthRange) => updatePrefs({ monthRange: range }),
        [updatePrefs],
    );
    const setMode = useCallback(
        (m: MnwMode) => updatePrefs({ mode: m }),
        [updatePrefs],
    );

    if (!isDesktop) {
        return (
            <MnwAssetList
                monthlyOverview={overview}
                year={year}
                onYearChange={(yr) => updatePrefs({ year: yr })}
                availableYears={monthlyOverviewAvailableYears}
                fetchOverviewForYear={fetchOverviewForYear}
                T={T}
            />
        );
    }

    return (
        <MnwGrid
            mode={mode}
            setMode={setMode}
            monthRange={monthRange}
            changeRange={changeRange}
            yearA={yearA}
            yearB={yearB}
            updatePrefs={updatePrefs}
            year={year}
            changeYear={changeYear}
            availableYears={monthlyOverviewAvailableYears}
            T={T}
            compareLoading={compareLoading}
            overviewA={overviewA}
            overviewB={overviewB}
            monthlyOverview={overview}
            prevYearOverview={prevYearOverview}
        />
    );
}
