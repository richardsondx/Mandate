class Mandate < Formula
  desc "Local economic operating system for autonomous agents"
  homepage "https://github.com/richardsondx/Mandate"
  version "0.1.0"
  license "Apache-2.0"

  on_macos do
    depends_on "sqlcipher"
  end

  def install
    bin.install "mandate"
    bin.install "mandated"
    bin.install "mandate-mcp"
    libexec.install Dir["providers/*"]
    share.install "web/dist" => "dashboard"
  end

  service do
    run [opt_bin/"mandated", "serve"]
    keep_alive true
    process_type :background
    log_path var/"log/mandated.log"
    error_log_path var/"log/mandated.log"
  end

  test do
    assert_match "mandate", shell_output("#{bin}/mandate --help")
  end
end
