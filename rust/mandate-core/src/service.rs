use crate::*;
use chrono::{Duration, Utc};
use rand::{distributions::Alphanumeric, Rng};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    path::Path,
    sync::{Arc, Mutex},
};
use uuid::Uuid;

#[derive(Clone)]
pub struct MandateService {
    db: Arc<Mutex<Connection>>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct InitResult {
    pub account: EconomicAccount,
    pub admin_token: String,
}

pub fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}
fn random_token() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(48)
        .map(char::from)
        .collect()
}
fn db_err(e: rusqlite::Error) -> ApiError {
    ApiError::internal(e.to_string())
}

impl MandateService {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, ApiError> {
        let key = std::env::var("MANDATE_DATABASE_KEY").map_err(|_| {
            ApiError::new(
                "database_key_missing",
                "MANDATE_DATABASE_KEY must contain the Keychain-unwrapped database key",
                false,
            )
        })?;
        Self::open_with_key(path, &key)
    }

    pub fn open_with_key(path: impl AsRef<Path>, key: &str) -> Result<Self, ApiError> {
        if key.len() < 32 {
            return Err(ApiError::invalid(
                "database key must contain at least 32 characters",
            ));
        }
        let conn = Connection::open(path).map_err(db_err)?;
        // SQLCipher requires the key before any page is read. Binding avoids quoting secrets.
        conn.pragma_update(None, "key", key).map_err(db_err)?;
        let cipher: String = conn
            .query_row("PRAGMA cipher_version", [], |r| r.get(0))
            .map_err(|_| {
                ApiError::new(
                    "sqlcipher_unavailable",
                    "runtime SQLite was not built with SQLCipher",
                    false,
                )
            })?;
        if cipher.is_empty() {
            return Err(ApiError::new(
                "sqlcipher_unavailable",
                "runtime SQLite was not built with SQLCipher",
                false,
            ));
        }
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(db_err)?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(db_err)?;
        let service = Self {
            db: Arc::new(Mutex::new(conn)),
        };
        service.migrate()?;
        Ok(service)
    }

    pub fn in_memory() -> Result<Self, ApiError> {
        let conn = Connection::open_in_memory().map_err(db_err)?;
        conn.pragma_update(None, "key", "mandate-test-key-with-more-than-32-characters")
            .map_err(db_err)?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(db_err)?;
        let service = Self {
            db: Arc::new(Mutex::new(conn)),
        };
        service.migrate()?;
        Ok(service)
    }

    fn migrate(&self) -> Result<(), ApiError> {
        self.db.lock().unwrap().execute_batch(r#"
CREATE TABLE IF NOT EXISTS principals(id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS economic_accounts(id TEXT PRIMARY KEY, principal_id TEXT NOT NULL REFERENCES principals(id), name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS instance_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS provider_connections(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES economic_accounts(id), provider_id TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(account_id,provider_id));
CREATE TABLE IF NOT EXISTS grants(id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES economic_accounts(id), authority TEXT NOT NULL, capabilities TEXT NOT NULL, revoked_at TEXT);
CREATE TABLE IF NOT EXISTS agent_profiles(agent_id TEXT PRIMARY KEY, name TEXT NOT NULL, runtime TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT);
CREATE TABLE IF NOT EXISTS agent_runtime_installations(agent_id TEXT PRIMARY KEY REFERENCES agent_profiles(agent_id), status TEXT NOT NULL, detail TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS credentials(token_hash TEXT PRIMARY KEY, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, is_admin INTEGER NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
CREATE TABLE IF NOT EXISTS positions(account_id TEXT NOT NULL, provider TEXT NOT NULL, asset TEXT NOT NULL, network TEXT NOT NULL DEFAULT '', available TEXT NOT NULL, reserved TEXT NOT NULL, pending TEXT NOT NULL, settled TEXT NOT NULL, decimals INTEGER NOT NULL, reconciled_at TEXT NOT NULL, PRIMARY KEY(account_id, provider, asset, network));
CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY, kind TEXT NOT NULL, account_id TEXT NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL, amount TEXT, currency TEXT, external_url TEXT, address TEXT, expires_at TEXT, idempotency_key TEXT, created_at TEXT NOT NULL, UNIQUE(account_id, kind, idempotency_key));
CREATE TABLE IF NOT EXISTS refund_links(operation_id TEXT NOT NULL REFERENCES operations(id), original_transaction_id TEXT NOT NULL REFERENCES operations(id), created_at TEXT NOT NULL, PRIMARY KEY(operation_id, original_transaction_id));
CREATE TABLE IF NOT EXISTS journal_transactions(id TEXT PRIMARY KEY, account_id TEXT NOT NULL, operation_id TEXT, description TEXT NOT NULL, asset TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS journal_entries(id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id TEXT NOT NULL REFERENCES journal_transactions(id), ledger_account TEXT NOT NULL, amount_atomic TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS provider_events(provider TEXT NOT NULL, external_event_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(provider, external_event_id));
CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS funding_movements(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES economic_accounts(id), idempotency_key TEXT NOT NULL, record TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(account_id,idempotency_key));
INSERT OR IGNORE INTO provider_connections(id,account_id,provider_id,mode,status,created_at)
SELECT 'pcon_coinbase_' || account_id,account_id,'coinbase-cdp-wallet','demo','connected',MIN(reconciled_at) FROM positions WHERE provider='fake-treasury' GROUP BY account_id;
INSERT OR IGNORE INTO provider_connections(id,account_id,provider_id,mode,status,created_at)
SELECT 'pcon_stripe_' || account_id,account_id,'stripe-revenue','demo','connected',MIN(reconciled_at) FROM positions WHERE provider='fake-revenue' GROUP BY account_id;
INSERT OR IGNORE INTO provider_connections(id,account_id,provider_id,mode,status,created_at)
SELECT 'pcon_lithic_' || account_id,account_id,'lithic-card','demo','connected',MIN(reconciled_at) FROM positions WHERE provider='fake-card' GROUP BY account_id;
"#).map_err(db_err)
    }

    pub fn initialize(&self) -> Result<InitResult, ApiError> {
        self.initialize_instance("Primary account", true)
    }

    pub fn is_initialized(&self) -> Result<bool, ApiError> {
        self.db
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) > 0 FROM principals", [], |row| row.get(0))
            .map_err(db_err)
    }

    pub fn initialize_instance(
        &self,
        account_name: &str,
        demo: bool,
    ) -> Result<InitResult, ApiError> {
        let account_name = account_name.trim();
        if account_name.is_empty() {
            return Err(ApiError::invalid("account name is required"));
        }
        let mut conn = self.db.lock().unwrap();
        let tx = conn.transaction().map_err(db_err)?;
        if tx
            .query_row("SELECT COUNT(*) FROM principals", [], |r| {
                r.get::<_, i64>(0)
            })
            .map_err(db_err)?
            > 0
        {
            return Err(ApiError::new(
                "already_initialized",
                "Mandate is already initialized",
                false,
            ));
        }
        let principal = Principal {
            id: format!("prn_{}", Uuid::new_v4().simple()),
            name: "Local".into(),
        };
        let account = EconomicAccount {
            id: format!("acct_{}", Uuid::new_v4().simple()),
            principal_id: principal.id.clone(),
            name: account_name.into(),
        };
        let token = random_token();
        let now = Utc::now().to_rfc3339();
        tx.execute(
            "INSERT INTO principals VALUES (?1,?2,?3)",
            params![principal.id, principal.name, now],
        )
        .map_err(db_err)?;
        tx.execute(
            "INSERT INTO economic_accounts VALUES (?1,?2,?3,?4)",
            params![account.id, account.principal_id, account.name, now],
        )
        .map_err(db_err)?;
        tx.execute(
            "INSERT INTO credentials VALUES (?1,'principal',?2,1,?3,NULL)",
            params![hash_token(&token), principal.id, now],
        )
        .map_err(db_err)?;
        if demo {
            Self::connect_demo_provider_tx(&tx, &account.id, "coinbase-cdp-wallet")?;
            Self::connect_demo_provider_tx(&tx, &account.id, "stripe-revenue")?;
            Self::connect_demo_provider_tx(&tx, &account.id, "lithic-card")?;
        }
        Self::event_tx(
            &tx,
            "instance.initialized",
            serde_json::json!({"account_id": account.id,"demo":demo}),
        )?;
        tx.commit().map_err(db_err)?;
        Ok(InitResult {
            account,
            admin_token: token,
        })
    }

    pub fn authenticate(
        &self,
        token: &str,
        admin_required: bool,
        capability: Option<&str>,
        account: Option<&str>,
    ) -> Result<(), ApiError> {
        let conn = self.db.lock().unwrap();
        let row = conn.query_row("SELECT subject_id,is_admin FROM credentials WHERE token_hash=?1 AND revoked_at IS NULL", [hash_token(token)], |r| Ok((r.get::<_, String>(0)?, r.get::<_, bool>(1)?))).optional().map_err(db_err)?.ok_or_else(ApiError::unauthorized)?;
        if admin_required && !row.1 {
            return Err(ApiError::forbidden(
                "administrator credentials are required",
            ));
        }
        if row.1 {
            return Ok(());
        }
        let grant: Option<(String, String)> = conn.query_row("SELECT account_id,capabilities FROM grants WHERE agent_id=?1 AND revoked_at IS NULL", [&row.0], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(db_err)?;
        let (granted_account, capabilities) = grant.ok_or_else(ApiError::unauthorized)?;
        if account.is_some_and(|a| a != granted_account) {
            return Err(ApiError::forbidden(
                "agent cannot access this economic account",
            ));
        }
        let caps: BTreeSet<String> =
            serde_json::from_str(&capabilities).map_err(|e| ApiError::internal(e.to_string()))?;
        if capability.is_some_and(|c| !caps.contains(c)) {
            return Err(ApiError::forbidden(
                "agent grant does not include this capability",
            ));
        }
        Ok(())
    }

    /// Introspect a credential token and return the caller's identity. Used by
    /// the `GET /v1/me` endpoint so an agent can discover the economic account,
    /// authority, and capabilities it is scoped to from its token alone.
    pub fn introspect(&self, token: &str) -> Result<CallerIdentity, ApiError> {
        let conn = self.db.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT subject_id,is_admin FROM credentials WHERE token_hash=?1 AND revoked_at IS NULL",
                [hash_token(token)],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, bool>(1)?)),
            )
            .optional()
            .map_err(db_err)?
            .ok_or_else(ApiError::unauthorized)?;
        if row.1 {
            return Ok(CallerIdentity {
                is_admin: true,
                agent_id: None,
                name: None,
                runtime: None,
                account_id: None,
                account_name: None,
                authority: None,
                capabilities: None,
                status: None,
            });
        }
        let agent_id = row.0;
        let grant = conn
            .query_row(
                "SELECT g.account_id,a.name,g.authority,g.capabilities,COALESCE(p.name,g.agent_id),COALESCE(p.runtime,'custom') FROM grants g JOIN economic_accounts a ON a.id=g.account_id LEFT JOIN agent_profiles p ON p.agent_id=g.agent_id WHERE g.agent_id=?1 AND g.revoked_at IS NULL",
                [&agent_id],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, String>(4)?,
                        r.get::<_, String>(5)?,
                    ))
                },
            )
            .optional()
            .map_err(db_err)?
            .ok_or_else(ApiError::unauthorized)?;
        let (account_id, account_name, authority, capabilities, name, runtime) = grant;
        let authority = match authority.as_str() {
            "shared" => AuthorityMode::Shared,
            "observeonly" | "observe_only" => AuthorityMode::ObserveOnly,
            _ => AuthorityMode::Independent,
        };
        let caps: Vec<String> = serde_json::from_str::<BTreeSet<String>>(&capabilities)
            .map_err(|e| ApiError::internal(e.to_string()))?
            .into_iter()
            .collect();
        Ok(CallerIdentity {
            is_admin: false,
            agent_id: Some(agent_id),
            name: Some(name),
            runtime: Some(runtime),
            account_id: Some(account_id),
            account_name: Some(account_name),
            authority: Some(authority),
            capabilities: Some(caps),
            status: Some("connected".into()),
        })
    }

    pub fn list_accounts(&self) -> Result<Vec<EconomicAccount>, ApiError> {
        let conn = self.db.lock().unwrap();
        let mut statement = conn
            .prepare("SELECT id,principal_id,name FROM economic_accounts ORDER BY created_at,id")
            .map_err(db_err)?;
        let accounts = statement
            .query_map([], |row| {
                Ok(EconomicAccount {
                    id: row.get(0)?,
                    principal_id: row.get(1)?,
                    name: row.get(2)?,
                })
            })
            .map_err(db_err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db_err)?;
        Ok(accounts)
    }

    pub fn create_account(&self, name: &str) -> Result<EconomicAccount, ApiError> {
        let name = name.trim();
        if name.is_empty() {
            return Err(ApiError::invalid("account name is required"));
        }
        let conn = self.db.lock().unwrap();
        let principal_id = conn
            .query_row(
                "SELECT id FROM principals ORDER BY created_at LIMIT 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(db_err)?
            .ok_or_else(|| ApiError::not_found("principal"))?;
        let account = EconomicAccount {
            id: format!("acct_{}", Uuid::new_v4().simple()),
            principal_id,
            name: name.into(),
        };
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO economic_accounts VALUES (?1,?2,?3,?4)",
            params![account.id, account.principal_id, account.name, now],
        )
        .map_err(db_err)?;
        Self::event_conn(
            &conn,
            "account.created",
            serde_json::json!({"account_id":account.id,"name":account.name}),
        )?;
        Ok(account)
    }

    fn connect_demo_provider_tx(
        tx: &Transaction<'_>,
        account_id: &str,
        provider_id: &str,
    ) -> Result<(), ApiError> {
        let (route, asset, network, available, decimals) = match provider_id {
            "coinbase-cdp-wallet" => ("fake-treasury", "USDC", "base-sepolia", "100000000", 6),
            "stripe-revenue" => ("fake-revenue", "USD", "", "0", 2),
            "lithic-card" => ("fake-card", "USD", "", "100000", 2),
            "bridge-rail" => ("fake-bridge", "USD", "", "0", 2),
            _ => return Err(ApiError::invalid("unknown bundled provider")),
        };
        let exists: bool = tx
            .query_row(
                "SELECT COUNT(*) > 0 FROM economic_accounts WHERE id=?1",
                [account_id],
                |row| row.get(0),
            )
            .map_err(db_err)?;
        if !exists {
            return Err(ApiError::not_found("economic account"));
        }
        let now = Utc::now().to_rfc3339();
        tx.execute(
            "INSERT INTO provider_connections(id,account_id,provider_id,mode,status,created_at) VALUES (?1,?2,?3,'demo','connected',?4) ON CONFLICT(account_id,provider_id) DO UPDATE SET mode='demo',status='connected'",
            params![format!("pcon_{}", Uuid::new_v4().simple()), account_id, provider_id, now],
        )
        .map_err(db_err)?;
        tx.execute(
            "INSERT OR IGNORE INTO positions(account_id,provider,asset,network,available,reserved,pending,settled,decimals,reconciled_at) VALUES (?1,?2,?3,?4,?5,'0','0',?5,?6,?7)",
            params![account_id, route, asset, network, available, decimals, now],
        )
        .map_err(db_err)?;
        Ok(())
    }

    pub fn connect_demo_provider(
        &self,
        account_id: &str,
        provider_id: &str,
    ) -> Result<ProviderStatus, ApiError> {
        let mut conn = self.db.lock().unwrap();
        let tx = conn.transaction().map_err(db_err)?;
        Self::connect_demo_provider_tx(&tx, account_id, provider_id)?;
        Self::event_tx(
            &tx,
            "provider.connected",
            serde_json::json!({"account_id":account_id,"provider_id":provider_id,"mode":"demo"}),
        )?;
        tx.commit().map_err(db_err)?;
        drop(conn);
        self.providers_for(account_id)
            .into_iter()
            .find(|provider| provider.id == provider_id)
            .ok_or_else(|| ApiError::not_found("provider"))
    }

    pub fn connect_verified_provider(
        &self,
        account_id: &str,
        provider_id: &str,
        mode: &str,
    ) -> Result<ProviderStatus, ApiError> {
        if !matches!(mode, "sandbox" | "live") {
            return Err(ApiError::invalid("provider mode must be sandbox or live"));
        }
        if !Self::provider_catalog()
            .iter()
            .any(|provider| provider.id == provider_id)
        {
            return Err(ApiError::invalid("unknown bundled provider"));
        }
        let conn = self.db.lock().unwrap();
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM economic_accounts WHERE id=?1",
                [account_id],
                |row| row.get(0),
            )
            .map_err(db_err)?;
        if !exists {
            return Err(ApiError::not_found("economic account"));
        }
        conn.execute(
            "INSERT INTO provider_connections(id,account_id,provider_id,mode,status,created_at) VALUES (?1,?2,?3,?4,'verified',?5) ON CONFLICT(account_id,provider_id) DO UPDATE SET mode=excluded.mode,status='verified'",
            params![format!("pcon_{}", Uuid::new_v4().simple()), account_id, provider_id, mode, Utc::now().to_rfc3339()],
        ).map_err(db_err)?;
        Self::event_conn(
            &conn,
            "provider.verified",
            serde_json::json!({"account_id":account_id,"provider_id":provider_id,"mode":mode}),
        )?;
        drop(conn);
        self.providers_for(account_id)
            .into_iter()
            .find(|provider| provider.id == provider_id)
            .ok_or_else(|| ApiError::not_found("provider"))
    }

    pub fn disconnect_provider(
        &self,
        account_id: &str,
        provider_id: &str,
    ) -> Result<ProviderStatus, ApiError> {
        let route = match provider_id {
            "coinbase-cdp-wallet" => "fake-treasury",
            "stripe-revenue" => "fake-revenue",
            "lithic-card" => "fake-card",
            "bridge-rail" => "fake-bridge",
            _ => return Err(ApiError::invalid("unknown bundled provider")),
        };
        let mut conn = self.db.lock().unwrap();
        let tx = conn.transaction().map_err(db_err)?;
        let mode = tx
            .query_row(
                "SELECT mode FROM provider_connections WHERE account_id=?1 AND provider_id=?2",
                params![account_id, provider_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(db_err)?
            .ok_or_else(|| ApiError::not_found("provider connection"))?;
        if mode == "demo" {
            let blocked: bool = tx
                .query_row(
                    "SELECT COUNT(*) > 0 FROM positions WHERE account_id=?1 AND provider=?2 AND (reserved != '0' OR pending != '0')",
                    params![account_id, route],
                    |row| row.get(0),
                )
                .map_err(db_err)?;
            if blocked {
                return Err(ApiError::new(
                    "provider_in_use",
                    "release reservations and settle pending activity before disconnecting this provider",
                    false,
                ));
            }
            tx.execute(
                "DELETE FROM positions WHERE account_id=?1 AND provider=?2",
                params![account_id, route],
            )
            .map_err(db_err)?;
        }
        tx.execute(
            "DELETE FROM provider_connections WHERE account_id=?1 AND provider_id=?2",
            params![account_id, provider_id],
        )
        .map_err(db_err)?;
        Self::event_tx(
            &tx,
            "provider.disconnected",
            serde_json::json!({"account_id":account_id,"provider_id":provider_id}),
        )?;
        tx.commit().map_err(db_err)?;
        drop(conn);
        self.providers_for(account_id)
            .into_iter()
            .find(|provider| provider.id == provider_id)
            .ok_or_else(|| ApiError::not_found("provider"))
    }

    pub fn create_agent(&self, req: AgentCreateRequest) -> Result<AgentCredential, ApiError> {
        Self::validate_agent_capabilities(&req.capabilities)?;
        let conn = self.db.lock().unwrap();
        let agent_id = format!("agt_{}", Uuid::new_v4().simple());
        let token = random_token();
        let caps: BTreeSet<_> = req.capabilities.iter().cloned().collect();
        let caps_json = serde_json::to_string(&caps).unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO grants VALUES (?1,?2,?3,?4,?5,NULL)",
            params![
                format!("grt_{}", Uuid::new_v4().simple()),
                agent_id,
                req.account_id,
                format!("{:?}", req.authority).to_lowercase(),
                caps_json
            ],
        )
        .map_err(db_err)?;
        conn.execute(
            "INSERT INTO credentials VALUES (?1,'agent',?2,0,?3,NULL)",
            params![hash_token(&token), agent_id, now],
        )
        .map_err(db_err)?;
        let runtime = if req.name.to_lowercase().contains("openclaw") {
            "openclaw"
        } else if req.name.to_lowercase().contains("hermes") {
            "hermes"
        } else {
            "custom"
        };
        conn.execute(
            "INSERT INTO agent_profiles(agent_id,name,runtime,created_at,last_seen_at) VALUES (?1,?2,?3,?4,NULL)",
            params![agent_id, req.name, runtime, now],
        )
        .map_err(db_err)?;
        Self::event_conn(
            &conn,
            "agent.created",
            serde_json::json!({"agent_id":agent_id,"name":req.name}),
        )?;
        Ok(AgentCredential {
            agent_id,
            token,
            account_id: req.account_id,
            capabilities: req.capabilities,
        })
    }

    pub fn revoke_agent(&self, agent_id: &str) -> Result<(), ApiError> {
        let mut conn = self.db.lock().unwrap();
        let tx = conn.transaction().map_err(db_err)?;
        let now = Utc::now().to_rfc3339();
        let grants = tx
            .execute(
                "UPDATE grants SET revoked_at=?1 WHERE agent_id=?2 AND revoked_at IS NULL",
                params![now, agent_id],
            )
            .map_err(db_err)?;
        tx.execute("UPDATE credentials SET revoked_at=?1 WHERE subject_type='agent' AND subject_id=?2 AND revoked_at IS NULL",params![now,agent_id]).map_err(db_err)?;
        if grants == 0 {
            return Err(ApiError::not_found("agent"));
        }
        Self::event_tx(
            &tx,
            "agent.revoked",
            serde_json::json!({"agent_id":agent_id}),
        )?;
        tx.commit().map_err(db_err)
    }

    pub fn update_agent(&self, agent_id: &str, req: AgentUpdateRequest) -> Result<(), ApiError> {
        let name = req.name.trim();
        if name.is_empty() {
            return Err(ApiError::invalid("agent name is required"));
        }
        let capabilities: BTreeSet<String> = req.capabilities.into_iter().collect();
        Self::validate_agent_capabilities(&capabilities.iter().cloned().collect::<Vec<_>>())?;
        let mut conn = self.db.lock().unwrap();
        let tx = conn.transaction().map_err(db_err)?;
        let changed = tx.execute(
            "UPDATE grants SET authority=?1,capabilities=?2 WHERE agent_id=?3 AND revoked_at IS NULL",
            params![format!("{:?}", req.authority).to_lowercase(), serde_json::to_string(&capabilities).unwrap(), agent_id],
        ).map_err(db_err)?;
        if changed == 0 {
            return Err(ApiError::not_found("agent"));
        }
        tx.execute(
            "UPDATE agent_profiles SET name=?1 WHERE agent_id=?2",
            params![name, agent_id],
        )
        .map_err(db_err)?;
        Self::event_tx(
            &tx,
            "agent.updated",
            serde_json::json!({"agent_id": agent_id, "capabilities": capabilities}),
        )?;
        tx.commit().map_err(db_err)
    }

    fn validate_agent_capabilities(capabilities: &[String]) -> Result<(), ApiError> {
        let allowed: BTreeSet<&str> = CAPABILITY_IDS.iter().copied().collect();
        if capabilities.is_empty()
            || capabilities
                .iter()
                .any(|capability| !allowed.contains(capability.as_str()))
        {
            return Err(ApiError::invalid(
                "select at least one valid agent capability",
            ));
        }
        Ok(())
    }

    pub fn set_agent_installation(
        &self,
        agent_id: &str,
        status: &str,
        detail: Option<&str>,
    ) -> Result<(), ApiError> {
        let conn = self.db.lock().unwrap();
        conn.execute(
            "INSERT INTO agent_runtime_installations(agent_id,status,detail,updated_at) VALUES (?1,?2,?3,?4) ON CONFLICT(agent_id) DO UPDATE SET status=excluded.status,detail=excluded.detail,updated_at=excluded.updated_at",
            params![agent_id, status, detail, Utc::now().to_rfc3339()],
        ).map_err(db_err)?;
        Self::event_conn(
            &conn,
            "agent.runtime_installation",
            serde_json::json!({"agent_id":agent_id,"status":status,"detail":detail}),
        )
    }

    pub fn set_agent_runtime(&self, agent_id: &str, runtime: &str) -> Result<(), ApiError> {
        let conn = self.db.lock().unwrap();
        let changed = conn
            .execute(
                "UPDATE agent_profiles SET runtime=?1 WHERE agent_id=?2",
                params![runtime, agent_id],
            )
            .map_err(db_err)?;
        if changed == 0 {
            return Err(ApiError::not_found("agent"));
        }
        Ok(())
    }

    pub fn balance(&self, account_id: &str) -> Result<BalanceResponse, ApiError> {
        let conn = self.db.lock().unwrap();
        let account_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM economic_accounts WHERE id=?1",
                [account_id],
                |row| row.get(0),
            )
            .map_err(db_err)?;
        if !account_exists {
            return Err(ApiError::not_found("economic account"));
        }
        let mut stmt = conn.prepare("SELECT provider,asset,network,available,reserved,pending,settled,decimals,reconciled_at FROM positions WHERE account_id=?1 ORDER BY provider,asset").map_err(db_err)?;
        let rows = stmt
            .query_map([account_id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, String>(6)?,
                    r.get::<_, u8>(7)?,
                    r.get::<_, String>(8)?,
                ))
            })
            .map_err(db_err)?;
        let mut positions = vec![];
        for row in rows {
            let (p, a, n, av, re, pe, se, d, t) = row.map_err(db_err)?;
            positions.push(Position {
                provider: p,
                asset: a,
                network: if n.is_empty() { None } else { Some(n) },
                available: AtomicAmount::new(av)?,
                reserved: AtomicAmount::new(re)?,
                pending: AtomicAmount::new(pe)?,
                settled: AtomicAmount::new(se)?,
                decimals: d,
                reconciled_at: t.parse().map_err(|e| ApiError::internal(format!("{e}")))?,
            });
        }
        Ok(BalanceResponse {
            account_id: account_id.into(),
            positions,
            estimated_usd_atomic: None,
            estimated_at: Utc::now(),
        })
    }

    fn catalog_provider_id(provider: &str) -> &str {
        match provider {
            "fake-revenue" => "stripe-revenue",
            "fake-treasury" => "coinbase-cdp-wallet",
            "fake-card" => "lithic-card",
            "fake-bridge" => "bridge-rail",
            other => other,
        }
    }

    fn provider_category(provider: &str) -> Option<&'static str> {
        match Self::catalog_provider_id(provider) {
            "stripe-revenue" => Some("Receive"),
            "coinbase-cdp-wallet" => Some("Hold"),
            "lithic-card" => Some("Spend"),
            "bridge-rail" => Some("Bridge"),
            _ => None,
        }
    }

    fn convert_decimals(value: i128, from: u8, to: u8) -> Result<i128, ApiError> {
        if from == to {
            return Ok(value);
        }
        if from < to {
            return value
                .checked_mul(10_i128.pow((to - from).into()))
                .ok_or_else(|| ApiError::invalid("amount is too large"));
        }
        Ok(value / 10_i128.pow((from - to).into()))
    }

    fn liquidity_source<'a>(
        positions: &'a [Position],
        currency: &str,
        target_decimals: u8,
    ) -> Option<(&'a Position, i128)> {
        positions
            .iter()
            .filter(|position| {
                matches!(
                    Self::provider_category(&position.provider),
                    Some("Receive" | "Hold")
                ) && (position.asset.eq_ignore_ascii_case(currency)
                    || (currency == "USD" && position.asset.eq_ignore_ascii_case("USDC")))
            })
            .filter_map(|position| {
                Self::convert_decimals(
                    position.available.as_i128(),
                    position.decimals,
                    target_decimals,
                )
                .ok()
                .map(|available| (position, available))
            })
            .max_by_key(|(position, available)| {
                (
                    *available,
                    matches!(Self::provider_category(&position.provider), Some("Receive")),
                )
            })
    }

    pub fn liquidity_status(
        &self,
        account_id: &str,
        currency: &str,
    ) -> Result<LiquidityStatusResponse, ApiError> {
        let currency = currency.trim().to_uppercase();
        if currency.is_empty() {
            return Err(ApiError::invalid("currency is required"));
        }
        let balance = self.balance(account_id)?;
        let providers = self.providers_for(account_id);
        let connected = |id: &str| {
            providers.iter().any(|provider| {
                provider.id == id
                    && matches!(provider.state.as_str(), "sandbox" | "live_ready" | "live")
            })
        };
        let spend_positions: Vec<&Position> = balance
            .positions
            .iter()
            .filter(|position| {
                matches!(Self::provider_category(&position.provider), Some("Spend"))
                    && position.asset.eq_ignore_ascii_case(&currency)
            })
            .collect();
        let decimals = spend_positions
            .first()
            .map(|position| position.decimals)
            .or_else(|| {
                balance
                    .positions
                    .iter()
                    .find(|position| position.asset.eq_ignore_ascii_case(&currency))
                    .map(|position| position.decimals)
            })
            .unwrap_or(2);
        let sum = |values: Vec<i128>| -> Result<AtomicAmount, ApiError> {
            AtomicAmount::new(
                values
                    .into_iter()
                    .try_fold(0_i128, |total, value| total.checked_add(value))
                    .ok_or_else(|| ApiError::invalid("liquidity total is too large"))?
                    .to_string(),
            )
        };
        let normalized = |position: &Position, value: i128| {
            Self::convert_decimals(value, position.decimals, decimals)
        };
        let earned_settled = sum(balance
            .positions
            .iter()
            .filter(|position| {
                matches!(Self::provider_category(&position.provider), Some("Receive"))
                    && position.asset.eq_ignore_ascii_case(&currency)
            })
            .map(|position| normalized(position, position.settled.as_i128()))
            .collect::<Result<Vec<_>, _>>()?)?;
        let pending_settlement = sum(balance
            .positions
            .iter()
            .filter(|position| {
                matches!(Self::provider_category(&position.provider), Some("Receive"))
                    && position.asset.eq_ignore_ascii_case(&currency)
            })
            .map(|position| normalized(position, position.pending.as_i128()))
            .collect::<Result<Vec<_>, _>>()?)?;
        let spendable_now = sum(spend_positions
            .iter()
            .map(|position| normalized(position, position.available.as_i128()))
            .collect::<Result<Vec<_>, _>>()?)?;
        let source = Self::liquidity_source(&balance.positions, &currency, decimals);
        let source_provider =
            source.map(|(position, _)| Self::catalog_provider_id(&position.provider).to_string());
        let destination_provider = spend_positions
            .first()
            .map(|position| Self::catalog_provider_id(&position.provider).to_string());
        let bridge_ready = connected("bridge-rail");
        let route_ready =
            source_provider.is_some() && destination_provider.is_some() && bridge_ready;
        let unavailable_reason = if destination_provider.is_none() {
            Some(format!("No connected Spend provider accepts {currency}."))
        } else if source_provider.is_none() {
            Some(format!(
                "No settled Receive or Hold position can fund {currency} spending."
            ))
        } else if !bridge_ready {
            Some("Connect a Bridge provider to make capital spendable.".into())
        } else {
            None
        };
        let available_to_fund = AtomicAmount::new(
            if route_ready {
                source.map(|(_, available)| available).unwrap_or(0)
            } else {
                0
            }
            .to_string(),
        )?;
        Ok(LiquidityStatusResponse {
            account_id: account_id.into(),
            currency,
            decimals,
            earned_settled,
            spendable_now,
            available_to_fund,
            pending_settlement,
            spend_route: LiquidityRoute {
                source_provider,
                destination_provider,
                via: if bridge_ready {
                    vec!["bridge-rail".into()]
                } else {
                    Default::default()
                },
                status: if route_ready { "ready" } else { "unavailable" }.into(),
                estimated_duration_seconds: route_ready.then_some(300),
                unavailable_reason,
            },
            estimated_at: Utc::now(),
        })
    }

    pub fn fund_spend(&self, req: FundSpendRequest) -> Result<FundingMovement, ApiError> {
        let account_id = req.money.account_id.clone();
        let currency = req.money.currency.trim().to_uppercase();
        let target = req.money.amount.as_i128();
        if target == 0 {
            return Err(ApiError::invalid(
                "target spendable amount must be greater than zero",
            ));
        }
        let idempotency_key = req
            .money
            .idempotency_key
            .clone()
            .unwrap_or_else(|| format!("idem_{}", Uuid::new_v4().simple()));
        if let Some(record) = self
            .db
            .lock()
            .unwrap()
            .query_row(
                "SELECT record FROM funding_movements WHERE account_id=?1 AND idempotency_key=?2",
                params![account_id, idempotency_key],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(db_err)?
        {
            return serde_json::from_str(&record)
                .map_err(|error| ApiError::internal(error.to_string()));
        }

        let liquidity = self.liquidity_status(&account_id, &currency)?;
        let spendable_before = liquidity.spendable_now.as_i128();
        let funding_required = target.saturating_sub(spendable_before).max(0);
        let now = Utc::now();
        let mut record = FundingMovement {
            id: format!("mov_{}", Uuid::new_v4().simple()),
            account_id: account_id.clone(),
            currency: currency.clone(),
            target_spendable: req.money.amount,
            spendable_before: liquidity.spendable_now.clone(),
            funding_amount: AtomicAmount::new(funding_required.to_string())?,
            spendable_after: (funding_required == 0)
                .then(|| AtomicAmount::new(spendable_before.to_string()))
                .transpose()?,
            source_provider: liquidity.spend_route.source_provider.clone(),
            destination_provider: liquidity.spend_route.destination_provider.clone(),
            route: {
                let mut route = Vec::new();
                if let Some(source) = &liquidity.spend_route.source_provider {
                    route.push(source.clone());
                }
                route.extend(liquidity.spend_route.via.clone());
                if let Some(destination) = &liquidity.spend_route.destination_provider {
                    route.push(destination.clone());
                }
                route
            },
            state: MovementState::Settled,
            expected_arrival: None,
            created_at: now,
            updated_at: now,
        };

        let balance = self.balance(&account_id)?;
        let destination = balance
            .positions
            .iter()
            .find(|position| {
                matches!(Self::provider_category(&position.provider), Some("Spend"))
                    && position.asset.eq_ignore_ascii_case(&currency)
            })
            .ok_or_else(|| {
                ApiError::new(
                    "capability_unavailable",
                    format!("No connected Spend provider accepts {currency}."),
                    false,
                )
            })?;

        if funding_required > 0 {
            if liquidity.spend_route.status != "ready" {
                return Err(ApiError::new(
                    "capability_unavailable",
                    liquidity
                        .spend_route
                        .unavailable_reason
                        .unwrap_or_else(|| "No executable spend funding route.".into()),
                    false,
                ));
            }
            let source = balance
                .positions
                .iter()
                .filter(|position| {
                    matches!(
                        Self::provider_category(&position.provider),
                        Some("Receive" | "Hold")
                    ) && (position.asset.eq_ignore_ascii_case(&currency)
                        || (currency == "USD" && position.asset.eq_ignore_ascii_case("USDC")))
                })
                .filter_map(|position| {
                    Self::convert_decimals(
                        position.available.as_i128(),
                        position.decimals,
                        liquidity.decimals,
                    )
                    .ok()
                    .filter(|available| *available >= funding_required)
                    .map(|_| position)
                })
                .min_by_key(|position| {
                    !matches!(Self::provider_category(&position.provider), Some("Receive"))
                })
                .ok_or_else(|| {
                    ApiError::new(
                        "insufficient_funds",
                        "settled capital cannot cover the requested spendable target",
                        false,
                    )
                })?;
            record.source_provider = Some(Self::catalog_provider_id(&source.provider).to_string());
            record.route = vec![
                Self::catalog_provider_id(&source.provider).into(),
                "bridge-rail".into(),
                Self::catalog_provider_id(&destination.provider).into(),
            ];
            let providers = self.providers_for(&account_id);
            for provider_id in record.route.iter() {
                let mode = providers
                    .iter()
                    .find(|provider| &provider.id == provider_id)
                    .map(|provider| provider.mode.as_str())
                    .unwrap_or("none");
                if mode != "demo" {
                    return Err(ApiError::new(
                        "provider_dispatch_unavailable",
                        "fund_spend execution is currently enabled only for deterministic demo routes",
                        false,
                    ));
                }
            }
            let source_amount =
                Self::convert_decimals(funding_required, liquidity.decimals, source.decimals)?;
            let mut conn = self.db.lock().unwrap();
            let tx = conn.transaction().map_err(db_err)?;
            let (source_available, source_settled): (String, String) = tx
                .query_row(
                    "SELECT available,settled FROM positions WHERE account_id=?1 AND provider=?2 AND asset=?3",
                    params![account_id, source.provider, source.asset],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(db_err)?;
            let source_available: i128 = source_available
                .parse()
                .map_err(|error: std::num::ParseIntError| ApiError::internal(error.to_string()))?;
            let source_settled: i128 = source_settled
                .parse()
                .map_err(|error: std::num::ParseIntError| ApiError::internal(error.to_string()))?;
            if source_available < source_amount || source_settled < source_amount {
                return Err(ApiError::new(
                    "insufficient_funds",
                    "settled source position changed before funding could execute",
                    false,
                ));
            }
            let (spend_available, spend_settled): (String, String) = tx
                .query_row(
                    "SELECT available,settled FROM positions WHERE account_id=?1 AND provider=?2 AND asset=?3",
                    params![account_id, destination.provider, destination.asset],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(db_err)?;
            let spend_available: i128 = spend_available
                .parse()
                .map_err(|error: std::num::ParseIntError| ApiError::internal(error.to_string()))?;
            let spend_settled: i128 = spend_settled
                .parse()
                .map_err(|error: std::num::ParseIntError| ApiError::internal(error.to_string()))?;
            tx.execute(
                "UPDATE positions SET available=?1,settled=?2,reconciled_at=?3 WHERE account_id=?4 AND provider=?5 AND asset=?6",
                params![
                    (source_available - source_amount).to_string(),
                    (source_settled - source_amount).to_string(),
                    now.to_rfc3339(),
                    account_id,
                    source.provider,
                    source.asset
                ],
            )
            .map_err(db_err)?;
            tx.execute(
                "UPDATE positions SET available=?1,settled=?2,reconciled_at=?3 WHERE account_id=?4 AND provider=?5 AND asset=?6",
                params![
                    (spend_available + funding_required).to_string(),
                    (spend_settled + funding_required).to_string(),
                    now.to_rfc3339(),
                    account_id,
                    destination.provider,
                    destination.asset
                ],
            )
            .map_err(db_err)?;
            Self::post_journal_tx(
                &tx,
                &account_id,
                Some(&record.id),
                "Fund spend source",
                &source.asset,
                &[
                    (
                        format!("asset:{}:{}", source.provider, source.asset),
                        -source_amount,
                    ),
                    (
                        format!("clearing:fund_spend:{}:{}", record.id, source.asset),
                        source_amount,
                    ),
                ],
            )?;
            Self::post_journal_tx(
                &tx,
                &account_id,
                Some(&record.id),
                "Fund spend destination",
                &destination.asset,
                &[
                    (
                        format!("asset:{}:{}", destination.provider, destination.asset),
                        funding_required,
                    ),
                    (
                        format!("clearing:fund_spend:{}:{}", record.id, destination.asset),
                        -funding_required,
                    ),
                ],
            )?;
            record.spendable_after = Some(AtomicAmount::new(
                (spendable_before + funding_required).to_string(),
            )?);
            let serialized = serde_json::to_string(&record)
                .map_err(|error| ApiError::internal(error.to_string()))?;
            tx.execute(
                "INSERT INTO funding_movements(id,account_id,idempotency_key,record,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?5)",
                params![record.id, account_id, idempotency_key, serialized, now.to_rfc3339()],
            )
            .map_err(db_err)?;
            Self::event_tx(
                &tx,
                "spend.funded",
                serde_json::json!({"account_id":account_id,"movement_id":record.id,"funding_amount":record.funding_amount,"currency":currency,"route":record.route}),
            )?;
            tx.commit().map_err(db_err)?;
            return Ok(record);
        }

        let serialized = serde_json::to_string(&record)
            .map_err(|error| ApiError::internal(error.to_string()))?;
        let conn = self.db.lock().unwrap();
        conn.execute(
            "INSERT INTO funding_movements(id,account_id,idempotency_key,record,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?5)",
            params![record.id, account_id, idempotency_key, serialized, now.to_rfc3339()],
        )
        .map_err(db_err)?;
        Self::event_conn(
            &conn,
            "spend.funding_not_needed",
            serde_json::json!({"account_id":account_id,"movement_id":record.id,"target_spendable":record.target_spendable,"currency":currency}),
        )?;
        Ok(record)
    }

    pub fn funding_movement(&self, id: &str) -> Result<FundingMovement, ApiError> {
        let record = self
            .db
            .lock()
            .unwrap()
            .query_row(
                "SELECT record FROM funding_movements WHERE id=?1",
                [id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(db_err)?
            .ok_or_else(|| ApiError::not_found("funding movement"))?;
        serde_json::from_str(&record).map_err(|error| ApiError::internal(error.to_string()))
    }

    fn connected_route(&self, account_id: &str, provider_id: &str) -> Result<String, ApiError> {
        let (catalog_id, route) = match provider_id {
            "coinbase-cdp-wallet" | "fake-treasury" => ("coinbase-cdp-wallet", "fake-treasury"),
            "stripe-revenue" | "fake-revenue" => ("stripe-revenue", "fake-revenue"),
            "lithic-card" | "fake-card" => ("lithic-card", "fake-card"),
            _ => return Err(ApiError::invalid("unknown provider override")),
        };
        let connected: bool = self
            .db
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) > 0 FROM provider_connections WHERE account_id=?1 AND provider_id=?2 AND status != 'disconnected'",
                params![account_id, catalog_id],
                |row| row.get(0),
            )
            .map_err(db_err)?;
        if !connected {
            return Err(ApiError::new(
                "capability_unavailable",
                format!("{catalog_id} is not connected to this economic account"),
                false,
            ));
        }
        Ok(route.into())
    }

    pub fn create_money_operation(
        &self,
        kind: &str,
        req: MoneyRequest,
    ) -> Result<Operation, ApiError> {
        let default_provider = match kind {
            "invoice" | "checkout" | "refund" => "stripe-revenue",
            "payment_session" => "lithic-card",
            _ => "coinbase-cdp-wallet",
        };
        let provider = self.connected_route(
            &req.account_id,
            req.provider.as_deref().unwrap_or(default_provider),
        )?;
        self.insert_operation(
            kind,
            &req.account_id,
            &provider,
            Some(req.amount),
            Some(req.currency),
            req.idempotency_key,
            None,
        )
    }

    pub fn create_receive(&self, req: ReceiveRequest) -> Result<Operation, ApiError> {
        let provider = self.connected_route(
            &req.account_id,
            req.provider.as_deref().unwrap_or("coinbase-cdp-wallet"),
        )?;
        self.insert_operation(
            "receive_endpoint",
            &req.account_id,
            &provider,
            None,
            Some(req.currency),
            req.idempotency_key,
            None,
        )
    }

    pub fn create_payment(&self, req: PaymentSessionRequest) -> Result<Operation, ApiError> {
        let provider = self.connected_route(
            &req.money.account_id,
            req.money.provider.as_deref().unwrap_or("lithic-card"),
        )?;
        let op = self.insert_operation(
            "payment_session",
            &req.money.account_id,
            &provider,
            Some(req.money.amount.clone()),
            Some(req.money.currency.clone()),
            req.money.idempotency_key,
            Some(Utc::now() + Duration::minutes(15)),
        )?;
        self.reserve(
            &op.account_id,
            &op.id,
            op.amount.as_ref().unwrap(),
            op.currency.as_deref().unwrap(),
            &op.provider,
        )?;
        Ok(op)
    }

    pub fn create_transfer(&self, req: TransferRequest) -> Result<Operation, ApiError> {
        let provider = self.connected_route(
            &req.money.account_id,
            req.money
                .provider
                .as_deref()
                .unwrap_or("coinbase-cdp-wallet"),
        )?;
        let op = self.insert_operation(
            "transfer",
            &req.money.account_id,
            &provider,
            Some(req.money.amount.clone()),
            Some(req.money.currency.clone()),
            req.money.idempotency_key,
            None,
        )?;
        self.reserve(
            &op.account_id,
            &op.id,
            op.amount.as_ref().unwrap(),
            op.currency.as_deref().unwrap(),
            &op.provider,
        )?;
        Ok(op)
    }

    /// Create a refund bound to an existing settled incoming customer payment.
    ///
    /// Unlike a generic money-out operation, a refund can only reverse a
    /// specific `checkout` or `invoice` that already happened on this economic
    /// account through the revenue (Stripe) route, and only up to the portion
    /// of the original payment that has not already been refunded. This makes
    /// the `refund` capability safe-by-construction: a prompt-injected agent
    /// cannot turn it into an arbitrary exfiltration mechanism.
    pub fn create_refund(&self, req: RefundRequest) -> Result<Operation, ApiError> {
        let account_id = req.money.account_id.as_str();
        let refund_amount = req.money.amount.as_i128();
        if refund_amount <= 0 {
            return Err(ApiError::invalid("refund amount must be positive"));
        }

        let mut conn = self.db.lock().unwrap();
        // Resolve the original settled incoming customer payment.
        let original: Option<(String, String, String, String)> = conn
            .query_row(
                "SELECT id, provider, amount, currency FROM operations
                 WHERE id=?1 AND account_id=?2 AND kind IN ('checkout','invoice')",
                params![req.transaction_id, account_id],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                    ))
                },
            )
            .optional()
            .map_err(db_err)?;
        let (orig_id, orig_provider, orig_amount_str, orig_currency) =
            original.ok_or_else(|| ApiError::not_found("original settled payment"))?;
        // Refunds can only reverse payments that came in through the revenue
        // (Stripe) route, and must be routed back through that same route.
        if orig_provider != "fake-revenue" && orig_provider != "stripe-revenue" {
            return Err(ApiError::invalid(
                "refund can only reverse a settled customer payment from the revenue provider",
            ));
        }
        if orig_currency != req.money.currency {
            return Err(ApiError::invalid(
                "refund currency must match the original settled payment currency",
            ));
        }
        let orig_amount = orig_amount_str
            .parse::<i128>()
            .map_err(|e| ApiError::internal(format!("invalid original amount: {e}")))?;
        if refund_amount > orig_amount {
            return Err(ApiError::new(
                "refund_exceeds_payment",
                "refund amount exceeds the original settled payment",
                false,
            ));
        }
        // Sum amounts already refunded against this original transaction.
        let already_refunded: i128 = {
            let mut stmt = conn
                .prepare(
                    "SELECT o.amount FROM refund_links rl
                     JOIN operations o ON o.id = rl.operation_id
                     WHERE rl.original_transaction_id = ?1 AND o.status != 'revoked'",
                )
                .map_err(db_err)?;
            let rows = stmt
                .query_map(params![orig_id], |r| r.get::<_, String>(0))
                .map_err(db_err)?;
            let mut total: i128 = 0;
            for row in rows {
                let amount_str = row.map_err(db_err)?;
                total += amount_str
                    .parse::<i128>()
                    .map_err(|e| ApiError::internal(format!("invalid refunded amount: {e}")))?;
            }
            total
        };
        let refundable_remaining = orig_amount - already_refunded;
        if refund_amount > refundable_remaining {
            return Err(ApiError::new(
                "refund_exceeds_remaining",
                "refund amount exceeds the refundable remainder of the original payment",
                false,
            ));
        }

        // The original payment came in through the revenue (Stripe) route, so the
        // refund must go back through that same route. Verify the route is still
        // connected using the connection we already hold rather than re-locking
        // `self.db` (which would deadlock a non-reentrant Mutex).
        let connected: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM provider_connections
                 WHERE account_id=?1 AND provider_id='stripe-revenue'
                   AND status != 'disconnected'",
                params![account_id],
                |row| row.get(0),
            )
            .map_err(db_err)?;
        if !connected {
            return Err(ApiError::new(
                "capability_unavailable",
                "stripe-revenue is not connected to this economic account",
                false,
            ));
        }
        let provider: String = "fake-revenue".into();
        let tx = conn.transaction().map_err(db_err)?;
        let key = req
            .money
            .idempotency_key
            .clone()
            .unwrap_or_else(|| format!("idem_{}", Uuid::new_v4().simple()));
        if let Some(op) = Self::operation_by_key(&tx, account_id, "refund", &key)? {
            return Ok(op);
        }
        let id = format!("ref_{}", Uuid::new_v4().simple());
        let now = Utc::now();
        tx.execute(
            "INSERT INTO operations VALUES (?1,?2,?3,?4,'ready',?5,?6,NULL,NULL,NULL,?7,?8)",
            params![
                id,
                "refund",
                account_id,
                &provider,
                req.money.amount.as_str(),
                &req.money.currency,
                &key,
                now.to_rfc3339()
            ],
        )
        .map_err(db_err)?;
        tx.execute(
            "INSERT INTO refund_links(operation_id, original_transaction_id, created_at) VALUES (?1,?2,?3)",
            params![&id, &orig_id, now.to_rfc3339()],
        )
        .map_err(db_err)?;
        let op = Operation {
            id,
            kind: "refund".into(),
            account_id: account_id.into(),
            provider,
            status: "ready".into(),
            amount: Some(req.money.amount.clone()),
            currency: Some(req.money.currency.clone()),
            external_url: None,
            address: None,
            expires_at: None,
            created_at: now,
        };
        let mut payload = serde_json::to_value(&op).unwrap();
        payload["capability"] = serde_json::Value::String("refund".into());
        payload["original_transaction_id"] = serde_json::Value::String(orig_id);
        Self::event_tx(&tx, "refund.created", payload)?;
        tx.commit().map_err(db_err)?;
        Ok(op)
    }

    #[allow(clippy::too_many_arguments)]
    fn insert_operation(
        &self,
        kind: &str,
        account: &str,
        provider: &str,
        amount: Option<AtomicAmount>,
        currency: Option<String>,
        key: Option<String>,
        expires: Option<chrono::DateTime<Utc>>,
    ) -> Result<Operation, ApiError> {
        let mut conn = self.db.lock().unwrap();
        let tx = conn.transaction().map_err(db_err)?;
        let key = key.unwrap_or_else(|| format!("idem_{}", Uuid::new_v4().simple()));
        if let Some(op) = Self::operation_by_key(&tx, account, kind, &key)? {
            return Ok(op);
        }
        let id = format!(
            "{}_{}",
            match kind {
                "payment_session" => "pay",
                "receive_endpoint" => "recv",
                "invoice" => "inv",
                "checkout" => "chk",
                "transfer" => "txn",
                "refund" => "ref",
                _ => "op",
            },
            Uuid::new_v4().simple()
        );
        let external_url = matches!(kind, "invoice" | "checkout")
            .then(|| format!("https://sandbox.mandate.local/{kind}/{id}"));
        let address = (kind == "receive_endpoint")
            .then(|| "0x0000000000000000000000000000000000000001".into());
        let now = Utc::now();
        tx.execute(
            "INSERT INTO operations VALUES (?1,?2,?3,?4,'ready',?5,?6,?7,?8,?9,?10,?11)",
            params![
                id,
                kind,
                account,
                provider,
                amount.as_ref().map(|v| v.as_str()),
                currency,
                external_url,
                address,
                expires.map(|v| v.to_rfc3339()),
                key,
                now.to_rfc3339()
            ],
        )
        .map_err(db_err)?;
        let op = Operation {
            id,
            kind: kind.into(),
            account_id: account.into(),
            provider: provider.into(),
            status: "ready".into(),
            amount,
            currency,
            external_url,
            address,
            expires_at: expires,
            created_at: now,
        };
        let capability = match kind {
            "receive_endpoint" => "receive",
            "payment_session" => "pay",
            other => other,
        };
        let mut payload = serde_json::to_value(&op).unwrap();
        payload["capability"] = serde_json::Value::String(capability.into());
        Self::event_tx(&tx, &format!("{kind}.created"), payload)?;
        tx.commit().map_err(db_err)?;
        Ok(op)
    }

    fn operation_by_key(
        tx: &Transaction<'_>,
        account: &str,
        kind: &str,
        key: &str,
    ) -> Result<Option<Operation>, ApiError> {
        tx.query_row("SELECT id,provider,status,amount,currency,external_url,address,expires_at,created_at FROM operations WHERE account_id=?1 AND kind=?2 AND idempotency_key=?3",params![account,kind,key],|r|Self::row_operation(r,kind,account)).optional().map_err(db_err)
    }
    fn row_operation(
        r: &rusqlite::Row<'_>,
        kind: &str,
        account: &str,
    ) -> rusqlite::Result<Operation> {
        let amount: Option<String> = r.get(3)?;
        let expires: Option<String> = r.get(7)?;
        let created: String = r.get(8)?;
        Ok(Operation {
            id: r.get(0)?,
            kind: kind.into(),
            account_id: account.into(),
            provider: r.get(1)?,
            status: r.get(2)?,
            amount: amount.map(|v| AtomicAmount::new(v).unwrap()),
            currency: r.get(4)?,
            external_url: r.get(5)?,
            address: r.get(6)?,
            expires_at: expires.map(|v| v.parse().unwrap()),
            created_at: created.parse().unwrap(),
        })
    }

    fn reserve(
        &self,
        account: &str,
        operation: &str,
        amount: &AtomicAmount,
        asset: &str,
        provider: &str,
    ) -> Result<(), ApiError> {
        let mut conn = self.db.lock().unwrap();
        let tx = conn.transaction().map_err(db_err)?;
        let already:i64=tx.query_row("SELECT COUNT(*) FROM journal_transactions WHERE operation_id=?1 AND description='Reserve funds'",[operation],|r|r.get(0)).map_err(db_err)?;
        if already > 0 {
            return Ok(());
        }
        let (available,reserved):(String,String)=tx.query_row("SELECT available,reserved FROM positions WHERE account_id=?1 AND provider=?2 AND asset=?3",params![account,provider,asset],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(db_err)?.ok_or_else(||ApiError::new("insufficient_funds","no matching provider position",false))?;
        let av: i128 = available.parse().unwrap();
        let value = amount.as_i128();
        if av < value {
            return Err(ApiError::new(
                "insufficient_funds",
                "available position cannot cover reservation",
                false,
            ));
        }
        let rv: i128 = reserved.parse().unwrap();
        tx.execute("UPDATE positions SET available=?1,reserved=?2 WHERE account_id=?3 AND provider=?4 AND asset=?5",params![(av-value).to_string(),(rv+value).to_string(),account,provider,asset]).map_err(db_err)?;
        Self::post_journal_tx(
            &tx,
            account,
            Some(operation),
            "Reserve funds",
            asset,
            &[
                (format!("asset:{provider}:{asset}"), -value),
                (format!("liability:reserved:{provider}:{asset}"), value),
            ],
        )?;
        Self::event_tx(
            &tx,
            "funds.reserved",
            serde_json::json!({"operation_id":operation,"amount":amount,"asset":asset}),
        )?;
        tx.commit().map_err(db_err)
    }

    pub fn operation(&self, id: &str) -> Result<Operation, ApiError> {
        let conn = self.db.lock().unwrap();
        conn.query_row("SELECT kind,account_id,id,provider,status,amount,currency,external_url,address,expires_at,created_at FROM operations WHERE id=?1",[id],|r|{let kind:String=r.get(0)?;let account:String=r.get(1)?;let amount:Option<String>=r.get(5)?;let exp:Option<String>=r.get(9)?;let created:String=r.get(10)?;Ok(Operation{id:r.get(2)?,kind,account_id:account,provider:r.get(3)?,status:r.get(4)?,amount:amount.map(|v|AtomicAmount::new(v).unwrap()),currency:r.get(6)?,external_url:r.get(7)?,address:r.get(8)?,expires_at:exp.map(|v|v.parse().unwrap()),created_at:created.parse().unwrap()})}).optional().map_err(db_err)?.ok_or_else(||ApiError::not_found("operation"))
    }

    pub fn revoke_operation(&self, id: &str) -> Result<Operation, ApiError> {
        let mut conn = self.db.lock().unwrap();
        let tx = conn.transaction().map_err(db_err)?;
        let row:Option<(String,String,String,String)>=tx.query_row("SELECT account_id,provider,amount,currency FROM operations WHERE id=?1 AND kind='payment_session' AND status='ready'",[id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(db_err)?;
        let (account, provider, amount, asset) = row.ok_or_else(|| {
            ApiError::new("invalid_state", "payment session cannot be revoked", false)
        })?;
        let value: i128 = amount.parse().unwrap();
        let(av,res):(String,String)=tx.query_row("SELECT available,reserved FROM positions WHERE account_id=?1 AND provider=?2 AND asset=?3",params![account,provider,asset],|r|Ok((r.get(0)?,r.get(1)?))).map_err(db_err)?;
        let av: i128 = av.parse().unwrap();
        let res: i128 = res.parse().unwrap();
        if res < value {
            return Err(ApiError::new(
                "ledger_invariant",
                "reserved position is smaller than session reservation",
                false,
            ));
        }
        tx.execute("UPDATE positions SET available=?1,reserved=?2 WHERE account_id=?3 AND provider=?4 AND asset=?5",params![(av+value).to_string(),(res-value).to_string(),account,provider,asset]).map_err(db_err)?;
        tx.execute("UPDATE operations SET status='revoked' WHERE id=?1", [id])
            .map_err(db_err)?;
        Self::post_journal_tx(
            &tx,
            &account,
            Some(id),
            "Release reservation",
            &asset,
            &[
                (format!("asset:{provider}:{asset}"), value),
                (format!("liability:reserved:{provider}:{asset}"), -value),
            ],
        )?;
        Self::event_tx(&tx, "payment_session.revoked", serde_json::json!({"id":id}))?;
        tx.commit().map_err(db_err)?;
        drop(conn);
        self.operation(id)
    }

    pub fn transactions(
        &self,
        account: &str,
        limit: u32,
    ) -> Result<TransactionsResponse, ApiError> {
        let conn = self.db.lock().unwrap();
        let mut stmt=conn.prepare("SELECT id,operation_id,description,asset,created_at FROM journal_transactions WHERE account_id=?1 ORDER BY created_at DESC LIMIT ?2").map_err(db_err)?;
        let txs = stmt
            .query_map(params![account, limit], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            })
            .map_err(db_err)?;
        let mut data = vec![];
        for row in txs {
            let (id, op, description, asset, created) = row.map_err(db_err)?;
            let mut es=conn.prepare("SELECT ledger_account,amount_atomic FROM journal_entries WHERE transaction_id=?1 ORDER BY id").map_err(db_err)?;
            let entries = es
                .query_map([&id], |r| {
                    Ok(LedgerEntry {
                        account: r.get(0)?,
                        amount_atomic: r.get(1)?,
                    })
                })
                .map_err(db_err)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(db_err)?;
            data.push(TransactionRecord {
                id,
                account_id: account.into(),
                operation_id: op,
                description,
                asset,
                entries,
                created_at: created.parse().unwrap(),
            });
        }
        Ok(TransactionsResponse {
            data,
            next_cursor: None,
        })
    }

    pub fn events_since(&self, after: i64) -> Result<Vec<EventRecord>, ApiError> {
        let conn = self.db.lock().unwrap();
        let mut s=conn.prepare("SELECT id,event_type,payload,created_at FROM outbox WHERE id>?1 ORDER BY id LIMIT 100").map_err(db_err)?;
        let rows = s
            .query_map([after], |r| {
                let p: String = r.get(2)?;
                let t: String = r.get(3)?;
                Ok(EventRecord {
                    id: r.get(0)?,
                    event_type: r.get(1)?,
                    payload: serde_json::from_str(&p).unwrap_or_default(),
                    created_at: t.parse().unwrap(),
                })
            })
            .map_err(db_err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db_err);
        rows
    }

    pub fn providers(&self) -> Vec<ProviderStatus> {
        Self::provider_catalog()
    }

    fn provider_catalog() -> Vec<ProviderStatus> {
        capability_manifest()
            .providers
            .into_iter()
            .map(|provider| ProviderStatus {
                id: provider.id,
                capabilities: provider.agent_capabilities,
                state: "not_connected".into(),
                mode: "none".into(),
            })
            .collect()
    }

    pub fn providers_for(&self, account_id: &str) -> Vec<ProviderStatus> {
        let conn = self.db.lock().unwrap();
        let mut catalog = Self::provider_catalog();
        for provider in &mut catalog {
            let connection = conn
                .query_row(
                    "SELECT mode,status FROM provider_connections WHERE account_id=?1 AND provider_id=?2",
                    params![account_id, provider.id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .optional()
                .ok()
                .flatten();
            if let Some((mode, status)) = connection {
                provider.mode = mode.clone();
                provider.state = if status == "connected" || status == "verified" {
                    if mode == "live" {
                        "live".into()
                    } else {
                        "sandbox".into()
                    }
                } else {
                    status
                };
            }
        }
        catalog
    }

    pub fn capabilities_for(
        &self,
        account_id: &str,
        granted_capabilities: Option<&[String]>,
    ) -> Result<CapabilityAvailabilityResponse, ApiError> {
        let account_exists: bool = self
            .db
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) > 0 FROM economic_accounts WHERE id=?1",
                [account_id],
                |row| row.get(0),
            )
            .map_err(db_err)?;
        if !account_exists {
            return Err(ApiError::not_found("economic account"));
        }

        let manifest = capability_manifest();
        let provider_definitions = manifest.providers.clone();
        let providers = self.providers_for(account_id);
        let capabilities = manifest
            .capabilities
            .into_iter()
            .map(|definition| {
                let granted = granted_capabilities
                    .map(|grants| grants.iter().any(|grant| grant == &definition.id))
                    .unwrap_or(true);
                let provider_ids: Vec<String> = providers
                    .iter()
                    .filter(|provider| {
                        if !matches!(provider.state.as_str(), "sandbox" | "live_ready" | "live") {
                            return false;
                        }
                        let category_matches = provider_definitions
                            .iter()
                            .find(|candidate| candidate.id == provider.id)
                            .is_some_and(|candidate| {
                                definition
                                    .requires_provider_categories
                                    .contains(&candidate.category)
                            });
                        category_matches
                            || provider
                                .capabilities
                                .iter()
                                .any(|cap| cap == &definition.id)
                    })
                    .map(|provider| provider.id.clone())
                    .collect();
                let route_required = !definition.requires_provider_categories.is_empty();
                let route_available = !route_required
                    || definition
                        .requires_provider_categories
                        .iter()
                        .all(|required| {
                            provider_ids.iter().any(|provider_id| {
                                provider_definitions
                                    .iter()
                                    .find(|provider| &provider.id == provider_id)
                                    .is_some_and(|provider| &provider.category == required)
                            })
                        });
                let environment = providers
                    .iter()
                    .find(|provider| provider_ids.contains(&provider.id))
                    .map(|provider| {
                        if provider.mode == "live" {
                            "live".into()
                        } else {
                            "sandbox".into()
                        }
                    });
                let unavailable_reason = if !granted {
                    Some("This agent grant does not allow this capability.".into())
                } else if !route_available {
                    Some(format!(
                        "Connect a {} provider to make this capability executable.",
                        definition.requires_provider_categories.join(" and ")
                    ))
                } else {
                    None
                };
                CapabilityAvailability {
                    definition,
                    granted,
                    available: granted && route_available,
                    provider_ids,
                    environment,
                    unavailable_reason,
                }
            })
            .collect();
        Ok(CapabilityAvailabilityResponse {
            account_id: account_id.into(),
            spec_version: manifest.spec_version,
            updated_at: manifest.updated_at,
            releases: manifest.releases,
            capabilities,
        })
    }

    /// Returns the stored mode (e.g. "demo", "sandbox", "live") for a single
    /// provider connection, or `None` when the provider is not connected to the
    /// given economic account. Used by the dashboard to decide whether to
    /// surface redacted stored credentials.
    pub fn provider_mode(
        &self,
        account_id: &str,
        provider_id: &str,
    ) -> Result<Option<String>, ApiError> {
        let conn = self.db.lock().unwrap();
        let mode: Option<String> = conn
            .query_row(
                "SELECT mode FROM provider_connections WHERE account_id=?1 AND provider_id=?2",
                params![account_id, provider_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(db_err)?;
        Ok(mode)
    }

    pub fn evaluate_continuity(&self, account_id: &str) -> Result<ContinuityEvaluation, ApiError> {
        let providers = self.providers_for(account_id);
        let connected: Vec<_> = providers
            .iter()
            .filter(|p| p.state != "not_connected")
            .map(|p| p.id.as_str())
            .collect();

        let has_stripe = connected.contains(&"stripe-revenue");
        let has_coinbase = connected.contains(&"coinbase-cdp-wallet");
        let has_lithic = connected.contains(&"lithic-card");
        let has_bridge = connected.contains(&"bridge-rail");

        let mut gaps = Vec::new();
        let mut candidate_plans = Vec::new();
        let mut reachable = Vec::new();

        if has_stripe {
            reachable.push("receive.stripe".into());
        }
        if has_coinbase {
            reachable.push("hold.coinbase".into());
        }
        if has_lithic {
            reachable.push("spend.lithic".into());
        }

        let loop_status = if has_stripe && has_coinbase && has_lithic {
            if has_bridge {
                "closed".into()
            } else {
                gaps.push("Revenue cannot currently reach Spend capability (missing Bridge liquidity route)".into());
                candidate_plans.push(serde_json::json!({
                    "title": "Bridge Virtual Account & Liquidation Route",
                    "description": "Connect Bridge to bridge Stripe USD payouts to Coinbase USDC/Base and offramp USDC to Lithic USD collateral.",
                    "legs": ["stripe_to_bridge_va", "bridge_liq_to_lithic"],
                    "autonomous": true,
                    "steps": 2
                }));
                "open".into()
            }
        } else if has_coinbase && !has_stripe && !has_lithic {
            "closed".into()
        } else if connected.is_empty() {
            gaps.push("No provider routes connected yet".into());
            "open".into()
        } else {
            if has_stripe && !has_bridge {
                gaps.push("Stripe USD revenue has no route to Treasury".into());
            }
            if has_lithic && !has_bridge {
                gaps.push("Treasury has no route to fund Lithic Card spend".into());
            }
            "open".into()
        };

        Ok(ContinuityEvaluation {
            account_id: account_id.into(),
            loop_status,
            missing_routes_count: gaps.len(),
            continuity_gaps: gaps,
            candidate_plans,
            reachable_capabilities: reachable,
        })
    }

    pub fn quote_movement(&self, req: MovementQuoteRequest) -> Result<MovementQuote, ApiError> {
        let quote_id = format!("mqt_{}", uuid::Uuid::new_v4().simple());
        let leg = RouteLeg {
            id: format!("leg_{}", uuid::Uuid::new_v4().simple()),
            source: MoneyNodeRef::Position(format!("{}:{}", req.source_provider, req.asset)),
            destination: MoneyNodeRef::Position(format!(
                "{}:{}",
                req.destination_provider, req.asset
            )),
            executor_provider_id: if req.source_provider == "stripe-revenue"
                && req.destination_provider == "coinbase-cdp-wallet"
            {
                "bridge-rail".into()
            } else {
                req.source_provider.clone()
            },
            source_asset: AssetRef {
                code: req.asset.clone(),
                network: None,
            },
            destination_asset: AssetRef {
                code: req.asset.clone(),
                network: None,
            },
            capability: "money.fiat_to_stablecoin".into(),
            environment: Environment::Sandbox,
            execution_mode: RouteExecutionMode::AutomaticSettlement,
            unattended_supported: true,
        };

        Ok(MovementQuote {
            quote_id,
            account_id: req.account_id,
            input_amount: req.amount.clone(),
            input_asset: AssetRef {
                code: req.asset.clone(),
                network: None,
            },
            expected_output_amount: req.amount,
            output_asset: AssetRef {
                code: req.asset,
                network: None,
            },
            fees_atomic: AtomicAmount::new("0")?,
            estimated_duration_seconds: 300,
            expires_at: Utc::now() + chrono::Duration::minutes(15),
            legs: vec![leg],
            autonomous: true,
            human_action_required: None,
        })
    }

    pub fn execute_movement(&self, quote: MovementQuote) -> Result<MovementRecord, ApiError> {
        let account_id = quote.account_id.clone();
        let movement_id = format!("mov_{}", uuid::Uuid::new_v4().simple());
        let now = Utc::now();
        let record = MovementRecord {
            id: movement_id,
            account_id: account_id.clone(),
            quote,
            state: MovementState::Settled,
            created_at: now,
            updated_at: now,
        };

        let conn = self.db.lock().unwrap();
        let tx = conn.unchecked_transaction().map_err(db_err)?;
        let tx_id = format!("tx_{}", uuid::Uuid::new_v4().simple());
        let desc = format!(
            "Autonomous money movement via {}",
            record
                .quote
                .legs
                .first()
                .map(|l| l.executor_provider_id.as_str())
                .unwrap_or("route")
        );
        tx.execute(
            "INSERT INTO transactions (id,account_id,operation_id,description,asset,created_at) VALUES (?1,?2,?3,?4,?5,?6)",
            params![tx_id, account_id, record.id, desc, record.quote.input_asset.code, now.to_rfc3339()],
        ).map_err(db_err)?;

        tx.execute(
            "INSERT INTO ledger_entries (transaction_id,account,amount_atomic) VALUES (?1,?2,?3)",
            params![
                tx_id,
                format!(
                    "positions:{}:USD",
                    record
                        .quote
                        .legs
                        .first()
                        .map(|l| l.executor_provider_id.as_str())
                        .unwrap_or("bridge")
                ),
                record.quote.input_amount.as_str()
            ],
        )
        .map_err(db_err)?;

        tx.commit().map_err(db_err)?;

        Ok(record)
    }

    pub fn dashboard_snapshot(
        &self,
        account_id: Option<&str>,
        runtimes: RuntimeDetection,
    ) -> Result<DashboardSnapshot, ApiError> {
        let (accounts, account, cursor) = {
            let conn = self.db.lock().unwrap();
            let mut statement = conn
                .prepare(
                    "SELECT id,principal_id,name FROM economic_accounts ORDER BY created_at,id",
                )
                .map_err(db_err)?;
            let accounts = statement
                .query_map([], |row| {
                    Ok(EconomicAccount {
                        id: row.get(0)?,
                        principal_id: row.get(1)?,
                        name: row.get(2)?,
                    })
                })
                .map_err(db_err)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(db_err)?;
            let account = account_id
                .and_then(|id| accounts.iter().find(|account| account.id == id).cloned())
                .or_else(|| accounts.first().cloned())
                .ok_or_else(|| ApiError::not_found("economic account"))?;
            let cursor = conn
                .query_row("SELECT COALESCE(MAX(id),0) FROM outbox", [], |r| r.get(0))
                .map_err(db_err)?;
            (accounts, account, cursor)
        };

        let agents = {
            let conn = self.db.lock().unwrap();
            let mut stmt = conn
                .prepare(
                    "SELECT g.agent_id,COALESCE(p.name,g.agent_id),COALESCE(p.runtime,'custom'),g.authority,g.capabilities,g.revoked_at,COALESCE(p.created_at,'1970-01-01T00:00:00Z'),COALESCE(i.status,'not_installed'),i.detail FROM grants g LEFT JOIN agent_profiles p ON p.agent_id=g.agent_id LEFT JOIN agent_runtime_installations i ON i.agent_id=g.agent_id WHERE g.account_id=?1 ORDER BY COALESCE(p.created_at,'') DESC",
                )
                .map_err(db_err)?;
            let rows = stmt
                .query_map([&account.id], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, String>(4)?,
                        r.get::<_, Option<String>>(5)?,
                        r.get::<_, String>(6)?,
                        r.get::<_, String>(7)?,
                        r.get::<_, Option<String>>(8)?,
                    ))
                })
                .map_err(db_err)?;
            let mut agents = vec![];
            for row in rows {
                let (
                    id,
                    name,
                    runtime,
                    authority,
                    capabilities,
                    revoked_at,
                    created_at,
                    installation_status,
                    installation_detail,
                ) = row.map_err(db_err)?;
                let authority = match authority.as_str() {
                    "shared" => AuthorityMode::Shared,
                    "observeonly" | "observe_only" => AuthorityMode::ObserveOnly,
                    _ => AuthorityMode::Independent,
                };
                agents.push(AgentSummary {
                    id,
                    name,
                    runtime,
                    authority,
                    capabilities: serde_json::from_str::<BTreeSet<String>>(&capabilities)
                        .map_err(|e| ApiError::internal(e.to_string()))?
                        .into_iter()
                        .collect(),
                    status: if revoked_at.is_some() {
                        "revoked".into()
                    } else {
                        "connected".into()
                    },
                    created_at: created_at
                        .parse()
                        .map_err(|e| ApiError::internal(format!("{e}")))?,
                    installation_status,
                    installation_detail,
                });
            }
            agents
        };

        Ok(DashboardSnapshot {
            accounts,
            balance: self.balance(&account.id)?,
            transactions: self.transactions(&account.id, 100)?,
            agents,
            providers: self.providers_for(&account.id),
            capabilities: self.capabilities_for(&account.id, None)?,
            outbox_cursor: cursor,
            account,
            runtimes,
        })
    }

    /// Records a normalized provider event exactly once and publishes it atomically.
    pub fn record_provider_event(
        &self,
        provider: &str,
        external_event_id: &str,
        payload: serde_json::Value,
    ) -> Result<bool, ApiError> {
        let mut conn = self.db.lock().unwrap();
        let tx = conn.transaction().map_err(db_err)?;
        let inserted=tx.execute("INSERT OR IGNORE INTO provider_events(provider,external_event_id,payload,created_at) VALUES (?1,?2,?3,?4)",params![provider,external_event_id,payload.to_string(),Utc::now().to_rfc3339()]).map_err(db_err)?==1;
        if inserted {
            Self::event_tx(
                &tx,
                "provider.event",
                serde_json::json!({"provider":provider,"external_event_id":external_event_id,"payload":payload}),
            )?;
        }
        tx.commit().map_err(db_err)?;
        Ok(inserted)
    }

    pub fn post_journal(
        &self,
        account: &str,
        operation: Option<&str>,
        description: &str,
        asset: &str,
        entries: &[(String, i128)],
    ) -> Result<String, ApiError> {
        let mut conn = self.db.lock().unwrap();
        let tx = conn.transaction().map_err(db_err)?;
        let id = Self::post_journal_tx(&tx, account, operation, description, asset, entries)?;
        tx.commit().map_err(db_err)?;
        Ok(id)
    }
    fn post_journal_tx(
        tx: &Transaction<'_>,
        account: &str,
        operation: Option<&str>,
        description: &str,
        asset: &str,
        entries: &[(String, i128)],
    ) -> Result<String, ApiError> {
        if entries.len() < 2 || entries.iter().map(|(_, v)| *v).sum::<i128>() != 0 {
            return Err(ApiError::new(
                "unbalanced_journal",
                "journal entries must contain at least two entries and net to zero",
                false,
            ));
        }
        let id = format!("jrn_{}", Uuid::new_v4().simple());
        tx.execute(
            "INSERT INTO journal_transactions VALUES (?1,?2,?3,?4,?5,?6)",
            params![
                id,
                account,
                operation,
                description,
                asset,
                Utc::now().to_rfc3339()
            ],
        )
        .map_err(db_err)?;
        for (a, v) in entries {
            tx.execute("INSERT INTO journal_entries(transaction_id,ledger_account,amount_atomic) VALUES (?1,?2,?3)",params![id,a,v.to_string()]).map_err(db_err)?;
        }
        Ok(id)
    }
    fn event_tx(
        tx: &Transaction<'_>,
        kind: &str,
        payload: serde_json::Value,
    ) -> Result<(), ApiError> {
        tx.execute(
            "INSERT INTO outbox(event_type,payload,created_at) VALUES (?1,?2,?3)",
            params![kind, payload.to_string(), Utc::now().to_rfc3339()],
        )
        .map_err(db_err)?;
        Ok(())
    }
    fn event_conn(
        conn: &Connection,
        kind: &str,
        payload: serde_json::Value,
    ) -> Result<(), ApiError> {
        conn.execute(
            "INSERT INTO outbox(event_type,payload,created_at) VALUES (?1,?2,?3)",
            params![kind, payload.to_string(), Utc::now().to_rfc3339()],
        )
        .map_err(db_err)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn atomic_amount_rejects_lossy_values() {
        assert!(AtomicAmount::new("1.2").is_err());
        assert_eq!(AtomicAmount::new("00012").unwrap().as_str(), "12");
    }
    #[test]
    fn journal_must_balance() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        assert_eq!(
            s.post_journal(
                &init.account.id,
                None,
                "bad",
                "USD",
                &[("asset:cash".into(), 10)]
            )
            .unwrap_err()
            .code,
            "unbalanced_journal"
        );
        assert!(s
            .post_journal(
                &init.account.id,
                None,
                "ok",
                "USD",
                &[("asset:cash".into(), 10), ("revenue:sales".into(), -10)]
            )
            .is_ok());
    }
    #[test]
    fn idempotency_returns_same_operation() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        let request = MoneyRequest {
            account_id: init.account.id,
            amount: AtomicAmount::new("100").unwrap(),
            currency: "USD".into(),
            provider: None,
            idempotency_key: Some("same".into()),
            metadata: Default::default(),
        };
        let a = s
            .create_money_operation("invoice", request.clone())
            .unwrap();
        let b = s.create_money_operation("invoice", request).unwrap();
        assert_eq!(a.id, b.id);
    }
    #[test]
    fn agent_is_scoped() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        let a = s
            .create_agent(AgentCreateRequest {
                name: "worker".into(),
                account_id: init.account.id.clone(),
                authority: AuthorityMode::Independent,
                capabilities: vec!["balance".into()],
            })
            .unwrap();
        assert!(s
            .authenticate(&a.token, false, Some("balance"), Some(&init.account.id))
            .is_ok());
        assert_eq!(
            s.authenticate(&a.token, false, Some("pay"), Some(&init.account.id))
                .unwrap_err()
                .code,
            "forbidden"
        );
        assert_eq!(
            s.authenticate(&a.token, true, None, None).unwrap_err().code,
            "forbidden"
        );
    }
    #[test]
    fn payment_retry_reserves_once_and_revoke_releases() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        let req = PaymentSessionRequest {
            money: MoneyRequest {
                account_id: init.account.id.clone(),
                amount: AtomicAmount::new("2500").unwrap(),
                currency: "USD".into(),
                provider: None,
                idempotency_key: Some("pay-once".into()),
                metadata: Default::default(),
            },
            mode: "online-checkout".into(),
            merchant: None,
        };
        let first = s.create_payment(req.clone()).unwrap();
        let second = s.create_payment(req).unwrap();
        assert_eq!(first.id, second.id);
        let b = s.balance(&init.account.id).unwrap();
        let card = b
            .positions
            .iter()
            .find(|p| p.provider == "fake-card")
            .unwrap();
        assert_eq!(card.available.as_str(), "97500");
        assert_eq!(card.reserved.as_str(), "2500");
        s.revoke_operation(&first.id).unwrap();
        let b = s.balance(&init.account.id).unwrap();
        let card = b
            .positions
            .iter()
            .find(|p| p.provider == "fake-card")
            .unwrap();
        assert_eq!(card.available.as_str(), "100000");
        assert_eq!(card.reserved.as_str(), "0");
    }
    #[test]
    fn sqlcipher_is_linked() {
        let s = MandateService::in_memory().unwrap();
        let version: String =
            s.db.lock()
                .unwrap()
                .query_row("PRAGMA cipher_version", [], |r| r.get(0))
                .unwrap();
        assert!(!version.is_empty());
    }
    #[test]
    fn on_disk_database_is_encrypted() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ledger.db");
        {
            let s = MandateService::open_with_key(
                &path,
                "a-test-key-that-is-definitely-longer-than-32-bytes",
            )
            .unwrap();
            s.initialize().unwrap();
        }
        let bytes = std::fs::read(path).unwrap();
        assert_ne!(&bytes[..16], b"SQLite format 3\0");
    }
    #[test]
    fn provider_events_are_deduplicated() {
        let s = MandateService::in_memory().unwrap();
        s.initialize().unwrap();
        assert!(s
            .record_provider_event("stripe", "evt_1", serde_json::json!({"type":"paid"}))
            .unwrap());
        assert!(!s
            .record_provider_event("stripe", "evt_1", serde_json::json!({"type":"paid"}))
            .unwrap());
    }

    #[test]
    fn clean_initialization_has_no_implicit_money_or_connections() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize_instance("Primary account", false).unwrap();
        assert!(s.balance(&init.account.id).unwrap().positions.is_empty());
        assert!(s
            .providers_for(&init.account.id)
            .iter()
            .all(|provider| provider.state == "not_connected"));
    }

    #[test]
    fn provider_connections_and_agents_are_account_scoped() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize_instance("Primary account", false).unwrap();
        let second = s.create_account("Research budget").unwrap();
        s.connect_demo_provider(&init.account.id, "stripe-revenue")
            .unwrap();
        assert_eq!(
            s.providers_for(&init.account.id)
                .iter()
                .find(|provider| provider.id == "stripe-revenue")
                .unwrap()
                .state,
            "sandbox"
        );
        assert_eq!(
            s.providers_for(&second.id)
                .iter()
                .find(|provider| provider.id == "stripe-revenue")
                .unwrap()
                .state,
            "not_connected"
        );
        let agent = s
            .create_agent(AgentCreateRequest {
                name: "Hermes Research".into(),
                account_id: second.id.clone(),
                authority: AuthorityMode::ObserveOnly,
                capabilities: vec!["balance".into()],
            })
            .unwrap();
        assert!(s
            .authenticate(&agent.token, false, Some("balance"), Some(&second.id))
            .is_ok());
        assert_eq!(
            s.authenticate(&agent.token, false, Some("balance"), Some(&init.account.id))
                .unwrap_err()
                .code,
            "forbidden"
        );
    }

    #[test]
    fn disconnecting_demo_provider_removes_only_its_idle_position() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize_instance("Treasury", false).unwrap();
        s.connect_demo_provider(&init.account.id, "stripe-revenue")
            .unwrap();
        assert_eq!(s.balance(&init.account.id).unwrap().positions.len(), 1);
        let status = s
            .disconnect_provider(&init.account.id, "stripe-revenue")
            .unwrap();
        assert_eq!(status.state, "not_connected");
        assert!(s.balance(&init.account.id).unwrap().positions.is_empty());
    }

    #[test]
    fn capability_availability_separates_grant_from_provider_route() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize_instance("Treasury", false).unwrap();
        let grants = vec!["checkout".into(), "transactions".into()];
        let before = s.capabilities_for(&init.account.id, Some(&grants)).unwrap();
        let checkout = before
            .capabilities
            .iter()
            .find(|capability| capability.definition.id == "checkout")
            .unwrap();
        assert!(checkout.granted);
        assert!(!checkout.available);
        assert!(checkout
            .unavailable_reason
            .as_ref()
            .unwrap()
            .contains("Receive"));
        assert!(
            before
                .capabilities
                .iter()
                .find(|capability| capability.definition.id == "transactions")
                .unwrap()
                .available
        );

        s.connect_demo_provider(&init.account.id, "stripe-revenue")
            .unwrap();
        let after = s.capabilities_for(&init.account.id, Some(&grants)).unwrap();
        let checkout = after
            .capabilities
            .iter()
            .find(|capability| capability.definition.id == "checkout")
            .unwrap();
        assert!(checkout.available);
        assert_eq!(checkout.environment.as_deref(), Some("sandbox"));
        assert_eq!(checkout.provider_ids, vec!["stripe-revenue"]);
    }

    #[test]
    fn capability_availability_respects_agent_grant() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        let grants = vec!["balance".into()];
        let capabilities = s.capabilities_for(&init.account.id, Some(&grants)).unwrap();
        let pay = capabilities
            .capabilities
            .iter()
            .find(|capability| capability.definition.id == "pay")
            .unwrap();
        assert!(!pay.granted);
        assert!(!pay.available);
        assert!(pay.unavailable_reason.as_ref().unwrap().contains("grant"));
    }

    #[test]
    fn degraded_provider_does_not_make_capability_available() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize_instance("Treasury", false).unwrap();
        s.connect_demo_provider(&init.account.id, "stripe-revenue")
            .unwrap();
        s.db.lock()
            .unwrap()
            .execute(
                "UPDATE provider_connections SET status='degraded' WHERE account_id=?1 AND provider_id='stripe-revenue'",
                [&init.account.id],
            )
            .unwrap();

        let capabilities = s.capabilities_for(&init.account.id, None).unwrap();
        let checkout = capabilities
            .capabilities
            .iter()
            .find(|capability| capability.definition.id == "checkout")
            .unwrap();
        assert!(!checkout.available);
        assert!(checkout.provider_ids.is_empty());
    }

    #[test]
    fn agent_creation_rejects_unknown_capability() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        let error = s
            .create_agent(AgentCreateRequest {
                name: "unsafe".into(),
                account_id: init.account.id,
                authority: AuthorityMode::Independent,
                capabilities: vec!["invent_money".into()],
            })
            .unwrap_err();
        assert_eq!(error.code, "invalid_input");
    }

    #[test]
    fn operation_activity_names_capability_and_selected_provider() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize_instance("Treasury", false).unwrap();
        s.connect_demo_provider(&init.account.id, "stripe-revenue")
            .unwrap();
        s.create_money_operation(
            "checkout",
            MoneyRequest {
                account_id: init.account.id,
                amount: AtomicAmount::new("2000").unwrap(),
                currency: "USD".into(),
                provider: None,
                idempotency_key: Some("playground".into()),
                metadata: Default::default(),
            },
        )
        .unwrap();
        let event = s
            .events_since(0)
            .unwrap()
            .into_iter()
            .find(|event| event.event_type == "checkout.created")
            .unwrap();
        assert_eq!(event.payload["capability"], "checkout");
        assert_eq!(event.payload["provider"], "fake-revenue");
    }

    #[test]
    fn liquidity_status_reports_distinct_spend_and_fund_buckets() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        // Demo seed: lithic USD 100000 (2 dec) spendable, coinbase USDC 100000000 (6 dec),
        // stripe USD 0 earned. No bridge connected yet.
        let status = s.liquidity_status(&init.account.id, "USD").unwrap();
        assert_eq!(status.currency, "USD");
        assert_eq!(status.decimals, 2);
        assert_eq!(status.spendable_now.as_str(), "100000");
        assert_eq!(status.earned_settled.as_str(), "0");
        assert_eq!(status.pending_settlement.as_str(), "0");
        // No bridge yet -> route unavailable, nothing reported as fundable.
        assert_eq!(status.available_to_fund.as_str(), "0");
        assert_eq!(status.spend_route.status, "unavailable");
        assert!(status
            .spend_route
            .unavailable_reason
            .as_deref()
            .unwrap_or("")
            .contains("Bridge"));
        assert_eq!(
            status.spend_route.source_provider.as_deref(),
            Some("coinbase-cdp-wallet")
        );
        assert_eq!(
            status.spend_route.destination_provider.as_deref(),
            Some("lithic-card")
        );
    }

    #[test]
    fn liquidity_status_reports_fundable_once_bridge_closes_loop() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        s.connect_demo_provider(&init.account.id, "bridge-rail")
            .unwrap();
        let status = s.liquidity_status(&init.account.id, "USD").unwrap();
        assert_eq!(status.spend_route.status, "ready");
        // 100 USDC (6 dec) -> 10000 atomic USD (2 dec).
        assert_eq!(status.available_to_fund.as_str(), "10000");
        assert_eq!(status.spend_route.via, vec!["bridge-rail".to_string()]);
    }

    #[test]
    fn fund_spend_requires_closed_loop() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        // No bridge connected -> route unavailable.
        let err = s
            .fund_spend(FundSpendRequest {
                money: MoneyRequest {
                    account_id: init.account.id.clone(),
                    amount: AtomicAmount::new("200000").unwrap(),
                    currency: "USD".into(),
                    provider: None,
                    idempotency_key: Some("fund-once".into()),
                    metadata: Default::default(),
                },
            })
            .unwrap_err();
        assert_eq!(err.code, "capability_unavailable");
    }

    #[test]
    fn fund_spend_moves_demo_positions_and_returns_settled() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        s.connect_demo_provider(&init.account.id, "bridge-rail")
            .unwrap();
        // Spendable starts at 100000 ($1000). Ask for 102500 ($1025) -> fund 2500 ($25)
        // from the 100 USDC treasury position.
        let record = s
            .fund_spend(FundSpendRequest {
                money: MoneyRequest {
                    account_id: init.account.id.clone(),
                    amount: AtomicAmount::new("102500").unwrap(),
                    currency: "USD".into(),
                    provider: None,
                    idempotency_key: Some("fund-once".into()),
                    metadata: Default::default(),
                },
            })
            .unwrap();
        assert_eq!(record.state, MovementState::Settled);
        assert_eq!(record.funding_amount.as_str(), "2500");
        assert_eq!(record.spendable_after.as_ref().unwrap().as_str(), "102500");
        assert_eq!(
            record.source_provider.as_deref(),
            Some("coinbase-cdp-wallet")
        );
        assert_eq!(record.destination_provider.as_deref(), Some("lithic-card"));
        assert_eq!(
            record.route,
            vec![
                "coinbase-cdp-wallet".to_string(),
                "bridge-rail".to_string(),
                "lithic-card".to_string(),
            ]
        );
        let balance = s.balance(&init.account.id).unwrap();
        let card = balance
            .positions
            .iter()
            .find(|p| p.provider == "fake-card")
            .unwrap();
        assert_eq!(card.available.as_str(), "102500");
        let treasury = balance
            .positions
            .iter()
            .find(|p| p.provider == "fake-treasury")
            .unwrap();
        // 100000000 - 25000000 = 75000000 (75 USDC remaining).
        assert_eq!(treasury.available.as_str(), "75000000");
        // The funding movement is retrievable by id.
        let fetched = s.funding_movement(&record.id).unwrap();
        assert_eq!(fetched.id, record.id);
    }

    #[test]
    fn fund_spend_idempotency_returns_same_record_without_double_movement() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        s.connect_demo_provider(&init.account.id, "bridge-rail")
            .unwrap();
        let request = FundSpendRequest {
            money: MoneyRequest {
                account_id: init.account.id.clone(),
                amount: AtomicAmount::new("102500").unwrap(),
                currency: "USD".into(),
                provider: None,
                idempotency_key: Some("fund-idem".into()),
                metadata: Default::default(),
            },
        };
        let first = s.fund_spend(request.clone()).unwrap();
        let second = s.fund_spend(request).unwrap();
        assert_eq!(first.id, second.id);
        // Treasury must only be debited once.
        let balance = s.balance(&init.account.id).unwrap();
        let treasury = balance
            .positions
            .iter()
            .find(|p| p.provider == "fake-treasury")
            .unwrap();
        assert_eq!(treasury.available.as_str(), "75000000");
    }

    #[test]
    fn fund_spend_no_op_when_already_spendable() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        s.connect_demo_provider(&init.account.id, "bridge-rail")
            .unwrap();
        // Spendable already 100000 ($1000); ask for less -> no movement needed.
        let record = s
            .fund_spend(FundSpendRequest {
                money: MoneyRequest {
                    account_id: init.account.id.clone(),
                    amount: AtomicAmount::new("5000").unwrap(),
                    currency: "USD".into(),
                    provider: None,
                    idempotency_key: Some("fund-noop".into()),
                    metadata: Default::default(),
                },
            })
            .unwrap();
        assert_eq!(record.state, MovementState::Settled);
        assert_eq!(record.funding_amount.as_str(), "0");
        let balance = s.balance(&init.account.id).unwrap();
        let treasury = balance
            .positions
            .iter()
            .find(|p| p.provider == "fake-treasury")
            .unwrap();
        assert_eq!(treasury.available.as_str(), "100000000");
    }

    fn checkout_request(account: &str, amount: &str, key: &str) -> MoneyRequest {
        MoneyRequest {
            account_id: account.into(),
            amount: AtomicAmount::new(amount).unwrap(),
            currency: "USD".into(),
            provider: None,
            idempotency_key: Some(key.into()),
            metadata: Default::default(),
        }
    }

    fn refund_req(account: &str, original: &str, amount: &str, key: &str) -> RefundRequest {
        RefundRequest {
            money: checkout_request(account, amount, key),
            transaction_id: original.into(),
        }
    }

    #[test]
    fn refund_reverses_an_existing_settled_customer_payment() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        let payment = s
            .create_money_operation(
                "checkout",
                checkout_request(&init.account.id, "5000", "chk1"),
            )
            .unwrap();
        let refund = s
            .create_refund(refund_req(&init.account.id, &payment.id, "2500", "ref1"))
            .unwrap();
        assert_eq!(refund.kind, "refund");
        assert_eq!(refund.amount.as_ref().unwrap().as_str(), "2500");
        assert_eq!(refund.provider, "fake-revenue");
        // The refund is linked to the original payment.
        let linked: String =
            s.db.lock()
                .unwrap()
                .query_row(
                    "SELECT original_transaction_id FROM refund_links WHERE operation_id=?1",
                    [&refund.id],
                    |r| r.get(0),
                )
                .unwrap();
        assert_eq!(linked, payment.id);
    }

    #[test]
    fn refund_idempotency_returns_same_operation_without_double_linking() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        let payment = s
            .create_money_operation(
                "checkout",
                checkout_request(&init.account.id, "5000", "chk-idem"),
            )
            .unwrap();
        let a = s
            .create_refund(refund_req(
                &init.account.id,
                &payment.id,
                "1000",
                "ref-idem",
            ))
            .unwrap();
        let b = s
            .create_refund(refund_req(
                &init.account.id,
                &payment.id,
                "1000",
                "ref-idem",
            ))
            .unwrap();
        assert_eq!(a.id, b.id);
        let count: i64 =
            s.db.lock()
                .unwrap()
                .query_row(
                    "SELECT COUNT(*) FROM refund_links WHERE operation_id=?1",
                    [&a.id],
                    |r| r.get(0),
                )
                .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn refund_exceeding_the_original_payment_is_rejected() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        let payment = s
            .create_money_operation(
                "checkout",
                checkout_request(&init.account.id, "2500", "chk-cap"),
            )
            .unwrap();
        let err = s
            .create_refund(refund_req(&init.account.id, &payment.id, "3000", "ref-cap"))
            .unwrap_err();
        assert_eq!(err.code, "refund_exceeds_payment");
    }

    #[test]
    fn refund_exceeding_the_refundable_remainder_is_rejected() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        let payment = s
            .create_money_operation(
                "checkout",
                checkout_request(&init.account.id, "5000", "chk-rem"),
            )
            .unwrap();
        s.create_refund(refund_req(
            &init.account.id,
            &payment.id,
            "3000",
            "ref-rem1",
        ))
        .unwrap();
        // 5000 - 3000 = 2000 refundable remaining; asking for 2500 must fail.
        let err = s
            .create_refund(refund_req(
                &init.account.id,
                &payment.id,
                "2500",
                "ref-rem2",
            ))
            .unwrap_err();
        assert_eq!(err.code, "refund_exceeds_remaining");
        // Refunding exactly the remainder succeeds.
        s.create_refund(refund_req(
            &init.account.id,
            &payment.id,
            "2000",
            "ref-rem3",
        ))
        .unwrap();
    }

    #[test]
    fn refund_without_an_original_settled_payment_is_rejected() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        let err = s
            .create_refund(refund_req(
                &init.account.id,
                "chk_nonexistent",
                "1000",
                "ref-none",
            ))
            .unwrap_err();
        assert_eq!(err.code, "not_found");
    }

    #[test]
    fn refund_cannot_reverse_a_payment_from_another_account() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        let other = s.create_account("Foreign account").unwrap();
        s.connect_demo_provider(&other.id, "stripe-revenue")
            .unwrap();
        let foreign_payment = s
            .create_money_operation(
                "checkout",
                checkout_request(&other.id, "5000", "chk-foreign"),
            )
            .unwrap();
        let err = s
            .create_refund(refund_req(
                &init.account.id,
                &foreign_payment.id,
                "1000",
                "ref-foreign",
            ))
            .unwrap_err();
        assert_eq!(err.code, "not_found");
    }

    #[test]
    fn refund_cannot_reverse_a_non_revenue_operation() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        // A receive endpoint is created through the treasury route, not revenue.
        let endpoint = s
            .create_receive(ReceiveRequest {
                account_id: init.account.id.clone(),
                currency: "USDC".into(),
                network: Some("base".into()),
                provider: None,
                idempotency_key: Some("recv1".into()),
            })
            .unwrap();
        let err = s
            .create_refund(RefundRequest {
                money: MoneyRequest {
                    account_id: init.account.id,
                    amount: AtomicAmount::new("1000").unwrap(),
                    currency: "USDC".into(),
                    provider: None,
                    idempotency_key: Some("ref-recv".into()),
                    metadata: Default::default(),
                },
                transaction_id: endpoint.id,
            })
            .unwrap_err();
        assert_eq!(err.code, "not_found");
    }

    #[test]
    fn refund_with_mismatched_currency_is_rejected() {
        let s = MandateService::in_memory().unwrap();
        let init = s.initialize().unwrap();
        let payment = s
            .create_money_operation(
                "checkout",
                checkout_request(&init.account.id, "5000", "chk-cur"),
            )
            .unwrap();
        let err = s
            .create_refund(RefundRequest {
                money: MoneyRequest {
                    account_id: init.account.id,
                    amount: AtomicAmount::new("1000").unwrap(),
                    currency: "EUR".into(),
                    provider: None,
                    idempotency_key: Some("ref-cur".into()),
                    metadata: Default::default(),
                },
                transaction_id: payment.id,
            })
            .unwrap_err();
        assert_eq!(err.code, "invalid_input");
    }
}
