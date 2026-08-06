mod models;
mod service;

pub use models::*;
pub use service::{hash_token, InitResult, MandateService};

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
        "error": schemars::schema_for!(ApiError)
    })
}
