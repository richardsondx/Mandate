import AppKit
import Foundation
import WebKit

// Mandate menu-bar resident app (Ollama-style).
// Lives in the menu bar, runs the bundled `mandated` daemon, and opens the
// dashboard in a native window on launch. No Dock icon (accessory policy).
// Quitting stops a daemon it started, but leaves an already-running daemon alone.

@main
struct MandateApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        app.run()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var daemon: Process?
    private var dashboardWindow: NSWindow?
    private var webView: WKWebView?
    private var weSpawned = false
    private let port: Int = 7741

    private var bundleURL: URL { Bundle.main.bundleURL }
    private var mandatedURL: URL { bundleURL.appendingPathComponent("Contents/MacOS/mandated") }
    private var webDir: URL { bundleURL.appendingPathComponent("Contents/Resources/dashboard") }
    private var providersDir: URL { bundleURL.appendingPathComponent("Contents/Resources/providers") }
    private var mcpEntry: URL { bundleURL.appendingPathComponent("Contents/Resources/mcp/dist/index.js") }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // If launched from a mounted DMG, install into /Applications and relaunch
        // from there so "open the DMG -> click the app" just works and the app
        // isn't run from a read-only disk image. Falls through on failure.
        if Bundle.main.bundleURL.path.hasPrefix("/Volumes/"), installAndRelaunch() {
            return
        }
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = makeMenuIcon()
        statusItem.menu = buildMenu()
        startDaemon()
        openDashboard()   // start the daemon, then open the dashboard window
    }

    private func installAndRelaunch() -> Bool {
        let src = Bundle.main.bundleURL
        let dst = URL(fileURLWithPath: "/Applications/Mandate.app")
        let fm = FileManager.default
        if fm.fileExists(atPath: dst.path) {
            do { try fm.removeItem(at: dst) } catch { return false }
        }
        let ditto = Process()
        ditto.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
        ditto.arguments = [src.path, dst.path]
        do { try ditto.run() } catch { return false }
        ditto.waitUntilExit()
        guard ditto.terminationStatus == 0 else { return false }
        // Launch the installed copy.
        NSWorkspace.shared.open(dst)
        exit(0)
    }

    private func shutdownDaemon() {
        if weSpawned, let p = daemon, p.isRunning {
            p.terminate()
            p.waitUntilExit()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        // Stop a daemon we started; leave an already-running daemon alone.
        shutdownDaemon()
    }

    private func buildMenu() -> NSMenu {
        let menu = NSMenu()
        menu.addItem(makeItem("Open Dashboard", action: #selector(openDashboard), target: self))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(makeItem("About Mandate", action: #selector(showAbout), target: self))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(makeItem("Quit Mandate", action: #selector(quit), target: self, key: "q"))
        return menu
    }

    private func makeItem(_ title: String, action: Selector, target: AnyObject, key: String? = nil) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key ?? "")
        item.target = target
        return item
    }

    // MARK: - Daemon lifecycle

    private func startDaemon() {
        if isPortOpen() { weSpawned = false; return }   // an existing daemon is already serving
        guard FileManager.default.fileExists(atPath: mandatedURL.path) else { return }
        let p = Process()
        p.executableURL = mandatedURL
        var env = ProcessInfo.processInfo.environment
        env["MANDATE_WEB_DIR"] = webDir.path
        if FileManager.default.fileExists(atPath: providersDir.path) { env["MANDATE_PROVIDERS_DIR"] = providersDir.path }
        if FileManager.default.fileExists(atPath: mcpEntry.path) { env["MANDATE_MCP_ENTRY"] = mcpEntry.path }
        env["MANDATE_PARENT_DEATH_WATCH"] = "1"
        p.environment = env
        p.standardOutput = FileHandle(forWritingAtPath: "/dev/null")
        p.standardError = FileHandle(forWritingAtPath: "/dev/null")
        do {
            try p.run()
            daemon = p
            weSpawned = true
        } catch {
            weSpawned = false
        }
    }

    private func isPortOpen() -> Bool {
        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = UInt16(port).bigEndian
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        let s = socket(AF_INET, SOCK_STREAM, 0)
        guard s >= 0 else { return false }
        defer { close(s) }
        let result = withUnsafePointer(to: &addr) { ptr -> Int32 in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
                connect(s, sa, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        return result == 0
    }

    private func waitForDaemon(timeout: TimeInterval = 8.0) {
        let start = Date()
        while Date().timeIntervalSince(start) < timeout {
            if isPortOpen() { return }
            Thread.sleep(forTimeInterval: 0.25)
        }
    }

    // MARK: - Actions

    @objc func openDashboard() {
        DispatchQueue.global().async {
            self.waitForDaemon()
            // Mint an authenticated one-time dashboard URL from the Keychain
            // admin token (same flow as `mandate dashboard`). On first run
            // there is no admin token yet, so fall back to the onboarding URL.
            let url = self.mintDashboardURL() ?? URL(string: "http://127.0.0.1:7741/")!
            DispatchQueue.main.async { self.showDashboardWindow(with: url) }
        }
    }

    private func showDashboardWindow(with url: URL) {
        if dashboardWindow == nil {
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1200, height: 820),
                             styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                             backing: .buffered, defer: false)
            w.title = "Mandate"
            w.isReleasedWhenClosed = false
            w.center()
            let v = WKWebView(frame: w.contentView!.bounds)
            v.autoresizingMask = [.width, .height]
            w.contentView = v
            dashboardWindow = w
            webView = v
        }
        // (Re)load only when the window is not already showing the dashboard.
        if !(dashboardWindow?.isVisible ?? false) || webView?.url == nil {
            webView?.load(URLRequest(url: url))
        }
        dashboardWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func mintDashboardURL() -> URL? {
        guard let token = readAdminToken() else { return nil }
        var req = URLRequest(url: URL(string: "http://127.0.0.1:7741/v1/admin/dashboard-sessions")!)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = "{}".data(using: .utf8)
        let sem = DispatchSemaphore(value: 0)
        var result: URL? = nil
        let task = URLSession.shared.dataTask(with: req) { data, _, _ in
            sem.signal()
            guard let data = data,
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let s = obj["url"] as? String, let u = URL(string: s) else { return }
            result = u
        }
        task.resume()
        _ = sem.wait(timeout: .now() + 4)
        return result
    }

    private func readAdminToken() -> String? {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/security")
        let user = ProcessInfo.processInfo.environment["USER"] ?? "mandate"
        p.arguments = ["find-generic-password", "-s", "com.mandate.admin", "-a", user, "-w"]
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = FileHandle(forWritingAtPath: "/dev/null")
        do { try p.run() } catch { return nil }
        p.waitUntilExit()
        guard p.terminationStatus == 0 else { return nil }
        let raw = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)
        let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (trimmed?.isEmpty == false) ? trimmed : nil
    }

    @objc func showAbout() {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0"
        let a = NSAlert()
        a.messageText = "Mandate"
        a.informativeText = "One account. Many rails.\nVersion \(v)\nLocal economic operating system."
        a.alertStyle = .informational
        a.addButton(withTitle: "OK")
        a.runModal()
    }

    @objc func quit() {
        if weSpawned, let p = daemon, p.isRunning {
            p.terminate()
            p.waitUntilExit()
        }
        NSApplication.shared.terminate(self)
    }

    // MARK: - Menu bar icon (canonical Mandate mark: three angled bars)

    private func makeMenuIcon() -> NSImage {
        // The canonical Mandate mark (web LogoMark): three angled pill bars in a
        // 25x25 box, drawn in screen (y-down) coordinates so the rotations match.
        let size = NSSize(width: 25, height: 25)
        let image = NSImage(size: size)
        image.isTemplate = true
        image.lockFocus()
        guard let ctx = NSGraphicsContext.current?.cgContext else { image.unlockFocus(); return image }
        ctx.saveGState()
        // flip to y-down to match CSS/screen geometry
        ctx.translateBy(x: 0, y: size.height)
        ctx.scaleBy(x: 1, y: -1)
        // bar = (x, yTop, height, pivotX, pivotY, angle, dropY)
        let bars: [(CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat)] = [
            (4,  4.5, 16, 5.5,  20.5, -25, 0),
            (11, 7,   11, 12.5, 18,   35, 3),
            (18, 4.5, 16, 19.5, 20.5, 25, 0),
        ]
        for (x, yTop, h, px, py, angle, drop) in bars {
            ctx.saveGState()
            ctx.translateBy(x: px, y: py)
            ctx.translateBy(x: 0, y: drop)
            ctx.rotate(by: angle * .pi / 180)
            ctx.translateBy(x: -px, y: -py)
            let rect = CGRect(x: x, y: yTop, width: 3, height: h)
            NSBezierPath(roundedRect: rect, xRadius: 1.5, yRadius: 1.5).fill()
            ctx.restoreGState()
        }
        ctx.restoreGState()
        image.unlockFocus()
        return image
    }
}
