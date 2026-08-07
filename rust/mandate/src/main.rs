use clap::{Args, Parser, Subcommand};
use mandate_core::*;
use reqwest::{Client, Method};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::{json, Value};
use std::{collections::BTreeMap, process::ExitCode};
use uuid::Uuid;

#[derive(Parser)]
#[command(
    name = "mandate",
    version,
    about = "One economy. Any provider.",
    arg_required_else_help = true
)]
struct Cli {
    #[arg(
        long,
        global = true,
        env = "MANDATE_API_URL",
        default_value = "http://127.0.0.1:7741"
    )]
    api_url: String,
    #[arg(long, global = true, env = "MANDATE_TOKEN")]
    token: Option<String>,
    #[arg(long, global = true, env = "MANDATE_TOKEN_FILE")]
    token_file: Option<std::path::PathBuf>,
    #[arg(long, global = true)]
    json: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Init,
    Balance {
        #[arg(long, env = "MANDATE_ACCOUNT_ID")]
        account: String,
    },
    Receive {
        #[command(subcommand)]
        command: Receive,
    },
    Invoice {
        #[command(subcommand)]
        command: MoneyAction,
    },
    Checkout {
        #[command(subcommand)]
        command: MoneyAction,
    },
    Pay {
        #[command(subcommand)]
        command: Pay,
    },
    Transfer(TransferArgs),
    Refund {
        #[command(subcommand)]
        command: Refund,
    },
    Transactions {
        #[command(subcommand)]
        command: Transactions,
    },
    Providers {
        #[command(subcommand)]
        command: Providers,
    },
    Agents {
        #[command(subcommand)]
        command: Agents,
    },
    Status,
    Whoami,
    /// Discover capabilities executable for the current economic account.
    Capabilities {
        #[arg(long, env = "MANDATE_ACCOUNT_ID")]
        account: Option<String>,
    },
    Doctor,
    Dashboard,
    Daemon {
        #[command(subcommand)]
        command: Daemon,
    },
    Move(MoveArgs),
    Continuity(ContinuityArgs),
    Liquidity(LiquidityArgs),
    FundSpend(FundSpendArgs),
    Admin {
        #[command(subcommand)]
        command: Admin,
    },
}
#[derive(Subcommand)]
enum Receive {
    Stablecoin(ReceiveArgs),
}
#[derive(Subcommand)]
enum MoneyAction {
    Create(MoneyArgs),
}
#[derive(Subcommand)]
enum Pay {
    Create(PayArgs),
    Status { session_id: String },
    Revoke { session_id: String },
}
#[derive(Subcommand)]
enum Refund {
    Create {
        transaction_id: String,
        #[command(flatten)]
        money: MoneyArgs,
    },
}
#[derive(Subcommand)]
enum Transactions {
    List {
        #[arg(long, env = "MANDATE_ACCOUNT_ID")]
        account: String,
        #[arg(long, default_value_t = 50)]
        limit: u32,
    },
}
#[derive(Subcommand)]
enum Providers {
    List,
}
#[derive(Subcommand)]
enum Agents {
    Add(AgentArgs),
    Connect {
        runtime: String,
        #[arg(long, env = "MANDATE_ACCOUNT_ID")]
        account: String,
        #[arg(long)]
        with_mcp: bool,
    },
    Test {
        runtime: String,
    },
    Revoke {
        agent_id: String,
    },
}
#[derive(Subcommand)]
enum Daemon {
    Install,
    Start,
}
#[derive(Subcommand)]
enum Admin {
    Providers,
    Diagnostics,
}

#[derive(Args, Clone)]
struct MoneyArgs {
    #[arg(long, env = "MANDATE_ACCOUNT_ID")]
    account: String,
    #[arg(long)]
    amount: String,
    #[arg(long, default_value = "USD")]
    currency: String,
    #[arg(long)]
    provider: Option<String>,
    #[arg(long)]
    idempotency_key: Option<String>,
}
#[derive(Args)]
struct ReceiveArgs {
    #[arg(long, env = "MANDATE_ACCOUNT_ID")]
    account: String,
    #[arg(long, default_value = "USDC")]
    currency: String,
    #[arg(long, default_value = "base-sepolia")]
    network: String,
    #[arg(long)]
    provider: Option<String>,
    #[arg(long)]
    idempotency_key: Option<String>,
}
#[derive(Args)]
struct PayArgs {
    #[command(flatten)]
    money: MoneyArgs,
    #[arg(long, default_value = "online-checkout")]
    mode: String,
    #[arg(long)]
    merchant: Option<String>,
}
#[derive(Args)]
struct TransferArgs {
    #[command(flatten)]
    money: MoneyArgs,
    #[arg(long)]
    to: String,
    #[arg(long)]
    network: Option<String>,
}
#[derive(Args)]
struct AgentArgs {
    #[arg(long)]
    name: String,
    #[arg(long, env = "MANDATE_ACCOUNT_ID")]
    account: String,
    #[arg(long, default_value = "independent")]
    authority: String,
    #[arg(
        long,
        value_delimiter = ',',
        default_value = "balance,receive,invoice,checkout,pay,transactions,refund,fund_spend"
    )]
    capabilities: Vec<String>,
}

struct Api {
    base: String,
    token: Option<String>,
    client: Client,
}
impl Api {
    fn new(c: &Cli) -> Self {
        let token = c
            .token
            .clone()
            .or_else(|| {
                c.token_file
                    .as_ref()
                    .and_then(|p| std::fs::read_to_string(p).ok())
                    .map(|s| s.trim().into())
            })
            .or_else(load_admin_token);
        Self {
            base: c.api_url.trim_end_matches('/').into(),
            token,
            client: Client::new(),
        }
    }
    async fn call<T: DeserializeOwned>(
        &self,
        m: Method,
        path: &str,
        body: Option<Value>,
    ) -> Result<T, CliError> {
        let mut r = self.client.request(m, format!("{}{}", self.base, path));
        if let Some(t) = &self.token {
            r = r.bearer_auth(t)
        }
        if let Some(v) = body {
            r = r.json(&v)
        }
        let x = r
            .send()
            .await
            .map_err(|e| CliError::Daemon(e.to_string()))?;
        let status = x.status();
        let bytes = x
            .bytes()
            .await
            .map_err(|e| CliError::Daemon(e.to_string()))?;
        if !status.is_success() {
            return Err(CliError::Api(
                serde_json::from_slice(&bytes).unwrap_or_else(|_| {
                    ApiError::new("internal_error", String::from_utf8_lossy(&bytes), false)
                }),
            ));
        }
        serde_json::from_slice(&bytes).map_err(|e| CliError::Internal(e.to_string()))
    }
}
#[derive(Debug)]
enum CliError {
    Api(ApiError),
    Daemon(String),
    Internal(String),
}
impl CliError {
    fn code(&self) -> u8 {
        match self {
            Self::Api(a) => match a.code.as_str() {
                "invalid_input" => 2,
                "unauthorized" | "forbidden" => 3,
                "not_found" | "invalid_state" | "already_initialized" => 4,
                "provider_rejected" | "insufficient_funds" => 5,
                "provider_unavailable" => 6,
                _ => 8,
            },
            Self::Daemon(_) => 7,
            Self::Internal(_) => 8,
        }
    }
    fn value(&self) -> Value {
        match self {
            Self::Api(a) => serde_json::to_value(a).unwrap(),
            Self::Daemon(m) => {
                serde_json::to_value(ApiError::new("daemon_unavailable", m, true)).unwrap()
            }
            Self::Internal(m) => {
                serde_json::to_value(ApiError::new("internal_error", m, false)).unwrap()
            }
        }
    }
}
fn money(a: &MoneyArgs) -> Result<MoneyRequest, CliError> {
    Ok(MoneyRequest {
        account_id: a.account.clone(),
        amount: AtomicAmount::new(a.amount.clone()).map_err(CliError::Api)?,
        currency: a.currency.to_uppercase(),
        provider: a.provider.clone(),
        idempotency_key: Some(
            a.idempotency_key
                .clone()
                .unwrap_or_else(|| format!("idem_{}", Uuid::new_v4().simple())),
        ),
        metadata: BTreeMap::new(),
    })
}
fn output<T: Serialize>(v: &T, compact: bool) {
    println!(
        "{}",
        if compact {
            serde_json::to_string(v).unwrap()
        } else {
            serde_json::to_string_pretty(v).unwrap()
        }
    )
}

#[tokio::main]
async fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(&cli).await {
        Ok(v) => {
            output(&v, cli.json);
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("{}", serde_json::to_string(&e.value()).unwrap());
            ExitCode::from(e.code())
        }
    }
}
async fn run(c: &Cli) -> Result<Value, CliError> {
    let a = Api::new(c);
    match &c.command {
        Command::Init => {
            let result: InitResult = a.call(Method::POST, "/v1/init", Some(json!({}))).await?;
            let stored = store_admin_token(&result.admin_token);
            Ok(if stored {
                json!({"account":result.account,"admin_token_stored":"macos_keychain","keychain_service":"com.mandate.admin"})
            } else {
                json!({"account":result.account,"admin_token":result.admin_token,"warning":"could not store administrator token in Keychain"})
            })
        }
        Command::Balance { account } => {
            a.call(
                Method::GET,
                &format!("/v1/accounts/{account}/balance"),
                None,
            )
            .await
        }
        Command::Receive {
            command: Receive::Stablecoin(x),
        } => {
            a.call(
                Method::POST,
                "/v1/receive-endpoints",
                Some(
                    serde_json::to_value(ReceiveRequest {
                        account_id: x.account.clone(),
                        currency: x.currency.to_uppercase(),
                        network: Some(x.network.clone()),
                        provider: x.provider.clone(),
                        idempotency_key: Some(
                            x.idempotency_key
                                .clone()
                                .unwrap_or_else(|| format!("idem_{}", Uuid::new_v4().simple())),
                        ),
                    })
                    .unwrap(),
                ),
            )
            .await
        }
        Command::Invoice {
            command: MoneyAction::Create(x),
        } => {
            a.call(
                Method::POST,
                "/v1/invoices",
                Some(serde_json::to_value(money(x)?).unwrap()),
            )
            .await
        }
        Command::Checkout {
            command: MoneyAction::Create(x),
        } => {
            a.call(
                Method::POST,
                "/v1/checkouts",
                Some(serde_json::to_value(money(x)?).unwrap()),
            )
            .await
        }
        Command::Pay {
            command: Pay::Create(x),
        } => {
            a.call(
                Method::POST,
                "/v1/payment-sessions",
                Some(
                    serde_json::to_value(PaymentSessionRequest {
                        money: money(&x.money)?,
                        mode: x.mode.clone(),
                        merchant: x.merchant.clone(),
                    })
                    .unwrap(),
                ),
            )
            .await
        }
        Command::Pay {
            command: Pay::Status { session_id },
        } => {
            a.call(
                Method::GET,
                &format!("/v1/payment-sessions/{session_id}"),
                None,
            )
            .await
        }
        Command::Pay {
            command: Pay::Revoke { session_id },
        } => {
            a.call(
                Method::POST,
                &format!("/v1/payment-sessions/{session_id}/revoke"),
                Some(json!({})),
            )
            .await
        }
        Command::Transfer(x) => {
            a.call(
                Method::POST,
                "/v1/transfers",
                Some(
                    serde_json::to_value(TransferRequest {
                        money: money(&x.money)?,
                        to: x.to.clone(),
                        network: x.network.clone(),
                    })
                    .unwrap(),
                ),
            )
            .await
        }
        Command::Move(x) => {
            let quote_req = json!({
                "account_id": x.account,
                "amount": x.amount,
                "source_provider": x.from,
                "destination_provider": x.to,
                "asset": x.asset
            });
            let quote: Value = a
                .call(Method::POST, "/v1/movements/quote", Some(quote_req))
                .await?;
            a.call(Method::POST, "/v1/movements", Some(quote)).await
        }
        Command::Continuity(x) => {
            a.call(
                Method::GET,
                &format!("/v1/continuity?account_id={}", x.account),
                None,
            )
            .await
        }
        Command::Liquidity(x) => {
            a.call(
                Method::GET,
                &format!(
                    "/v1/liquidity-status?account_id={}&currency={}",
                    x.account, x.currency
                ),
                None,
            )
            .await
        }
        Command::FundSpend(x) => {
            a.call(
                Method::POST,
                "/v1/fund-spend",
                Some(
                    serde_json::to_value(FundSpendRequest {
                        money: money(&x.money)?,
                    })
                    .unwrap(),
                ),
            )
            .await
        }
        Command::Refund {
            command:
                Refund::Create {
                    transaction_id,
                    money: x,
                },
        } => {
            a.call(
                Method::POST,
                "/v1/refunds",
                Some(
                    serde_json::to_value(RefundRequest {
                        money: money(x)?,
                        transaction_id: transaction_id.clone(),
                    })
                    .unwrap(),
                ),
            )
            .await
        }
        Command::Transactions {
            command: Transactions::List { account, limit },
        } => {
            a.call(
                Method::GET,
                &format!("/v1/transactions?account_id={account}&limit={limit}"),
                None,
            )
            .await
        }
        Command::Providers {
            command: Providers::List,
        }
        | Command::Admin {
            command: Admin::Providers,
        } => a.call(Method::GET, "/v1/admin/providers", None).await,
        Command::Agents {
            command: Agents::Add(x),
        } => add_agent(&a, x).await,
        Command::Agents {
            command:
                Agents::Connect {
                    runtime,
                    account,
                    with_mcp,
                },
        } => connect(&a, runtime, account, *with_mcp).await,
        Command::Agents {
            command: Agents::Test { runtime },
        } => Ok(json!({"runtime":runtime,"detected":detect(runtime)})),
        Command::Agents {
            command: Agents::Revoke { agent_id },
        } => {
            a.call(
                Method::POST,
                &format!("/v1/admin/agents/{agent_id}/revoke"),
                Some(json!({})),
            )
            .await
        }
        Command::Status => a.call(Method::GET, "/health", None).await,
        Command::Whoami => a.call(Method::GET, "/v1/me", None).await,
        Command::Capabilities { account } => {
            let query = account
                .as_ref()
                .map(|id| format!("?account_id={id}"))
                .unwrap_or_default();
            a.call(Method::GET, &format!("/v1/capabilities{query}"), None)
                .await
        }
        Command::Doctor
        | Command::Admin {
            command: Admin::Diagnostics,
        } => a.call(Method::GET, "/v1/admin/diagnostics", None).await,
        Command::Dashboard => {
            let receipt: Value = a
                .call(
                    Method::POST,
                    "/v1/admin/dashboard-sessions",
                    Some(json!({})),
                )
                .await?;
            if let Some(url) = receipt.get("url").and_then(Value::as_str) {
                #[cfg(target_os = "macos")]
                let opened = std::process::Command::new("open")
                    .arg(url)
                    .status()
                    .is_ok_and(|status| status.success());
                #[cfg(not(target_os = "macos"))]
                let opened = false;
                Ok(
                    json!({"url":url,"opened":opened,"expires_in_seconds":receipt.get("expires_in_seconds")}),
                )
            } else {
                Err(CliError::Internal(
                    "daemon did not return a dashboard URL".into(),
                ))
            }
        }
        Command::Daemon {
            command: Daemon::Install,
        } => Ok(json!({"launch_agent":"com.mandate.mandated","status":"packaging_hook_ready"})),
        Command::Daemon {
            command: Daemon::Start,
        } => Ok(json!({"command":"mandated","status":"run_in_foreground"})),
    }
}
async fn add_agent(a: &Api, x: &AgentArgs) -> Result<Value, CliError> {
    Ok(serde_json::to_value(add_agent_credential(a, x).await?).unwrap())
}
async fn add_agent_credential(a: &Api, x: &AgentArgs) -> Result<AgentCredential, CliError> {
    let authority = match x.authority.as_str() {
        "independent" => AuthorityMode::Independent,
        "shared" => AuthorityMode::Shared,
        "observe_only" => AuthorityMode::ObserveOnly,
        _ => return Err(CliError::Api(ApiError::invalid("invalid authority mode"))),
    };
    a.call(
        Method::POST,
        "/v1/admin/agents",
        Some(
            serde_json::to_value(AgentCreateRequest {
                name: x.name.clone(),
                account_id: x.account.clone(),
                authority,
                capabilities: x.capabilities.clone(),
                capability_modes: Default::default(),
            })
            .unwrap(),
        ),
    )
    .await
}
fn detect(name: &str) -> bool {
    std::env::var_os("PATH")
        .is_some_and(|p| std::env::split_paths(&p).any(|d| d.join(name).is_file()))
}
async fn connect(a: &Api, runtime: &str, account: &str, with_mcp: bool) -> Result<Value, CliError> {
    if !matches!(runtime, "openclaw" | "hermes") {
        return Err(CliError::Api(ApiError::invalid(
            "runtime must be openclaw or hermes",
        )));
    }
    let req = AgentArgs {
        name: runtime.into(),
        account: account.into(),
        authority: "independent".into(),
        // `transfer` (arbitrary external capital movement) is intentionally not part
        // of the default grant. Operators must explicitly opt in to external
        // transfer; `fund_spend` is the autonomous internal money-movement
        // primitive granted by default.
        capabilities: vec![
            "balance",
            "receive",
            "invoice",
            "checkout",
            "pay",
            "transactions",
            "refund",
            "fund_spend",
        ]
        .into_iter()
        .map(|s| s.to_string())
        .collect(),
    };
    let credential = add_agent_credential(a, &req).await?;
    let base = std::env::var_os("HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| ".".into())
        .join(".config/mandate/agents");
    std::fs::create_dir_all(&base).map_err(|e| CliError::Internal(e.to_string()))?;
    let path = base.join(format!("{}.token", credential.agent_id));
    std::fs::write(&path, &credential.token).map_err(|e| CliError::Internal(e.to_string()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| CliError::Internal(e.to_string()))?;
    }
    Ok(
        json!({"runtime":runtime,"detected":detect(runtime),"agent_id":credential.agent_id,"account_id":credential.account_id,"credential_file":path,"mcp_requested":with_mcp,"next":"Integration assets install the runtime-native wrapper/configuration."}),
    )
}
fn store_admin_token(token: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        let account = std::env::var("USER").unwrap_or_else(|_| "mandate".into());
        let service = std::env::var("MANDATE_ADMIN_KEYCHAIN_SERVICE")
            .unwrap_or_else(|_| "com.mandate.admin".into());
        std::process::Command::new("security")
            .args([
                "add-generic-password",
                "-U",
                "-s",
                &service,
                "-a",
                &account,
                "-w",
                token,
            ])
            .status()
            .is_ok_and(|s| s.success())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = token;
        false
    }
}
fn load_admin_token() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let account = std::env::var("USER").unwrap_or_else(|_| "mandate".into());
        let service = std::env::var("MANDATE_ADMIN_KEYCHAIN_SERVICE")
            .unwrap_or_else(|_| "com.mandate.admin".into());
        let out = std::process::Command::new("security")
            .args([
                "find-generic-password",
                "-s",
                &service,
                "-a",
                &account,
                "-w",
            ])
            .output()
            .ok()?;
        if out.status.success() {
            let token = String::from_utf8(out.stdout).ok()?;
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
        None
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

#[derive(Args)]
struct MoveArgs {
    #[arg(long, env = "MANDATE_ACCOUNT_ID")]
    account: String,
    #[arg(long)]
    from: String,
    #[arg(long)]
    to: String,
    #[arg(long)]
    amount: String,
    #[arg(long, default_value = "USD")]
    asset: String,
}

#[derive(Args)]
struct ContinuityArgs {
    #[arg(long, env = "MANDATE_ACCOUNT_ID")]
    account: String,
}
#[derive(Args)]
struct LiquidityArgs {
    #[arg(long, env = "MANDATE_ACCOUNT_ID")]
    account: String,
    #[arg(long, default_value = "USD")]
    currency: String,
}

#[derive(Args)]
struct FundSpendArgs {
    #[command(flatten)]
    money: MoneyArgs,
}
