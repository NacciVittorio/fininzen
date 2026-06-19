"""
portfolio/serializers.py — Serializzatori per il portafoglio.
"""

from rest_framework import serializers
from finnet.utils import serializer_user
from .models import (
    AllocationTarget,
    Asset,
    AssetContributionSource,
    AssetTransaction,
    ContributionSource,
    InvestmentType,
    PortfolioSnapshot,
    RecurringInvestmentPlan,
)
from .price_providers import (
    borsa_detail_url,
    looks_like_borsa_fund_identifier,
    normalize_borsa_symbol,
)


def _bank_accounts_for(user):
    if not user:
        return Asset.objects.none()
    return Asset.objects.filter(
        owner=user,
        tracking_type=Asset.MANUAL,
        investment_type__is_bank_account=True,
        is_archived=False,
    )


class InvestmentTypeSerializer(serializers.ModelSerializer):
    asset_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = InvestmentType
        fields = [
            "id",
            "name",
            "color",
            "icon",
            "supports_ticker",
            "is_liquid_default",
            "is_bank_account",
            "supports_contribution_source",
            "tax_rate",
            "asset_count",
        ]


class ContributionSourceSerializer(serializers.ModelSerializer):
    transaction_count = serializers.SerializerMethodField(read_only=True)
    asset_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ContributionSource
        fields = [
            "id",
            "name",
            "sort_order",
            "is_active",
            "transaction_count",
            "asset_count",
        ]

    def get_transaction_count(self, obj):
        count = getattr(obj, "transaction_count", None)
        return count if count is not None else obj.transactions.count()

    def get_asset_count(self, obj):
        count = getattr(obj, "asset_count", None)
        return count if count is not None else obj.asset_links.count()


class AssetSerializer(serializers.ModelSerializer):
    gain = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    gain_percent = serializers.DecimalField(
        max_digits=8, decimal_places=2, read_only=True
    )
    has_ticker = serializers.BooleanField(read_only=True)
    investment_type_detail = InvestmentTypeSerializer(
        source="investment_type", read_only=True
    )
    source_account_name = serializers.SerializerMethodField(read_only=True)
    supports_contribution_source = serializers.BooleanField(read_only=True)
    contribution_source_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        write_only=True,
    )
    custom_contribution_source_ids = serializers.SerializerMethodField(read_only=True)
    available_contribution_sources = serializers.SerializerMethodField(read_only=True)
    eur_complete = serializers.SerializerMethodField(read_only=True)
    effective_tax_rate = serializers.DecimalField(
        max_digits=5, decimal_places=4, read_only=True
    )
    tax_cost_basis = serializers.SerializerMethodField(read_only=True)

    def get_source_account_name(self, obj):
        return obj.source_account.name if obj.source_account_id else None

    def get_eur_complete(self, obj):
        # HIGH-05: recompute zeroes invested_capital_eur/current_value_eur to None
        # when historical or live FX is missing for a non-EUR asset, but the API
        # never said *why* the EUR figure was absent. Surface a single boolean so
        # the UI can flag "EUR value incomplete (missing exchange-rate history)"
        # instead of silently rendering a blank. EUR-denominated assets need no
        # conversion and are always complete.
        currency = (obj.currency or "EUR").upper()
        if currency in ("EUR", ""):
            return True
        return (
            obj.current_value_eur is not None and obj.invested_capital_eur is not None
        )

    def get_custom_contribution_source_ids(self, obj):
        return list(
            obj.contribution_source_links.order_by(
                "sort_order",
                "contribution_source__sort_order",
                "contribution_source__name",
            ).values_list("contribution_source_id", flat=True)
        )

    def get_available_contribution_sources(self, obj):
        from .services import available_contribution_sources_for_asset

        sources = available_contribution_sources_for_asset(obj)
        return [
            {
                "id": source.id,
                "name": source.name,
                "sort_order": source.sort_order,
                "is_active": source.is_active,
            }
            for source in sources
        ]

    def get_tax_cost_basis(self, obj):
        if obj.tracking_type == Asset.MANUAL:
            return obj.invested_capital or 0
        from .services import remaining_tax_cost_basis

        return remaining_tax_cost_basis(obj)

    def _set_contribution_sources(self, asset, source_ids):
        if source_ids is None:
            return
        user = asset.owner or serializer_user(self)
        ordered_ids = []
        seen = set()
        for raw in source_ids:
            source_id = int(raw)
            if source_id not in seen:
                seen.add(source_id)
                ordered_ids.append(source_id)

        sources = list(
            ContributionSource.objects.filter(
                owner=user,
                is_active=True,
                pk__in=ordered_ids,
            )
        )
        found_ids = {source.pk for source in sources}
        missing = [source_id for source_id in ordered_ids if source_id not in found_ids]
        if missing:
            raise serializers.ValidationError(
                {"contribution_source_ids": "One or more sources are invalid."}
            )

        by_id = {source.pk: source for source in sources}
        AssetContributionSource.objects.filter(owner=user, asset=asset).delete()
        AssetContributionSource.objects.bulk_create(
            [
                AssetContributionSource(
                    owner=user,
                    asset=asset,
                    contribution_source=by_id[source_id],
                    sort_order=idx,
                )
                for idx, source_id in enumerate(ordered_ids)
            ]
        )

    class Meta:
        model = Asset
        fields = [
            "id",
            "name",
            "tracking_type",
            "ticker",
            "price_source",
            "source_symbol",
            "source_url",
            "isin",
            "investment_type",
            "investment_type_detail",
            "is_liquid",
            "shares",
            "price_per_share",
            "currency",
            "invested_capital",
            "current_value",
            "opening_balance",
            "opening_balance_date",
            "current_value_eur",
            "invested_capital_eur",
            "tax_cost_basis",
            "tax_rate_override",
            "tax",
            "effective_tax_rate",
            "eur_complete",
            "balance_as_of",
            "notes",
            "source_account",
            "source_account_name",
            "contribution_source_mode",
            "supports_contribution_source",
            "contribution_source_ids",
            "custom_contribution_source_ids",
            "available_contribution_sources",
            "last_price_update",
            "created_at",
            "is_archived",
            "archived_at",
            "gain",
            "gain_percent",
            "has_ticker",
        ]
        read_only_fields = [
            "last_price_update",
            "created_at",
            "archived_at",
            "current_value_eur",
            "invested_capital_eur",
            "opening_balance",
            "opening_balance_date",
            "balance_as_of",
        ]

    def get_fields(self):
        fields = super().get_fields()
        user = serializer_user(self)
        fields["investment_type"].queryset = (
            InvestmentType.objects.filter(owner=user)
            if user
            else InvestmentType.objects.none()
        )
        fields["source_account"].queryset = _bank_accounts_for(user)
        return fields

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        source_account = attrs.get(
            "source_account", instance.source_account if instance else None
        )
        if instance and source_account and source_account.pk == instance.pk:
            raise serializers.ValidationError(
                {"source_account": "Un asset non può essere detenuto presso sé stesso."}
            )

        tracking_type = attrs.get(
            "tracking_type",
            instance.tracking_type if instance else Asset.AUTO,
        )
        if tracking_type == Asset.MANUAL:
            return attrs

        price_source = attrs.get(
            "price_source",
            instance.price_source if instance else Asset.PRICE_SOURCE_AUTO,
        )
        ticker = attrs.get("ticker", instance.ticker if instance else "")
        source_symbol = attrs.get(
            "source_symbol", instance.source_symbol if instance else ""
        )
        source_url = attrs.get("source_url", instance.source_url if instance else "")
        raw_identifier = source_url or source_symbol or ticker

        forced_borsa = price_source == Asset.PRICE_SOURCE_BORSA_ITALIANA
        auto_borsa = (
            price_source == Asset.PRICE_SOURCE_AUTO
            and looks_like_borsa_fund_identifier(raw_identifier)
        )
        if not (forced_borsa or auto_borsa):
            return attrs

        symbol = normalize_borsa_symbol(raw_identifier)
        if not symbol:
            return attrs

        attrs["price_source"] = price_source
        attrs["source_symbol"] = symbol
        attrs["source_url"] = source_url or borsa_detail_url(symbol)
        if not ticker or ticker.startswith("http"):
            attrs["ticker"] = symbol
        return attrs

    def create(self, validated_data):
        contribution_source_ids = validated_data.pop("contribution_source_ids", None)
        asset = super().create(validated_data)
        self._set_contribution_sources(asset, contribution_source_ids)
        return asset

    def update(self, instance, validated_data):
        contribution_source_ids = validated_data.pop("contribution_source_ids", None)
        asset = super().update(instance, validated_data)
        self._set_contribution_sources(asset, contribution_source_ids)
        return asset


class AssetTransactionSerializer(serializers.ModelSerializer):
    total_value = serializers.DecimalField(
        max_digits=15, decimal_places=2, read_only=True
    )
    contribution_source_detail = serializers.SerializerMethodField(read_only=True)
    contribution_source_name = serializers.SerializerMethodField(read_only=True)
    linked_account_id = serializers.SerializerMethodField(read_only=True)
    linked_account_name = serializers.SerializerMethodField(read_only=True)
    linked_account_direction = serializers.SerializerMethodField(read_only=True)
    tax_cost_basis = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = AssetTransaction
        fields = [
            "id",
            "asset",
            "transaction_type",
            "date",
            "shares",
            "price_per_share",
            "total_value",
            "fee",
            "tax_amount",
            "tax_amount_is_manual",
            "tax_cost_basis",
            "fx_rate_to_eur",
            "gross_amount_eur",
            "fee_eur",
            "tax_amount_eur",
            "notes",
            "derived_from",
            "derived_kind",
            "contribution_source",
            "contribution_source_detail",
            "contribution_source_name",
            "linked_account_id",
            "linked_account_name",
            "linked_account_direction",
            "is_verified",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "asset",
            "derived_from",
            "derived_kind",
            "fx_rate_to_eur",
            "gross_amount_eur",
            "fee_eur",
            "tax_amount_eur",
            "created_at",
        ]

    def get_fields(self):
        fields = super().get_fields()
        user = serializer_user(self)
        fields["contribution_source"].queryset = (
            ContributionSource.objects.filter(owner=user, is_active=True)
            if user
            else ContributionSource.objects.none()
        )
        return fields

    def get_contribution_source_detail(self, obj):
        if not obj.contribution_source_id:
            return None
        return {
            "id": obj.contribution_source_id,
            "name": obj.contribution_source.name,
            "sort_order": obj.contribution_source.sort_order,
        }

    def get_contribution_source_name(self, obj):
        return obj.contribution_source.name if obj.contribution_source_id else ""

    def _linked_account_mirror(self, obj):
        expected_type = {
            AssetTransaction.BUY: AssetTransaction.CASH_OUT,
            AssetTransaction.SELL: AssetTransaction.CASH_IN,
        }.get(obj.transaction_type)
        if not expected_type:
            return None
        derived = getattr(obj, "_linked_account_derived", None)
        if derived is not None:
            return next(
                (
                    tx
                    for tx in derived
                    if tx.transaction_type == expected_type
                    and tx.derived_kind == AssetTransaction.DERIVED_PRINCIPAL
                ),
                None,
            )
        return (
            obj.derived_txs.filter(
                transaction_type=expected_type,
                derived_kind=AssetTransaction.DERIVED_PRINCIPAL,
            )
            .select_related("asset")
            .first()
        )

    def get_linked_account_id(self, obj):
        mirror = self._linked_account_mirror(obj)
        return mirror.asset_id if mirror else None

    def get_linked_account_name(self, obj):
        mirror = self._linked_account_mirror(obj)
        return mirror.asset.name if mirror else None

    def get_linked_account_direction(self, obj):
        if obj.transaction_type == AssetTransaction.BUY:
            return "source" if self._linked_account_mirror(obj) else None
        if obj.transaction_type == AssetTransaction.SELL:
            return "destination" if self._linked_account_mirror(obj) else None
        return None

    def get_tax_cost_basis(self, obj):
        if obj.transaction_type != AssetTransaction.SELL:
            return "0.00"
        from .services import _q2, tax_cost_basis_for_sell

        return str(_q2(tax_cost_basis_for_sell(obj.asset, obj)))

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        tx_type = attrs.get(
            "transaction_type",
            instance.transaction_type if instance else AssetTransaction.BUY,
        )
        price = attrs.get(
            "price_per_share", instance.price_per_share if instance else None
        )
        if price is not None:
            if tx_type == AssetTransaction.ADJUSTMENT:
                if price == 0:
                    raise serializers.ValidationError(
                        {"price_per_share": "La rettifica non può essere zero."}
                    )
            elif price <= 0:
                raise serializers.ValidationError(
                    {"price_per_share": "L'importo deve essere maggiore di zero."}
                )
        return attrs


class PortfolioSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioSnapshot
        fields = [
            "id",
            "total_value",
            "liquid_value",
            "illiquid_value",
            "snapshot_date",
            "snapshot_day",
            "by_asset_class",
            "by_asset",
        ]
        read_only_fields = ["id", "snapshot_date", "snapshot_day"]


class AllocationTargetSerializer(serializers.ModelSerializer):
    class Meta:
        model = AllocationTarget
        fields = ["id", "investment_type", "target_percent"]

    def get_fields(self):
        fields = super().get_fields()
        user = serializer_user(self)
        fields["investment_type"].queryset = (
            InvestmentType.objects.filter(owner=user)
            if user
            else InvestmentType.objects.none()
        )
        return fields


class RecurringInvestmentPlanSerializer(serializers.ModelSerializer):
    asset_name = serializers.SerializerMethodField(read_only=True)
    source_account_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = RecurringInvestmentPlan
        fields = [
            "id",
            "name",
            "asset",
            "asset_name",
            "source_account",
            "source_account_name",
            "amount",
            "frequency",
            "day_of_week",
            "day_of_month",
            "anchor_month",
            "generated_transactions_verified",
            "is_active",
            "status",
            "start_date",
            "end_date",
            "disabled_at",
            "deleted_at",
            "created_at",
        ]
        read_only_fields = ["created_at", "disabled_at", "deleted_at"]

    def get_asset_name(self, obj):
        return obj.asset.name if obj.asset_id else ""

    def get_source_account_name(self, obj):
        return obj.source_account.name if obj.source_account_id else ""

    def get_fields(self):
        fields = super().get_fields()
        user = serializer_user(self)
        fields["asset"].queryset = (
            Asset.objects.filter(
                owner=user, tracking_type=Asset.AUTO, is_archived=False
            )
            if user
            else Asset.objects.none()
        )
        fields["source_account"].queryset = _bank_accounts_for(user)
        return fields

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        asset = attrs.get("asset", instance.asset if instance else None)
        source_account = attrs.get(
            "source_account", instance.source_account if instance else None
        )
        start_date = attrs.get("start_date", instance.start_date if instance else None)
        end_date = attrs.get("end_date", instance.end_date if instance else None)
        frequency = attrs.get(
            "frequency",
            instance.frequency
            if instance
            else RecurringInvestmentPlan.FREQUENCY_MONTHLY,
        )
        day_of_week = attrs.get(
            "day_of_week", instance.day_of_week if instance else None
        )
        anchor_month = attrs.get(
            "anchor_month", instance.anchor_month if instance else None
        )
        status = attrs.get("status", instance.status if instance else None)
        is_active = attrs.get("is_active", instance.is_active if instance else True)
        owner = serializer_user(self)

        if not start_date:
            raise serializers.ValidationError(
                {"start_date": "Questo campo è obbligatorio."}
            )
        if end_date and end_date < start_date:
            raise serializers.ValidationError(
                {
                    "end_date": "La data di fine non può essere precedente alla data di inizio."
                }
            )
        if asset:
            if not owner or asset.owner_id != owner.id:
                raise serializers.ValidationError({"asset": "Asset non valido."})
            if asset.tracking_type != Asset.AUTO:
                raise serializers.ValidationError(
                    {"asset": "Il PAC richiede un asset automatico quotato."}
                )
            if asset.is_archived:
                raise serializers.ValidationError(
                    {"asset": "Non puoi creare un PAC su un asset archiviato."}
                )
        if source_account:
            if not owner or source_account.owner_id != owner.id:
                raise serializers.ValidationError(
                    {"source_account": "Account non valido."}
                )
            if source_account.tracking_type != Asset.MANUAL or not (
                source_account.investment_type
                and source_account.investment_type.is_bank_account
            ):
                raise serializers.ValidationError(
                    {"source_account": "Il conto sorgente deve essere un bank account."}
                )
        if asset and source_account and asset.pk == source_account.pk:
            raise serializers.ValidationError(
                {"source_account": "Asset e conto sorgente devono essere diversi."}
            )
        if frequency == RecurringInvestmentPlan.FREQUENCY_WEEKLY:
            if day_of_week is None:
                attrs["day_of_week"] = start_date.isoweekday()
            elif not 1 <= int(day_of_week) <= 7:
                raise serializers.ValidationError(
                    {"day_of_week": "Il giorno deve essere compreso tra 1 e 7."}
                )
            attrs["anchor_month"] = None
        else:
            attrs["day_of_week"] = None
            if frequency in {
                RecurringInvestmentPlan.FREQUENCY_QUARTERLY,
                RecurringInvestmentPlan.FREQUENCY_SEMIANNUAL,
                RecurringInvestmentPlan.FREQUENCY_ANNUAL,
            }:
                if anchor_month is None:
                    attrs["anchor_month"] = start_date.month
                elif not 1 <= int(anchor_month) <= 12:
                    raise serializers.ValidationError(
                        {"anchor_month": "Il mese deve essere compreso tra 1 e 12."}
                    )
            else:
                attrs["anchor_month"] = None

        if status == RecurringInvestmentPlan.STATUS_DELETED:
            attrs["is_active"] = False
        elif "is_active" in attrs and "status" not in attrs:
            attrs["status"] = (
                RecurringInvestmentPlan.STATUS_ACTIVE
                if is_active
                else RecurringInvestmentPlan.STATUS_DISABLED
            )
        elif "status" in attrs and "is_active" not in attrs:
            attrs["is_active"] = status == RecurringInvestmentPlan.STATUS_ACTIVE
        return attrs
