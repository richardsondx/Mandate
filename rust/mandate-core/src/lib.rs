mod capabilities_generated;
mod models;
mod service;

pub use capabilities_generated::CAPABILITY_IDS;
pub use models::*;
pub use service::{hash_token, InitResult, MandateService};

pub fn capability_manifest() -> CapabilityManifest {
    serde_json::from_str(capabilities_generated::CAPABILITY_MANIFEST_JSON)
        .expect("generated capability manifest must be valid")
}

/// Versioned machine-readable contract consumed by adapters and generated clients.
pub fn contract_schema() -> serde_json::Value {
    serde_json::json!({
        "version":"v1",
        "amount": schemars::schema_for!(AtomicAmount),
        "balance": schemars::schema_for!(BalanceResponse),
        "money_request": schemars::schema_for!(MoneyRequest),
        "receive_request": schemars::schema_for!(ReceiveRequest),
        "payment_session_request": schemars::schema_for!(PaymentSessionRequest),
        "transfer_request": schemars::schema_for!(TransferRequest),
        "operation": schemars::schema_for!(Operation),
        "transactions": schemars::schema_for!(TransactionsResponse),
        "capabilities": schemars::schema_for!(CapabilityAvailabilityResponse),
        "error": schemars::schema_for!(ApiError)
    })
}
