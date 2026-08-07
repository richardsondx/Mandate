use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fmt};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "String", into = "String")]
#[schemars(with = "String")]
pub struct AtomicAmount(String);

impl AtomicAmount {
    pub fn new(value: impl Into<String>) -> Result<Self, ApiError> {
        let value = value.into();
        if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
            return Err(ApiError::invalid(
                "amount must be an unsigned atomic-integer string",
            ));
        }
        let normalized = value.trim_start_matches('0');
        Ok(Self(if normalized.is_empty() {
            "0".into()
        } else {
            normalized.into()
        }))
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
    pub fn as_i128(&self) -> i128 {
        self.0.parse().expect("validated atomic amount")
    }
}

impl fmt::Display for AtomicAmount {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}
impl TryFrom<String> for AtomicAmount {
    type Error = ApiError;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::new(value)
    }
}
impl From<AtomicAmount> for String {
    fn from(value: AtomicAmount) -> Self {
        value.0
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AuthorityMode {
    Independent,
    Shared,
    ObserveOnly,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct Position {
    pub provider: String,
    pub asset: String,
    pub network: Option<String>,
    pub available: AtomicAmount,
    pub reserved: AtomicAmount,
    pub pending: AtomicAmount,
    pub settled: AtomicAmount,
    pub decimals: u8,
    pub reconciled_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct BalanceResponse {
    pub account_id: String,
    pub positions: Vec<Position>,
    pub estimated_usd_atomic: Option<AtomicAmount>,
    pub estimated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct MoneyRequest {
    pub account_id: String,
    pub amount: AtomicAmount,
    pub currency: String,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub idempotency_key: Option<String>,
    #[serde(default)]
    pub metadata: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct ReceiveRequest {
    pub account_id: String,
    #[serde(default = "default_usdc")]
    pub currency: String,
    #[serde(default)]
    pub network: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub idempotency_key: Option<String>,
}
fn default_usdc() -> String {
    "USDC".into()
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct TransferRequest {
    #[serde(flatten)]
    pub money: MoneyRequest,
    pub to: String,
    #[serde(default)]
    pub network: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct PaymentSessionRequest {
    #[serde(flatten)]
    pub money: MoneyRequest,
    pub mode: String,
    #[serde(default)]
    pub merchant: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct RefundRequest {
    #[serde(flatten)]
    pub money: MoneyRequest,
    pub transaction_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct Operation {
    pub id: String,
    pub kind: String,
    pub account_id: String,
    pub provider: String,
    pub status: String,
    pub amount: Option<AtomicAmount>,
    pub currency: Option<String>,
    pub external_url: Option<String>,
    pub address: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct TransactionRecord {
    pub id: String,
    pub account_id: String,
    pub operation_id: Option<String>,
    pub description: String,
    pub asset: String,
    pub entries: Vec<LedgerEntry>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct LedgerEntry {
    pub account: String,
    pub amount_atomic: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct TransactionsResponse {
    pub data: Vec<TransactionRecord>,
    pub next_cursor: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct EventRecord {
    pub id: i64,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct AgentCreateRequest {
    pub name: String,
    pub account_id: String,
    pub authority: AuthorityMode,
    pub capabilities: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct AgentUpdateRequest {
    pub name: String,
    pub authority: AuthorityMode,
    pub capabilities: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct AgentCredential {
    pub agent_id: String,
    pub token: String,
    pub account_id: String,
    pub capabilities: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct Principal {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct EconomicAccount {
    pub id: String,
    pub principal_id: String,
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct InstanceStatus {
    pub initialized: bool,
    pub runtimes: RuntimeDetection,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct SetupRequest {
    pub account_name: String,
    #[serde(default)]
    pub demo: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct AccountCreateRequest {
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct ProviderConnectRequest {
    pub account_id: String,
    pub provider_id: String,
    #[serde(default = "default_demo_mode")]
    pub mode: String,
    #[serde(default)]
    pub config: serde_json::Value,
}

fn default_demo_mode() -> String {
    "demo".into()
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct ProviderStatus {
    pub id: String,
    pub capabilities: Vec<String>,
    pub state: String,
    pub mode: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct CapabilityRelease {
    pub version: String,
    pub date: String,
    pub items: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct CapabilityProvider {
    pub id: String,
    pub display_name: String,
    pub category: String,
    pub description: String,
    pub agent_capabilities: Vec<String>,
    pub protocol_capabilities: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct CapabilityDefinition {
    pub id: String,
    pub title: String,
    pub intent_group: String,
    pub summary: String,
    pub description: String,
    pub direction: String,
    pub examples: Vec<String>,
    pub use_when: String,
    pub do_not_use_when: String,
    pub requires_provider_categories: Vec<String>,
    pub requires_provider_capabilities: Vec<String>,
    pub side_effect: String,
    pub mutation: bool,
    pub environments: Vec<String>,
    pub introduced: String,
    pub updated: String,
    pub flow: Vec<String>,
    pub tools: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct CapabilityManifest {
    pub schema_version: u32,
    pub spec_version: String,
    pub updated_at: String,
    pub releases: Vec<CapabilityRelease>,
    pub providers: Vec<CapabilityProvider>,
    pub capabilities: Vec<CapabilityDefinition>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct CapabilityAvailability {
    #[serde(flatten)]
    pub definition: CapabilityDefinition,
    pub granted: bool,
    pub available: bool,
    pub provider_ids: Vec<String>,
    pub environment: Option<String>,
    pub unavailable_reason: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct CapabilityAvailabilityResponse {
    pub account_id: String,
    pub spec_version: String,
    pub updated_at: String,
    pub releases: Vec<CapabilityRelease>,
    pub capabilities: Vec<CapabilityAvailability>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct AgentSummary {
    pub id: String,
    pub name: String,
    pub runtime: String,
    pub authority: AuthorityMode,
    pub capabilities: Vec<String>,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub installation_status: String,
    pub installation_detail: Option<String>,
}

/// Identity of the caller behind a credential, returned by token introspection
/// (`GET /v1/me`). Lets an agent discover its own account, authority, and
/// capabilities from its token alone, without out-of-band configuration.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct CallerIdentity {
    /// `true` when the credential is the local operator/administrator.
    pub is_admin: bool,
    /// Agent id, present only for agent-scoped credentials.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    /// Agent display name, present only for agent-scoped credentials.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Runtime label (`openclaw`, `hermes`, or `custom`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime: Option<String>,
    /// Economic account id the credential is scoped to.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    /// Human-readable economic account name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_name: Option<String>,
    /// Authority mode of the grant.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authority: Option<AuthorityMode>,
    /// Capabilities granted to the credential.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub capabilities: Option<Vec<String>>,
    /// Grant status (`connected` or `revoked`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct RuntimeDetection {
    pub openclaw: bool,
    pub hermes: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct DashboardSnapshot {
    pub accounts: Vec<EconomicAccount>,
    pub account: EconomicAccount,
    pub balance: BalanceResponse,
    pub transactions: TransactionsResponse,
    pub agents: Vec<AgentSummary>,
    pub providers: Vec<ProviderStatus>,
    pub capabilities: CapabilityAvailabilityResponse,
    pub outbox_cursor: i64,
    pub runtimes: RuntimeDetection,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct ApiError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
    pub request_id: String,
    pub details: serde_json::Value,
}

impl ApiError {
    pub fn new(code: impl Into<String>, message: impl Into<String>, retryable: bool) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            retryable,
            request_id: format!("req_{}", uuid::Uuid::new_v4().simple()),
            details: serde_json::json!({}),
        }
    }
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new("invalid_input", message, false)
    }
    pub fn unauthorized() -> Self {
        Self::new(
            "unauthorized",
            "valid scoped credentials are required",
            false,
        )
    }
    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new("forbidden", message, false)
    }
    pub fn not_found(kind: &str) -> Self {
        Self::new("not_found", format!("{kind} was not found"), false)
    }
    pub fn internal(message: impl Into<String>) -> Self {
        Self::new("internal_error", message, false)
    }
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for ApiError {}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, JsonSchema)]
#[serde(tag = "type", content = "id", rename_all = "snake_case")]
pub enum MoneyNodeRef {
    Position(String),
    Endpoint(String),
}

impl MoneyNodeRef {
    pub fn id(&self) -> &str {
        match self {
            Self::Position(id) => id,
            Self::Endpoint(id) => id,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, JsonSchema)]
pub struct AssetRef {
    pub code: String,
    #[serde(default)]
    pub network: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Environment {
    Sandbox,
    Live,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum RouteExecutionMode {
    OnDemand,
    AutomaticSettlement,
    Scheduled,
    Attached,
    JustInTime,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct RouteLeg {
    pub id: String,
    pub source: MoneyNodeRef,
    pub destination: MoneyNodeRef,
    pub executor_provider_id: String,
    pub source_asset: AssetRef,
    pub destination_asset: AssetRef,
    pub capability: String,
    pub environment: Environment,
    pub execution_mode: RouteExecutionMode,
    pub unattended_supported: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct MovementQuoteRequest {
    pub account_id: String,
    pub amount: AtomicAmount,
    pub source_provider: String,
    pub destination_provider: String,
    pub asset: String,
    #[serde(default)]
    pub idempotency_key: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct MovementQuote {
    pub quote_id: String,
    pub account_id: String,
    pub input_amount: AtomicAmount,
    pub input_asset: AssetRef,
    pub expected_output_amount: AtomicAmount,
    pub output_asset: AssetRef,
    pub fees_atomic: AtomicAmount,
    pub estimated_duration_seconds: u64,
    pub expires_at: DateTime<Utc>,
    pub legs: Vec<RouteLeg>,
    pub autonomous: bool,
    pub human_action_required: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, JsonSchema)]
#[serde(rename_all = "snake_case", tag = "status", content = "detail")]
pub enum MovementState {
    Planned,
    Quoted,
    Submitted,
    InFlight,
    Settled,
    Failed(String),
    Reversed(String),
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct MovementRecord {
    pub id: String,
    pub account_id: String,
    pub quote: MovementQuote,
    pub state: MovementState,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct ContinuityEvaluation {
    pub account_id: String,
    pub loop_status: String,
    pub missing_routes_count: usize,
    pub continuity_gaps: Vec<String>,
    pub candidate_plans: Vec<serde_json::Value>,
    pub reachable_capabilities: Vec<String>,
}
