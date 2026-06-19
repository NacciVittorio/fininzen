export function InvestmentTypesPanel({
  T,
  investmentTypes,
  contributionSources,
  handleEditInvType,
  openDeleteInvTypeFlow,
  openNewInvType,
  openNewContributionSource,
  openEditContributionSource,
  openDeleteContributionSourceFlow,
}) {
  const filtered = investmentTypes.filter((type) => !type.is_bank_account);

  return (
    <div>
      <InvestmentTypeList
        T={T}
        investmentTypes={filtered}
        emptyLabel={T("no_inv_types")}
        handleEditInvType={handleEditInvType}
        openDeleteInvTypeFlow={openDeleteInvTypeFlow}
      />
      <button
        className="btn btn-g"
        style={{ width: "100%", marginTop: 14, padding: "12px" }}
        onClick={() => openNewInvType("investments")}
      >
        + {T("add_investment_type")}
      </button>
      <ContributionSourcesPanel
        T={T}
        contributionSources={contributionSources}
        openNewContributionSource={openNewContributionSource}
        openEditContributionSource={openEditContributionSource}
        openDeleteContributionSourceFlow={openDeleteContributionSourceFlow}
      />
    </div>
  );
}

export function AccountTypesPanel({
  T,
  investmentTypes,
  handleEditInvType,
  openDeleteInvTypeFlow,
  openNewInvType,
}) {
  const filtered = investmentTypes.filter((type) => type.is_bank_account);

  return (
    <div>
      <InvestmentTypeList
        T={T}
        investmentTypes={filtered}
        emptyLabel={T("no_account_types")}
        handleEditInvType={handleEditInvType}
        openDeleteInvTypeFlow={openDeleteInvTypeFlow}
      />
      <button
        className="btn btn-g"
        style={{ width: "100%", marginTop: 14, padding: "12px" }}
        onClick={() => openNewInvType("account_types")}
      >
        + {T("add_account_type")}
      </button>
    </div>
  );
}

function InvestmentTypeList({
  T,
  investmentTypes,
  emptyLabel,
  handleEditInvType,
  openDeleteInvTypeFlow,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {investmentTypes.map((invType) => (
        <InvestmentTypeRow
          key={invType.id}
          T={T}
          invType={invType}
          handleEditInvType={handleEditInvType}
          openDeleteInvTypeFlow={openDeleteInvTypeFlow}
        />
      ))}
      {investmentTypes.length === 0 && (
        <div
          style={{
            textAlign: "center",
            color: "var(--fg-soft)",
            fontSize: 13,
            padding: "30px 0",
          }}
        >
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

function InvestmentTypeRow({
  T,
  invType,
  handleEditInvType,
  openDeleteInvTypeFlow,
}) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="between">
        <div
          className="row"
          style={{
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            flex: 1,
          }}
          onClick={() => handleEditInvType(invType)}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: `${invType.color}22`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            {invType.icon}
          </div>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: invType.color,
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{invType.name}</div>
            <div
              style={{ fontSize: 11, color: "var(--fg-soft)", marginTop: 1 }}
            >
              {invType.asset_count || 0} {T("assets")}
              {invType.supports_ticker ? " · ticker" : ""}
              {invType.supports_contribution_source
                ? ` · ${T("contribution_source_short")}`
                : ""}
              {invType.is_liquid_default
                ? ` · ${T("liquid")}`
                : ` · ${T("illiquid")}`}
            </div>
          </div>
        </div>
        <button
          className="btn btn-g btn-sm"
          onClick={() => openDeleteInvTypeFlow(invType)}
          style={{ color: "var(--danger)", padding: "5px 8px" }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function ContributionSourcesPanel({
  T,
  contributionSources,
  openNewContributionSource,
  openEditContributionSource,
  openDeleteContributionSourceFlow,
}) {
  return (
    <div style={{ marginTop: 22 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)" }}>
          {T("contribution_sources")}
        </div>
        <button
          className="btn btn-g btn-sm"
          onClick={openNewContributionSource}
        >
          + {T("add_contribution_source")}
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {contributionSources.map((source) => (
          <div key={source.id} className="card" style={{ padding: 14 }}>
            <div className="between">
              <div
                style={{ cursor: "pointer", minWidth: 0, flex: 1 }}
                onClick={() => openEditContributionSource(source)}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color:
                      source.is_active === false
                        ? "var(--fg-soft)"
                        : "var(--fg)",
                  }}
                >
                  {source.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--fg-soft)",
                    marginTop: 2,
                  }}
                >
                  {source.transaction_count || 0} {T("transactions")} ·{" "}
                  {source.asset_count || 0} {T("assets")}
                  {source.is_active === false ? ` · ${T("inactive")}` : ""}
                </div>
              </div>
              <button
                className="btn btn-g btn-sm"
                onClick={() => openDeleteContributionSourceFlow(source)}
                style={{ color: "var(--danger)", padding: "5px 8px" }}
              >
                ×
              </button>
            </div>
          </div>
        ))}
        {contributionSources.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "var(--fg-soft)",
              fontSize: 13,
              padding: "24px 0",
            }}
          >
            {T("no_contribution_sources")}
          </div>
        )}
      </div>
    </div>
  );
}
