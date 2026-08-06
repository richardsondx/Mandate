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
    pub principal: Principal,
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
CREATE TABLE IF NOT EXISTS credentials(token_hash TEXT PRIMARY KEY, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, is_admin INTEGER NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
CREATE TABLE IF NOT EXISTS positions(account_id TEXT NOT NULL, provider TEXT NOT NULL, asset TEXT NOT NULL, network TEXT NOT NULL DEFAULT '', available TEXT NOT NULL, reserved TEXT NOT NULL, pending TEXT NOT NULL, settled TEXT NOT NULL, decimals INTEGER NOT NULL, reconciled_at TEXT NOT NULL, PRIMARY KEY(account_id, provider, asset, network));
CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY, kind TEXT NOT NULL, account_id TEXT NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL, amount TEXT, currency TEXT, external_url TEXT, address TEXT, expires_at TEXT, idempotency_key TEXT, created_at TEXT NOT NULL, UNIQUE(account_id, kind, idempotency_key));
CREATE TABLE IF NOT EXISTS journal_transactions(id TEXT PRIMARY KEY, account_id TEXT NOT NULL, operation_id TEXT, description TEXT NOT NULL, asset TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS journal_entries(id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id TEXT NOT NULL REFERENCES journal_transactions(id), ledger_account TEXT NOT NULL, amount_atomic TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS provider_events(provider TEXT NOT NULL, external_event_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(provider, external_event_id));
CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
INSERT OR IGNORE INTO provider_connections(id,account_id,provider_id,mode,status,created_at)
SELECT 'pcon_coinbase_' || account_id,account_id,'coinbase-cdp-wallet','demo','connected',MIN(reconciled_at) FROM positions WHERE provider='fake-treasury' GROUP BY account_id;
INSERT OR IGNORE INTO provider_connections(id,account_id,provider_id,mode,status,created_at)
SELECT 'pcon_stripe_' || account_id,account_id,'stripe-revenue','demo','connected',MIN(reconciled_at) FROM positions WHERE provider='fake-revenue' GROUP BY account_id;
INSERT OR IGNORE INTO provider_connections(id,account_id,provider_id,mode,status,created_at)
SELECT 'pcon_lithic_' || account_id,account_id,'lithic-card','demo','connected',MIN(reconciled_at) FROM positions WHERE provider='fake-card' GROUP BY account_id;
"#).map_err(db_err)
    }

    pub fn initialize(&self, name: &str) -> Result<InitResult, ApiError> {
        self.initialize_instance(name, name, "Primary treasury", true)
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
        administrator_name: &str,
        organization_name: &str,
        account_name: &str,
        demo: bool,
    ) -> Result<InitResult, ApiError> {
        let administrator_name = administrator_name.trim();
        let organization_name = organization_name.trim();
        let account_name = account_name.trim();
        if administrator_name.is_empty() || organization_name.is_empty() || account_name.is_empty()
        {
            return Err(ApiError::invalid(
                "administrator, organization, and account names are required",
            ));
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
            name: organization_name.into(),
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
        tx.execute(
            "INSERT INTO instance_settings(key,value) VALUES ('administrator_name',?1)",
            [administrator_name],
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
            principal,
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

    pub fn create_agent(&self, req: AgentCreateRequest) -> Result<AgentCredential, ApiError> {
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
                "SELECT COUNT(*) > 0 FROM provider_connections WHERE account_id=?1 AND provider_id=?2 AND status='connected'",
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
        Self::event_tx(
            &tx,
            &format!("{kind}.created"),
            serde_json::to_value(&op).unwrap(),
        )?;
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
        vec![
            ProviderStatus {
                id: "coinbase-cdp-wallet".into(),
                capabilities: vec!["balance".into(), "receive".into(), "transfer".into()],
                state: "not_connected".into(),
                mode: "none".into(),
            },
            ProviderStatus {
                id: "stripe-revenue".into(),
                capabilities: vec!["invoice".into(), "checkout".into(), "refund".into()],
                state: "not_connected".into(),
                mode: "none".into(),
            },
            ProviderStatus {
                id: "lithic-card".into(),
                capabilities: vec!["pay".into()],
                state: "not_connected".into(),
                mode: "none".into(),
            },
        ]
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
                provider.state = if status == "connected" && mode == "demo" {
                    "sandbox".into()
                } else {
                    status
                };
            }
        }
        catalog
    }

    pub fn dashboard_snapshot(
        &self,
        account_id: Option<&str>,
        runtimes: RuntimeDetection,
    ) -> Result<DashboardSnapshot, ApiError> {
        let (principal, administrator_name, accounts, account, cursor) = {
            let conn = self.db.lock().unwrap();
            let principal = conn
                .query_row(
                    "SELECT id,name FROM principals ORDER BY created_at LIMIT 1",
                    [],
                    |r| {
                        Ok(Principal {
                            id: r.get(0)?,
                            name: r.get(1)?,
                        })
                    },
                )
                .optional()
                .map_err(db_err)?
                .ok_or_else(|| ApiError::not_found("principal"))?;
            let administrator_name = conn
                .query_row(
                    "SELECT value FROM instance_settings WHERE key='administrator_name'",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(db_err)?
                .unwrap_or_else(|| principal.name.clone());
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
            (principal, administrator_name, accounts, account, cursor)
        };

        let agents = {
            let conn = self.db.lock().unwrap();
            let mut stmt = conn
                .prepare(
                    "SELECT g.agent_id,COALESCE(p.name,g.agent_id),COALESCE(p.runtime,'custom'),g.authority,g.capabilities,g.revoked_at,COALESCE(p.created_at,'1970-01-01T00:00:00Z') FROM grants g LEFT JOIN agent_profiles p ON p.agent_id=g.agent_id WHERE g.account_id=?1 ORDER BY COALESCE(p.created_at,'') DESC",
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
                    ))
                })
                .map_err(db_err)?;
            let mut agents = vec![];
            for row in rows {
                let (id, name, runtime, authority, capabilities, revoked_at, created_at) =
                    row.map_err(db_err)?;
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
                });
            }
            agents
        };

        Ok(DashboardSnapshot {
            principal,
            administrator_name,
            accounts,
            balance: self.balance(&account.id)?,
            transactions: self.transactions(&account.id, 100)?,
            agents,
            providers: self.providers_for(&account.id),
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
        let init = s.initialize("Test").unwrap();
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
        let init = s.initialize("Test").unwrap();
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
        let init = s.initialize("Test").unwrap();
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
        let init = s.initialize("Test").unwrap();
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
            s.initialize("Encrypted").unwrap();
        }
        let bytes = std::fs::read(path).unwrap();
        assert_ne!(&bytes[..16], b"SQLite format 3\0");
    }
    #[test]
    fn provider_events_are_deduplicated() {
        let s = MandateService::in_memory().unwrap();
        s.initialize("Test").unwrap();
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
        let init = s
            .initialize_instance("Alex Rivera", "Northstar Studio", "Primary treasury", false)
            .unwrap();
        assert!(s.balance(&init.account.id).unwrap().positions.is_empty());
        assert!(s
            .providers_for(&init.account.id)
            .iter()
            .all(|provider| provider.state == "not_connected"));
    }

    #[test]
    fn provider_connections_and_agents_are_account_scoped() {
        let s = MandateService::in_memory().unwrap();
        let init = s
            .initialize_instance("Alex Rivera", "Northstar Studio", "Primary treasury", false)
            .unwrap();
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
}
