use anyhow::Context;
use mandate_core::MandateService;
use mandated::router;
use rand::{distributions::Alphanumeric, Rng};
use std::path::PathBuf;
use std::process::Command;
use tokio::net::{TcpListener, UnixListener};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    let data_dir = std::env::var_os("MANDATE_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            std::env::var_os("HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("."))
                .join("Library/Application Support/Mandate")
        });
    std::fs::create_dir_all(&data_dir)?;
    let db_path = data_dir.join("mandate.db");
    let key = database_key(!db_path.exists()).context("load SQLCipher key")?;
    let service = MandateService::open_with_key(&db_path, &key).context("open encrypted ledger")?;
    let tcp = TcpListener::bind("127.0.0.1:7741").await?;
    let socket = data_dir.join("mandated.sock");
    if socket.exists() {
        std::fs::remove_file(&socket)?;
    }
    let uds = UnixListener::bind(&socket)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&socket, std::fs::Permissions::from_mode(0o600))?;
    }
    tracing::info!(tcp="127.0.0.1:7741",socket=%socket.display(),"mandated ready");
    let tcp_app = router(service.clone());
    let uds_app = router(service);
    tokio::try_join!(axum::serve(tcp, tcp_app), axum::serve(uds, uds_app))?;
    Ok(())
}

fn database_key(create: bool) -> anyhow::Result<String> {
    if let Ok(key) = std::env::var("MANDATE_DATABASE_KEY") {
        return Ok(key);
    }
    #[cfg(target_os = "macos")]
    {
        let found = Command::new("security")
            .args([
                "find-generic-password",
                "-s",
                "com.mandate.database",
                "-a",
                &std::env::var("USER").unwrap_or_else(|_| "mandate".into()),
                "-w",
            ])
            .output()?;
        if found.status.success() {
            return Ok(String::from_utf8(found.stdout)?.trim().into());
        }
        if create {
            let key: String = rand::thread_rng()
                .sample_iter(&Alphanumeric)
                .take(64)
                .map(char::from)
                .collect();
            let status = Command::new("security")
                .args([
                    "add-generic-password",
                    "-U",
                    "-s",
                    "com.mandate.database",
                    "-a",
                    &std::env::var("USER").unwrap_or_else(|_| "mandate".into()),
                    "-w",
                    &key,
                ])
                .status()?;
            if status.success() {
                return Ok(key);
            }
        }
    }
    Err(anyhow::anyhow!("encrypted ledger key is unavailable; restore it in macOS Keychain or set MANDATE_DATABASE_KEY"))
}
