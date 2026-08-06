use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Redirect,
    },
    routing::{get, post},
    Json, Router,
};
use futures_util::stream;
use mandate_core::*;
use rand::{distributions::Alphanumeric, Rng};
use serde::Deserialize;
use std::{
    collections::HashMap,
    convert::Infallible,
    io::{BufRead, BufReader, Write},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicI64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
    time::Instant,
};
use tower_http::services::ServeDir;

#[derive(Clone)]
pub struct AppState {
    pub service: MandateService,
    dashboard_tickets: Arc<Mutex<HashMap<String, Instant>>>,
    dashboard_sessions: Arc<Mutex<HashMap<String, String>>>,
    started_at: chrono::DateTime<chrono::Utc>,
}

pub fn router(service: MandateService) -> Router {
    let web_dir = std::env::var("MANDATE_WEB_DIR").unwrap_or_else(|_| "web/dist".into());
    Router::new()
        .route(
            "/health",
            get(|| async {
                Json(serde_json::json!({"status":"ok","version":env!("CARGO_PKG_VERSION")}))
            }),
        )
        .route("/v1/init", post(initialize))
        .route("/v1/setup/status", get(setup_status))
        .route("/v1/setup", post(setup))
        .route("/v1/accounts/{id}/balance", get(balance))
        .route("/v1/receive-endpoints", post(receive))
        .route("/v1/invoices", post(invoice))
        .route("/v1/checkouts", post(checkout))
        .route("/v1/payment-sessions", post(payment))
        .route("/v1/payment-sessions/{id}", get(payment_status))
        .route("/v1/payment-sessions/{id}/revoke", post(payment_revoke))
        .route("/v1/transfers", post(transfer))
        .route("/v1/refunds", post(refund))
        .route("/v1/transactions", get(transactions))
        .route("/v1/events", get(events))
        .route("/v1/dashboard", get(dashboard))
        .route("/v1/dashboard/login/{ticket}", get(dashboard_login))
        .route(
            "/v1/admin/dashboard-sessions",
            post(create_dashboard_session),
        )
        .route("/v1/admin/providers", get(providers))
        .route("/v1/admin/accounts", get(accounts).post(create_account))
        .route("/v1/admin/profile", post(update_profile))
        .route("/v1/admin/provider-connections", post(connect_provider))
        .route("/v1/admin/agents", post(create_agent))
        .route("/v1/admin/agents/connect", post(connect_agent))
        .route("/v1/admin/agents/{id}/revoke", post(revoke_agent))
        .route("/v1/admin/agents/{id}", post(update_agent))
        .route("/v1/admin/agents/{id}/install", post(install_agent))
        .route("/v1/admin/diagnostics", get(diagnostics))
        .route("/v1/admin/schema", get(schema))
        .with_state(Arc::new(AppState {
            service,
            dashboard_tickets: Arc::new(Mutex::new(HashMap::new())),
            dashboard_sessions: Arc::new(Mutex::new(HashMap::new())),
            started_at: chrono::Utc::now(),
        }))
        .fallback_service(ServeDir::new(web_dir).append_index_html_on_directories(true))
        .layer(axum::middleware::from_fn(loopback_guard))
}

async fn loopback_guard(
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    if let Some(host) = req
        .headers()
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
    {
        let allowed = host == "localhost"
            || host.starts_with("localhost:")
            || host == "127.0.0.1"
            || host.starts_with("127.0.0.1:")
            || host == "[::1]"
            || host.starts_with("[::1]:");
        if !allowed {
            return ApiErrorResponse(ApiError::forbidden(
                "Host must resolve to the local Mandate service",
            ))
            .into_response();
        }
    }
    if let Some(origin) = req
        .headers()
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
    {
        let allowed = origin == "http://localhost:7741"
            || origin == "http://127.0.0.1:7741"
            || origin == "http://[::1]:7741";
        if !allowed {
            return ApiErrorResponse(ApiError::forbidden("cross-origin browser request rejected"))
                .into_response();
        }
    }
    next.run(req).await
}

fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
}

fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|cookies| {
            cookies.split(';').find_map(|part| {
                let (key, value) = part.trim().split_once('=')?;
                (key == name).then(|| value.to_string())
            })
        })
}

fn auth(
    state: &AppState,
    headers: &HeaderMap,
    admin: bool,
    cap: Option<&str>,
    account: Option<&str>,
    mutation: bool,
) -> Result<Option<String>, ApiError> {
    if let Some(token) = bearer(headers) {
        state.service.authenticate(token, admin, cap, account)?;
        return Ok(None);
    }
    if let Some(session) = cookie(headers, "mandate_session") {
        let csrf = state
            .dashboard_sessions
            .lock()
            .unwrap()
            .get(&session)
            .cloned()
            .ok_or_else(ApiError::unauthorized)?;
        if mutation
            && headers.get("x-mandate-csrf").and_then(|v| v.to_str().ok()) != Some(csrf.as_str())
        {
            return Err(ApiError::forbidden(
                "dashboard CSRF token is missing or invalid",
            ));
        }
        return Ok(Some(csrf));
    }
    Err(ApiError::unauthorized())
}

#[derive(Deserialize)]
struct InitRequest {
    name: Option<String>,
    account_name: Option<String>,
    demo: Option<bool>,
}
async fn initialize(
    State(s): State<Arc<AppState>>,
    Json(req): Json<InitRequest>,
) -> Result<Json<InitResult>, ApiErrorResponse> {
    let name = req.name.as_deref().unwrap_or("Mandate owner");
    Ok(Json(s.service.initialize_instance(
        name,
        name,
        req.account_name.as_deref().unwrap_or("Primary treasury"),
        req.demo.unwrap_or(false),
    )?))
}

async fn setup_status(
    State(s): State<Arc<AppState>>,
) -> Result<Json<InstanceStatus>, ApiErrorResponse> {
    Ok(Json(InstanceStatus {
        initialized: s.service.is_initialized()?,
        runtimes: RuntimeDetection {
            openclaw: runtime_detected("openclaw"),
            hermes: runtime_detected("hermes"),
        },
    }))
}

async fn setup(
    State(s): State<Arc<AppState>>,
    Json(req): Json<SetupRequest>,
) -> Result<axum::response::Response, ApiErrorResponse> {
    let result = s.service.initialize_instance(
        &req.administrator_name,
        &req.organization_name,
        &req.account_name,
        req.demo,
    )?;
    let stored = store_admin_token(&result.admin_token);
    let (session, csrf) = create_dashboard_session_values(&s);
    let body = serde_json::json!({
        "principal": result.principal,
        "account": result.account,
        "csrf_token": csrf,
        "admin_token_stored": stored,
        "admin_token": (!stored).then_some(result.admin_token)
    });
    let mut response = Json(body).into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        session_cookie(&session)
            .parse()
            .map_err(|_| ApiError::internal("failed to create dashboard session cookie"))?,
    );
    Ok(response)
}
async fn balance(
    State(s): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<BalanceResponse>, ApiErrorResponse> {
    auth(&s, &headers, false, Some("balance"), Some(&id), false)?;
    Ok(Json(s.service.balance(&id)?))
}
async fn receive(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<ReceiveRequest>,
) -> Result<Json<Operation>, ApiErrorResponse> {
    auth(
        &s,
        &headers,
        false,
        Some("receive"),
        Some(&req.account_id),
        true,
    )?;
    Ok(Json(s.service.create_receive(req)?))
}
async fn invoice(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<MoneyRequest>,
) -> Result<Json<Operation>, ApiErrorResponse> {
    auth(
        &s,
        &headers,
        false,
        Some("invoice"),
        Some(&req.account_id),
        true,
    )?;
    Ok(Json(s.service.create_money_operation("invoice", req)?))
}
async fn checkout(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<MoneyRequest>,
) -> Result<Json<Operation>, ApiErrorResponse> {
    auth(
        &s,
        &headers,
        false,
        Some("checkout"),
        Some(&req.account_id),
        true,
    )?;
    Ok(Json(s.service.create_money_operation("checkout", req)?))
}
async fn payment(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<PaymentSessionRequest>,
) -> Result<Json<Operation>, ApiErrorResponse> {
    auth(
        &s,
        &headers,
        false,
        Some("pay"),
        Some(&req.money.account_id),
        true,
    )?;
    Ok(Json(s.service.create_payment(req)?))
}
async fn payment_status(
    State(s): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Operation>, ApiErrorResponse> {
    let op = s.service.operation(&id)?;
    auth(
        &s,
        &headers,
        false,
        Some("pay"),
        Some(&op.account_id),
        false,
    )?;
    Ok(Json(op))
}
async fn payment_revoke(
    State(s): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Operation>, ApiErrorResponse> {
    let op = s.service.operation(&id)?;
    auth(&s, &headers, false, Some("pay"), Some(&op.account_id), true)?;
    Ok(Json(s.service.revoke_operation(&id)?))
}
async fn transfer(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<TransferRequest>,
) -> Result<Json<Operation>, ApiErrorResponse> {
    auth(
        &s,
        &headers,
        false,
        Some("transfer"),
        Some(&req.money.account_id),
        true,
    )?;
    Ok(Json(s.service.create_transfer(req)?))
}
async fn refund(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<RefundRequest>,
) -> Result<Json<Operation>, ApiErrorResponse> {
    auth(
        &s,
        &headers,
        false,
        Some("refund"),
        Some(&req.money.account_id),
        true,
    )?;
    Ok(Json(s.service.create_money_operation("refund", req.money)?))
}

#[derive(Deserialize)]
struct TxQuery {
    account_id: String,
    limit: Option<u32>,
}
async fn transactions(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<TxQuery>,
) -> Result<Json<TransactionsResponse>, ApiErrorResponse> {
    auth(
        &s,
        &headers,
        false,
        Some("transactions"),
        Some(&q.account_id),
        false,
    )?;
    Ok(Json(s.service.transactions(
        &q.account_id,
        q.limit.unwrap_or(50).min(200),
    )?))
}

#[derive(Deserialize)]
struct EventQuery {
    after: Option<i64>,
}
async fn events(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<EventQuery>,
) -> Result<Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>>, ApiErrorResponse> {
    auth(&s, &headers, true, None, None, false)?;
    let svc = s.service.clone();
    let cursor = Arc::new(AtomicI64::new(q.after.unwrap_or(0)));
    let output = stream::unfold((), move |_| {
        let svc = svc.clone();
        let cursor = cursor.clone();
        async move {
            tokio::time::sleep(Duration::from_millis(500)).await;
            let rows = svc
                .events_since(cursor.load(Ordering::Relaxed))
                .unwrap_or_default();
            if let Some(last) = rows.last() {
                cursor.store(last.id, Ordering::Relaxed);
            }
            let data = serde_json::to_string(&rows).unwrap();
            Some((Ok(Event::default().event("batch").data(data)), ()))
        }
    });
    Ok(Sse::new(output).keep_alive(KeepAlive::default()))
}

fn random_secret(length: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(length)
        .map(char::from)
        .collect()
}

fn create_dashboard_session_values(state: &AppState) -> (String, String) {
    let session = random_secret(64);
    let csrf = random_secret(32);
    state
        .dashboard_sessions
        .lock()
        .unwrap()
        .insert(session.clone(), csrf.clone());
    (session, csrf)
}

fn session_cookie(session: &str) -> String {
    format!("mandate_session={session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800")
}

fn store_admin_token(token: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        let service = std::env::var("MANDATE_ADMIN_KEYCHAIN_SERVICE")
            .unwrap_or_else(|_| "com.mandate.admin".into());
        Command::new("security")
            .args([
                "add-generic-password",
                "-U",
                "-s",
                &service,
                "-a",
                &std::env::var("USER").unwrap_or_else(|_| "mandate".into()),
                "-w",
                token,
            ])
            .status()
            .is_ok_and(|status| status.success())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = token;
        false
    }
}

async fn create_dashboard_session(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiErrorResponse> {
    auth(&s, &headers, true, None, None, true)?;
    let ticket = random_secret(48);
    s.dashboard_tickets
        .lock()
        .unwrap()
        .insert(ticket.clone(), Instant::now());
    Ok(Json(serde_json::json!({
        "url": format!("http://127.0.0.1:7741/v1/dashboard/login/{ticket}"),
        "expires_in_seconds": 60
    })))
}

async fn dashboard_login(
    State(s): State<Arc<AppState>>,
    Path(ticket): Path<String>,
) -> Result<axum::response::Response, ApiErrorResponse> {
    let issued = s
        .dashboard_tickets
        .lock()
        .unwrap()
        .remove(&ticket)
        .ok_or_else(ApiError::unauthorized)?;
    if issued.elapsed() > Duration::from_secs(60) {
        return Err(ApiError::new(
            "dashboard_ticket_expired",
            "Dashboard login link has expired; run mandate dashboard again",
            false,
        )
        .into());
    }
    let (session, _) = create_dashboard_session_values(&s);
    let mut response = Redirect::to("/").into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        session_cookie(&session)
            .parse()
            .map_err(|_| ApiError::internal("failed to create dashboard session cookie"))?,
    );
    Ok(response)
}

fn runtime_detected(name: &str) -> bool {
    std::env::var_os("PATH")
        .is_some_and(|paths| std::env::split_paths(&paths).any(|dir| dir.join(name).is_file()))
        || Command::new("/bin/zsh")
            .args(["-lc", &format!("command -v {name}")])
            .output()
            .is_ok_and(|output| output.status.success())
}

fn integration_home() -> std::path::PathBuf {
    std::env::var_os("MANDATE_INTEGRATION_HOME")
        .or_else(|| std::env::var_os("HOME"))
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from("."))
}

#[derive(Deserialize)]
struct DashboardQuery {
    account_id: Option<String>,
}

async fn dashboard(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<DashboardQuery>,
) -> Result<Json<serde_json::Value>, ApiErrorResponse> {
    let csrf = auth(&s, &headers, true, None, None, false)?;
    let snapshot = s.service.dashboard_snapshot(
        query.account_id.as_deref(),
        RuntimeDetection {
            openclaw: runtime_detected("openclaw"),
            hermes: runtime_detected("hermes"),
        },
    )?;
    Ok(Json(serde_json::json!({
        "snapshot": snapshot,
        "csrf_token": csrf
    })))
}

async fn providers(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<DashboardQuery>,
) -> Result<Json<Vec<ProviderStatus>>, ApiErrorResponse> {
    auth(&s, &headers, true, None, None, false)?;
    Ok(Json(match query.account_id {
        Some(account_id) => s.service.providers_for(&account_id),
        None => s.service.providers(),
    }))
}

async fn accounts(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Vec<EconomicAccount>>, ApiErrorResponse> {
    auth(&s, &headers, true, None, None, false)?;
    Ok(Json(s.service.list_accounts()?))
}

async fn create_account(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<AccountCreateRequest>,
) -> Result<Json<EconomicAccount>, ApiErrorResponse> {
    auth(&s, &headers, true, None, None, true)?;
    Ok(Json(s.service.create_account(&req.name)?))
}

async fn update_profile(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<ProfileUpdateRequest>,
) -> Result<Json<serde_json::Value>, ApiErrorResponse> {
    auth(&s, &headers, true, None, None, true)?;
    s.service.update_profile(req)?;
    Ok(Json(serde_json::json!({"status":"updated"})))
}

async fn connect_provider(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<ProviderConnectRequest>,
) -> Result<Json<ProviderStatus>, ApiErrorResponse> {
    auth(&s, &headers, true, None, None, true)?;
    if req.mode == "demo" {
        return Ok(Json(
            s.service
                .connect_demo_provider(&req.account_id, &req.provider_id)?,
        ));
    }
    if !matches!(req.mode.as_str(), "sandbox" | "live") {
        return Err(ApiError::invalid("provider mode must be demo, sandbox, or live").into());
    }
    let mut config = req.config.as_object().cloned().ok_or_else(|| {
        ApiErrorResponse(ApiError::invalid(
            "provider configuration must be an object",
        ))
    })?;
    config.insert("mode".into(), serde_json::Value::String(req.mode.clone()));
    let _health = probe_provider(&req.provider_id, serde_json::Value::Object(config.clone()))?;
    store_provider_config(
        &req.account_id,
        &req.provider_id,
        &serde_json::Value::Object(config),
    )?;
    let status =
        s.service
            .connect_verified_provider(&req.account_id, &req.provider_id, &req.mode)?;
    Ok(Json(ProviderStatus {
        state: status.state,
        ..status
    }))
}

fn provider_entry(provider_id: &str) -> Result<std::path::PathBuf, ApiError> {
    if !matches!(
        provider_id,
        "coinbase-cdp-wallet" | "stripe-revenue" | "lithic-card"
    ) {
        return Err(ApiError::invalid("unknown bundled provider"));
    }
    let root = std::env::current_dir().map_err(|error| ApiError::internal(error.to_string()))?;
    let path = root
        .join("providers")
        .join(provider_id)
        .join("dist/index.js");
    if !path.exists() {
        return Err(ApiError::new(
            "provider_not_built",
            format!("Build provider packages first: {}", path.display()),
            false,
        ));
    }
    Ok(path)
}

fn probe_provider(
    provider_id: &str,
    config: serde_json::Value,
) -> Result<serde_json::Value, ApiError> {
    let entry = provider_entry(provider_id)?;
    let mut child = Command::new("node")
        .arg(entry)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| ApiError::new("provider_host_unavailable", error.to_string(), true))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| ApiError::internal("provider stdin unavailable"))?;
    writeln!(
        stdin,
        "{}",
        serde_json::json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"config":config}})
    )
    .map_err(|error| ApiError::internal(error.to_string()))?;
    writeln!(
        stdin,
        "{}",
        serde_json::json!({"jsonrpc":"2.0","id":2,"method":"shutdown","params":{}})
    )
    .map_err(|error| ApiError::internal(error.to_string()))?;
    drop(stdin);
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| ApiError::internal("provider stdout unavailable"))?;
    let line = BufReader::new(stdout)
        .lines()
        .next()
        .transpose()
        .map_err(|error| ApiError::internal(error.to_string()))?
        .ok_or_else(|| {
            ApiError::new(
                "provider_unavailable",
                "Provider returned no health result",
                true,
            )
        })?;
    let response: serde_json::Value = serde_json::from_str(&line).map_err(|_| {
        ApiError::new(
            "provider_protocol_error",
            "Provider returned invalid JSON-RPC",
            false,
        )
    })?;
    let _ = child.wait();
    if let Some(error) = response.get("error") {
        return Err(ApiError::new(
            "provider_rejected",
            error
                .get("message")
                .and_then(|value| value.as_str())
                .unwrap_or("Provider rejected configuration"),
            false,
        ));
    }
    Ok(response
        .get("result")
        .cloned()
        .unwrap_or(serde_json::Value::Null))
}

fn store_provider_config(
    account_id: &str,
    provider_id: &str,
    config: &serde_json::Value,
) -> Result<(), ApiError> {
    #[cfg(target_os = "macos")]
    {
        let service = format!("com.mandate.provider.{account_id}.{provider_id}");
        let secret = config.to_string();
        let status = Command::new("security")
            .args([
                "add-generic-password",
                "-U",
                "-s",
                &service,
                "-a",
                provider_id,
                "-w",
                &secret,
            ])
            .status()
            .map_err(|error| ApiError::internal(error.to_string()))?;
        if !status.success() {
            return Err(ApiError::new(
                "keychain_unavailable",
                "Provider credentials could not be stored in macOS Keychain",
                false,
            ));
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (account_id, provider_id, config);
        Err(ApiError::new(
            "keychain_unavailable",
            "External provider credentials require macOS Keychain in v0.1",
            false,
        ))
    }
}
async fn create_agent(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<AgentCreateRequest>,
) -> Result<Json<AgentCredential>, ApiErrorResponse> {
    auth(&s, &headers, true, None, None, true)?;
    Ok(Json(s.service.create_agent(req)?))
}

#[derive(Deserialize)]
struct ConnectAgentRequest {
    name: String,
    runtime: String,
    account_id: String,
    capabilities: Vec<String>,
}

async fn connect_agent(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<ConnectAgentRequest>,
) -> Result<Json<serde_json::Value>, ApiErrorResponse> {
    auth(&s, &headers, true, None, None, true)?;
    if !matches!(req.runtime.as_str(), "openclaw" | "hermes") {
        return Err(ApiError::invalid("runtime must be openclaw or hermes").into());
    }
    let credential = s.service.create_agent(AgentCreateRequest {
        name: req.name,
        account_id: req.account_id,
        authority: AuthorityMode::Independent,
        capabilities: req.capabilities,
    })?;
    s.service
        .set_agent_runtime(&credential.agent_id, &req.runtime)?;
    let credential_dir = integration_home().join(".config/mandate/agents");
    std::fs::create_dir_all(&credential_dir)
        .map_err(|error| ApiError::internal(error.to_string()))?;
    let credential_path = credential_dir.join(format!("{}.token", credential.agent_id));
    std::fs::write(&credential_path, credential.token)
        .map_err(|error| ApiError::internal(error.to_string()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&credential_path, std::fs::Permissions::from_mode(0o600))
            .map_err(|error| ApiError::internal(error.to_string()))?;
    }
    s.service.set_agent_installation(
        &credential.agent_id,
        "not_installed",
        Some("Runtime registration has not been requested"),
    )?;
    Ok(Json(serde_json::json!({
        "agent_id": credential.agent_id,
        "account_id": credential.account_id,
        "runtime": req.runtime,
        "credential_file": credential_path,
        "runtime_detected": runtime_detected(&req.runtime),
        "runtime_installation": "not_installed"
    })))
}

async fn update_agent(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<AgentUpdateRequest>,
) -> Result<Json<serde_json::Value>, ApiErrorResponse> {
    auth(&s, &headers, true, None, None, true)?;
    s.service.update_agent(&id, req)?;
    Ok(Json(serde_json::json!({"agent_id":id,"status":"updated"})))
}

fn command_receipt(mut command: Command) -> Result<String, ApiError> {
    let output = command
        .output()
        .map_err(|error| ApiError::new("runtime_unavailable", error.to_string(), false))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        return Err(ApiError::new(
            "runtime_installation_failed",
            if stderr.is_empty() { stdout } else { stderr },
            false,
        ));
    }
    Ok(if stdout.is_empty() {
        "Command completed".into()
    } else {
        stdout
    })
}

fn command_receipt_with_input(mut command: Command, input: &str) -> Result<String, ApiError> {
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| ApiError::new("runtime_unavailable", error.to_string(), false))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(input.as_bytes())
            .map_err(|error| ApiError::internal(error.to_string()))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|error| ApiError::internal(error.to_string()))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        return Err(ApiError::new(
            "runtime_installation_failed",
            if stderr.is_empty() { stdout } else { stderr },
            false,
        ));
    }
    Ok(if stdout.is_empty() {
        "Command completed".into()
    } else {
        stdout
    })
}

fn install_runtime(
    runtime: &str,
    credential_path: &std::path::Path,
) -> Result<serde_json::Value, ApiError> {
    let root = std::env::current_dir().map_err(|error| ApiError::internal(error.to_string()))?;
    let mcp_entry = std::env::var_os("MANDATE_MCP_ENTRY")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| root.join("packages/mcp/dist/index.js"));
    if !mcp_entry.exists() {
        return Err(ApiError::new(
            "mcp_server_missing",
            format!("Build the MCP adapter first: {}", mcp_entry.display()),
            false,
        ));
    }
    let credential = credential_path.to_string_lossy().to_string();
    let entry = mcp_entry.to_string_lossy().to_string();
    let home = integration_home();
    match runtime {
        "hermes" => {
            let list = command_receipt({
                let mut command = Command::new("hermes");
                command.env("HOME", &home).args(["mcp", "list"]);
                command
            })?;
            let registration = if list
                .lines()
                .any(|line| line.to_lowercase().contains("mandate"))
            {
                "Mandate was already registered with Hermes".to_string()
            } else {
                command_receipt_with_input(
                    {
                        let mut command = Command::new("hermes");
                        command.env("HOME", &home).args([
                            "mcp",
                            "add",
                            "mandate",
                            "--command",
                            "node",
                            "--env",
                            &format!("MANDATE_AGENT_CREDENTIAL_FILE={credential}"),
                            "--args",
                            &entry,
                        ]);
                        command
                    },
                    "Y\n",
                )?
            };
            let probe = command_receipt({
                let mut command = Command::new("hermes");
                command.env("HOME", &home).args(["mcp", "test", "mandate"]);
                command
            })?;
            if probe.contains('✗')
                || probe.to_lowercase().contains("not found")
                || probe.to_lowercase().contains("failed")
            {
                return Err(ApiError::new("runtime_probe_failed", probe, false));
            }
            Ok(
                serde_json::json!({"runtime":"hermes","registration":registration,"probe":probe,"mcp_entry":entry}),
            )
        }
        "openclaw" => {
            let registration = command_receipt({
                let mut command = Command::new("openclaw");
                command.env("HOME", &home).args([
                    "mcp",
                    "add",
                    "mandate",
                    "--command",
                    "node",
                    "--arg",
                    &entry,
                    "--env",
                    &format!("MANDATE_AGENT_CREDENTIAL_FILE={credential}"),
                ]);
                command
            })?;
            let include = "get_balance,create_receive_endpoint,create_invoice,create_checkout,create_payment_session,get_payment_session,transfer_funds,get_transactions,refund_transaction";
            let _ = command_receipt({
                let mut command = Command::new("openclaw");
                command
                    .env("HOME", &home)
                    .args(["mcp", "tools", "mandate", "--include", include]);
                command
            });
            let probe = command_receipt({
                let mut command = Command::new("openclaw");
                command
                    .env("HOME", &home)
                    .args(["mcp", "doctor", "mandate", "--probe"]);
                command
            })?;
            Ok(
                serde_json::json!({"runtime":"openclaw","registration":registration,"probe":probe,"mcp_entry":entry}),
            )
        }
        _ => Err(ApiError::invalid("runtime must be openclaw or hermes")),
    }
}

async fn install_agent(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ApiErrorResponse> {
    auth(&s, &headers, true, None, None, true)?;
    let snapshot = s.service.dashboard_snapshot(
        None,
        RuntimeDetection {
            openclaw: runtime_detected("openclaw"),
            hermes: runtime_detected("hermes"),
        },
    )?;
    let agent = snapshot
        .agents
        .into_iter()
        .find(|agent| agent.id == id)
        .ok_or_else(|| ApiErrorResponse(ApiError::not_found("agent")))?;
    if !runtime_detected(&agent.runtime) {
        s.service.set_agent_installation(
            &id,
            "runtime_missing",
            Some("The runtime executable was not found in the daemon PATH"),
        )?;
        return Err(ApiError::new(
            "runtime_unavailable",
            format!(
                "{} is not installed or not visible to the daemon",
                agent.runtime
            ),
            false,
        )
        .into());
    }
    let credential_path = integration_home()
        .join(".config/mandate/agents")
        .join(format!("{id}.token"));
    let receipt = install_runtime(&agent.runtime, &credential_path);
    match receipt {
        Ok(receipt) => {
            s.service.set_agent_installation(
                &id,
                "installed",
                Some("Runtime registration and MCP probe succeeded"),
            )?;
            Ok(Json(
                serde_json::json!({"agent_id":id,"status":"installed","receipt":receipt}),
            ))
        }
        Err(error) => {
            let _ = s
                .service
                .set_agent_installation(&id, "failed", Some(&error.message));
            Err(error.into())
        }
    }
}
async fn revoke_agent(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ApiErrorResponse> {
    auth(&s, &headers, true, None, None, true)?;
    s.service.revoke_agent(&id)?;
    let credential_path = integration_home()
        .join(".config/mandate/agents")
        .join(format!("{id}.token"));
    if credential_path.exists() {
        std::fs::remove_file(&credential_path)
            .map_err(|error| ApiError::internal(error.to_string()))?;
    }
    Ok(Json(serde_json::json!({"agent_id":id,"status":"revoked"})))
}
async fn diagnostics(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiErrorResponse> {
    auth(&s, &headers, true, None, None, false)?;
    Ok(Json(serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "started_at": s.started_at,
        "daemon": {"status":"running","detail":"Listening on loopback only"},
        "database": {"status":"protected","detail":"SQLCipher key is stored in macOS Keychain"},
        "transport": {
            "tcp":{"status":"ready","detail":"127.0.0.1:7741"},
            "unix_socket":{"status":"ready","detail":"Per-user socket · 0600"}
        },
        "provider_host":{"status":"manual_only","detail":"Bundled providers can validate credentials in isolated processes; operation supervision is pending"},
        "reconciliation":{"status":"manual_only","detail":"Scheduled polling and full comparison are not enabled"},
        "recovery":{"status":"not_configured","detail":"Recovery-package export is not implemented"}
    })))
}
async fn schema(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiErrorResponse> {
    auth(&s, &headers, true, None, None, false)?;
    Ok(Json(mandate_core::contract_schema()))
}

pub struct ApiErrorResponse(ApiError);
impl From<ApiError> for ApiErrorResponse {
    fn from(v: ApiError) -> Self {
        Self(v)
    }
}
impl IntoResponse for ApiErrorResponse {
    fn into_response(self) -> axum::response::Response {
        let status = match self.0.code.as_str() {
            "invalid_input" => StatusCode::BAD_REQUEST,
            "unauthorized" => StatusCode::UNAUTHORIZED,
            "forbidden" => StatusCode::FORBIDDEN,
            "not_found" => StatusCode::NOT_FOUND,
            "already_initialized" | "invalid_state" => StatusCode::CONFLICT,
            "insufficient_funds" | "capability_unavailable" => StatusCode::UNPROCESSABLE_ENTITY,
            "provider_host_unavailable" => StatusCode::SERVICE_UNAVAILABLE,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (status, Json(self.0)).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use http_body_util::BodyExt;
    use tower::ServiceExt;
    #[tokio::test]
    async fn init_auth_and_balance() {
        let svc = MandateService::in_memory().unwrap();
        let app = router(svc);
        let init = app
            .clone()
            .oneshot(
                Request::post("/v1/init")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"name":"Test"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(init.status(), StatusCode::OK);
        let body = init.into_body().collect().await.unwrap().to_bytes();
        let result: InitResult = serde_json::from_slice(&body).unwrap();
        let unauth = app
            .clone()
            .oneshot(
                Request::get(format!("/v1/accounts/{}/balance", result.account.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unauth.status(), StatusCode::UNAUTHORIZED);
        let ok = app
            .oneshot(
                Request::get(format!("/v1/accounts/{}/balance", result.account.id))
                    .header("authorization", format!("Bearer {}", result.admin_token))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(ok.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn dashboard_ticket_cookie_and_csrf_protect_mutations() {
        let svc = MandateService::in_memory().unwrap();
        let app = router(svc);
        let init = app
            .clone()
            .oneshot(
                Request::post("/v1/init")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"name":"Dashboard test","demo":true}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        let init_body = init.into_body().collect().await.unwrap().to_bytes();
        let result: InitResult = serde_json::from_slice(&init_body).unwrap();
        let ticket_response = app
            .clone()
            .oneshot(
                Request::post("/v1/admin/dashboard-sessions")
                    .header("authorization", format!("Bearer {}", result.admin_token))
                    .header("content-type", "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(ticket_response.status(), StatusCode::OK);
        let ticket_body = ticket_response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes();
        let ticket: serde_json::Value = serde_json::from_slice(&ticket_body).unwrap();
        let login_path = ticket["url"]
            .as_str()
            .unwrap()
            .strip_prefix("http://127.0.0.1:7741")
            .unwrap();
        let login = app
            .clone()
            .oneshot(Request::get(login_path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(login.status(), StatusCode::SEE_OTHER);
        let session_cookie = login
            .headers()
            .get(header::SET_COOKIE)
            .unwrap()
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .to_string();
        let dashboard = app
            .clone()
            .oneshot(
                Request::get("/v1/dashboard")
                    .header(header::COOKIE, &session_cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(dashboard.status(), StatusCode::OK);
        let dashboard_body = dashboard.into_body().collect().await.unwrap().to_bytes();
        let dashboard_json: serde_json::Value = serde_json::from_slice(&dashboard_body).unwrap();
        let csrf = dashboard_json["csrf_token"].as_str().unwrap();
        let receive_body = serde_json::json!({
            "account_id": result.account.id,
            "currency": "USDC",
            "network": "base-sepolia"
        })
        .to_string();
        let rejected = app
            .clone()
            .oneshot(
                Request::post("/v1/receive-endpoints")
                    .header(header::COOKIE, &session_cookie)
                    .header("content-type", "application/json")
                    .body(Body::from(receive_body.clone()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(rejected.status(), StatusCode::FORBIDDEN);
        let accepted = app
            .oneshot(
                Request::post("/v1/receive-endpoints")
                    .header(header::COOKIE, session_cookie)
                    .header("x-mandate-csrf", csrf)
                    .header("content-type", "application/json")
                    .body(Body::from(receive_body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(accepted.status(), StatusCode::OK);
    }
}
