import { useApp } from "../context/useApp";
import { Icon } from "./ui";

export default function PrivacyValue({
  scope,
  field,
  children,
  value,
  className,
  style,
  revealControl = false,
}) {
  const app = useApp();
  const T = app?.T ?? ((key, fallback) => fallback ?? key);
  const isValueHidden = app?.isValueHidden ?? (() => false);
  const isPrivacyScopeEnabled = app?.isPrivacyScopeEnabled ?? (() => false);
  const isPrivacyScopeTemporarilyRevealed =
    app?.isPrivacyScopeTemporarilyRevealed ?? (() => false);
  const revealPrivacyValue = app?.revealPrivacyValue ?? (() => {});
  const hidePrivacyScope = app?.hidePrivacyScope ?? (() => {});
  const content = children ?? value;
  const hasSectionPrivacy = revealControl && isPrivacyScopeEnabled(scope);
  const isSectionRevealed = isPrivacyScopeTemporarilyRevealed(scope);

  if (!isValueHidden(scope, field)) {
    return (
      <span
        className={className}
        style={
          hasSectionPrivacy
            ? {
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                maxWidth: "100%",
                ...style,
              }
            : style
        }
      >
        {content}
        {hasSectionPrivacy && isSectionRevealed && (
          <button
            type="button"
            className="privacy-reveal-btn"
            title={T("privacy_hide_now", "Hide now")}
            aria-label={T("privacy_hide_now", "Hide now")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              hidePrivacyScope(scope);
            }}
          >
            <Icon name="eyeOff" size={14} />
          </button>
        )}
        {hasSectionPrivacy && !isSectionRevealed && (
          <button
            type="button"
            className="privacy-reveal-btn"
            title={T("privacy_reveal_temp", "Reveal for 60 seconds")}
            aria-label={T("privacy_reveal_temp", "Reveal for 60 seconds")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              revealPrivacyValue(scope, field);
            }}
          >
            <Icon name="eye" size={14} />
          </button>
        )}
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        maxWidth: "100%",
        ...style,
      }}
    >
      <span aria-label={T("privacy_hidden_value", "Hidden value")}>•••••</span>
      {revealControl && (
        <button
          type="button"
          className="privacy-reveal-btn"
          title={T("privacy_reveal_temp", "Reveal for 60 seconds")}
          aria-label={T("privacy_reveal_temp", "Reveal for 60 seconds")}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            revealPrivacyValue(scope, field);
          }}
        >
          <Icon name="eye" size={14} />
        </button>
      )}
    </span>
  );
}
