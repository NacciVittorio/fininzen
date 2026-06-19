// Friendly aliases over the auto-generated OpenAPI types in `schema.d.ts`.
//
// `schema.d.ts` is generated from the backend (`just schema` -> openapi.json ->
// `npm run generate:api`) and must not be edited by hand. Import the named
// aliases below from components rather than re-declaring response shapes, so the
// backend serializers stay the single source of truth and a serializer change
// surfaces here as a type error.
import type { components } from "./schema";

export type Schemas = components["schemas"];

// Portfolio
export type Asset = Schemas["Asset"];
export type InvestmentType = Schemas["InvestmentType"];
export type ContributionSource = Schemas["ContributionSource"];
export type RecurringInvestmentPlan = Schemas["RecurringInvestmentPlan"];

// Expenses
export type Expense = Schemas["Expense"];
export type Category = Schemas["Category"];
export type Subcategory = Schemas["Subcategory"];
export type Budget = Schemas["Budget"];
export type RecurringExpense = Schemas["RecurringExpense"];

// Auth
export type TokenObtainPair = Schemas["TokenObtainPair"];
export type TokenRefresh = Schemas["TokenRefresh"];
export type UserRegister = Schemas["UserRegister"];
