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
pub struct ProfileUpdateRequest {
    pub administrator_name: String,
    pub principal_name: String,
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
    pub administrator_name: String,
    pub organization_name: String,
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

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct RuntimeDetection {
    pub openclaw: bool,
    pub hermes: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct DashboardSnapshot {
    pub principal: Principal,
    pub administrator_name: String,
    pub accounts: Vec<EconomicAccount>,
    pub account: EconomicAccount,
    pub balance: BalanceResponse,
    pub transactions: TransactionsResponse,
    pub agents: Vec<AgentSummary>,
    pub providers: Vec<ProviderStatus>,
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
