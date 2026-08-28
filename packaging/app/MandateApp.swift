import AppKit
import Foundation
import UserNotifications
import WebKit

// Mandate macOS Application.
// Manages the local `mandated` daemon, provides system menu & menu-bar status item controls,
// and hosts the dashboard inside a native web view window.

@main
struct MandateApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, UNUserNotificationCenterDelegate {
    private var statusItem: NSStatusItem!
    private var daemon: Process?
    private var dashboardWindow: NSWindow?
    private var webView: WKWebView?
    private var weSpawned = false
    private let port: Int = 7741

    private var daemonStatusMenuItem: NSMenuItem?
    private var mainDaemonStatusMenuItem: NSMenuItem?
    private var updateMenuItem: NSMenuItem?
    private var mainUpdateMenuItem: NSMenuItem?
    private var updateCheckTimer: Timer?

    private var bundleURL: URL { Bundle.main.bundleURL }
    private var mandatedURL: URL { bundleURL.appendingPathComponent("Contents/MacOS/mandated") }
    private var webDir: URL { bundleURL.appendingPathComponent("Contents/Resources/dashboard") }
    private var providersDir: URL { bundleURL.appendingPathComponent("Contents/Resources/providers") }
    private var mcpEntry: URL { bundleURL.appendingPathComponent("Contents/Resources/mcp/dist/index.js") }

    private var logURL: URL {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let dir = home.appendingPathComponent(".mandate")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("mandated.log")
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // If launched from a mounted DMG, copy/install into /Applications and relaunch from there
        if Bundle.main.bundleURL.path.hasPrefix("/Volumes/"), installAndRelaunch() {
            return
        }

        NSApp.setActivationPolicy(.regular)
        setupMainMenu()
        setupStatusItem()
        startDaemon()
        openDashboard()
        NSApp.activate(ignoringOtherApps: true)

        UNUserNotificationCenter.current().delegate = self
        checkForUpdates()
        updateCheckTimer = Timer.scheduledTimer(timeInterval: 1800, target: self, selector: #selector(checkForUpdates), userInfo: nil, repeats: true)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        openDashboard()
        return true
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
        shutdownDaemon()
    }

    // MARK: - Menu Bar Setup

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = makeMenuIcon()
        statusItem.menu = buildStatusMenu()
        updateStatusMenuText()
    }

    private func buildStatusMenu() -> NSMenu {
        let menu = NSMenu()
        
        let statusItem = NSMenuItem(title: "Status: Checking…", action: nil, keyEquivalent: "")
        statusItem.isEnabled = false
        self.daemonStatusMenuItem = statusItem
        menu.addItem(statusItem)
        menu.addItem(NSMenuItem.separator())

        let updItem = NSMenuItem(title: "Checking for updates…", action: nil, keyEquivalent: "")
        updItem.isEnabled = false
        self.updateMenuItem = updItem
        menu.addItem(updItem)
        menu.addItem(makeItem("Check for Updates…", action: #selector(checkForUpdates), target: self))
        menu.addItem(NSMenuItem.separator())

        menu.addItem(makeItem("Open Dashboard Window", action: #selector(openDashboard), target: self, key: "o"))
        menu.addItem(makeItem("Open in Browser", action: #selector(openInBrowser), target: self, key: "b"))
        menu.addItem(NSMenuItem.separator())

        menu.addItem(makeItem("Start Daemon", action: #selector(startDaemonAction), target: self))
        menu.addItem(makeItem("Stop Daemon", action: #selector(stopDaemonAction), target: self))
        menu.addItem(makeItem("Restart Daemon", action: #selector(restartDaemonAction), target: self))
        menu.addItem(makeItem("Restart App", action: #selector(restartApp), target: self))
        menu.addItem(makeItem("View Daemon Log", action: #selector(openDaemonLog), target: self))
        menu.addItem(NSMenuItem.separator())

        menu.addItem(makeItem("About Mandate", action: #selector(showAbout), target: self))
        menu.addItem(NSMenuItem.separator())

        menu.addItem(makeItem("Quit Mandate", action: #selector(quit), target: self, key: "q"))
        return menu
    }

    private func setupMainMenu() {
        let mainMenu = NSMenu()

        // 1. App Menu ("Mandate")
        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu(title: "Mandate")
        appMenu.addItem(makeItem("About Mandate", action: #selector(showAbout), target: self))
        let mainUpd = NSMenuItem(title: "Checking for updates…", action: nil, keyEquivalent: "")
        mainUpd.isEnabled = false
        self.mainUpdateMenuItem = mainUpd
        appMenu.addItem(mainUpd)
        appMenu.addItem(makeItem("Check for Updates…", action: #selector(checkForUpdates), target: self))
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(makeItem("Open Dashboard Window", action: #selector(openDashboard), target: self, key: "o"))
        appMenu.addItem(makeItem("Open in Default Browser", action: #selector(openInBrowser), target: self, key: "b"))
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(makeItem("Restart App", action: #selector(restartApp), target: self))
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(makeItem("Hide Mandate", action: #selector(NSApplication.hide(_:)), target: NSApp, key: "h"))
        let hideOthers = NSMenuItem(title: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(hideOthers)
        appMenu.addItem(makeItem("Show All", action: #selector(NSApplication.unhideAllApplications(_:)), target: NSApp))
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(makeItem("Quit Mandate", action: #selector(quit), target: self, key: "q"))
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        // 2. Daemon Menu (Top-level explicit controls)
        let daemonMenuItem = NSMenuItem()
        let daemonMenu = NSMenu(title: "Daemon")
        let mainStatusItem = NSMenuItem(title: "Status: Checking…", action: nil, keyEquivalent: "")
        mainStatusItem.isEnabled = false
        self.mainDaemonStatusMenuItem = mainStatusItem
        daemonMenu.addItem(mainStatusItem)
        daemonMenu.addItem(NSMenuItem.separator())
        daemonMenu.addItem(makeItem("Start Daemon", action: #selector(startDaemonAction), target: self))
        daemonMenu.addItem(makeItem("Stop Daemon", action: #selector(stopDaemonAction), target: self))
        daemonMenu.addItem(makeItem("Restart Daemon", action: #selector(restartDaemonAction), target: self))
        daemonMenu.addItem(NSMenuItem.separator())
        daemonMenu.addItem(makeItem("View Daemon Log", action: #selector(openDaemonLog), target: self, key: "l"))
        daemonMenu.addItem(makeItem("Open Data Directory", action: #selector(openDataDir), target: self))
        daemonMenuItem.submenu = daemonMenu
        mainMenu.addItem(daemonMenuItem)

        // 3. View Menu
        let viewMenuItem = NSMenuItem()
        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(makeItem("Reload Dashboard", action: #selector(reloadDashboard), target: self, key: "r"))
        viewMenuItem.submenu = viewMenu
        mainMenu.addItem(viewMenuItem)

        // 4. Window Menu
        let windowMenuItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(makeItem("Dashboard", action: #selector(openDashboard), target: self, key: "1"))
        windowMenu.addItem(makeItem("Minimize", action: #selector(NSWindow.performMiniaturize(_:)), target: NSApp, key: "m"))
        windowMenu.addItem(makeItem("Zoom", action: #selector(NSWindow.performZoom(_:)), target: NSApp))
        windowMenu.addItem(NSMenuItem.separator())
        windowMenu.addItem(makeItem("Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), target: NSApp))
        windowMenuItem.submenu = windowMenu
        mainMenu.addItem(windowMenuItem)

        NSApp.mainMenu = mainMenu
    }

    private func makeItem(_ title: String, action: Selector, target: AnyObject, key: String? = nil) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key ?? "")
        item.target = target
        return item
    }

    private func updateStatusMenuText() {
        let running = isPortOpen()
        let statusText = running ? "● Daemon Running (127.0.0.1:\(port))" : "○ Daemon Stopped"
        daemonStatusMenuItem?.title = statusText
        mainDaemonStatusMenuItem?.title = statusText
    }

    // MARK: - Daemon lifecycle

    @objc func startDaemonAction() {
        startDaemon()
        updateStatusMenuText()
    }

    @objc func stopDaemonAction() {
        shutdownDaemon()
        daemon = nil
        weSpawned = false
        updateStatusMenuText()
    }

    @objc func restartDaemonAction() {
        stopDaemonAction()
        Thread.sleep(forTimeInterval: 0.5)
        startDaemonAction()
    }

    private func startDaemon() {
        if isPortOpen() {
            weSpawned = false
            updateStatusMenuText()
            return
        }
        guard FileManager.default.fileExists(atPath: mandatedURL.path) else {
            updateStatusMenuText()
            return
        }

        let p = Process()
        p.executableURL = mandatedURL
        var env = ProcessInfo.processInfo.environment
        env["MANDATE_WEB_DIR"] = webDir.path
        if FileManager.default.fileExists(atPath: providersDir.path) { env["MANDATE_PROVIDERS_DIR"] = providersDir.path }
        if FileManager.default.fileExists(atPath: mcpEntry.path) { env["MANDATE_MCP_ENTRY"] = mcpEntry.path }
        env["MANDATE_PARENT_DEATH_WATCH"] = "1"
        p.environment = env

        // Redirect stdout/stderr to ~/.mandate/mandated.log
        if let logHandle = try? FileHandle(forWritingTo: logURL) {
            logHandle.seekToEndOfFile()
            p.standardOutput = logHandle
            p.standardError = logHandle
        } else if FileManager.default.createFile(atPath: logURL.path, contents: nil),
                  let logHandle = try? FileHandle(forWritingTo: logURL) {
            p.standardOutput = logHandle
            p.standardError = logHandle
        } else {
            p.standardOutput = FileHandle(forWritingAtPath: "/dev/null")
            p.standardError = FileHandle(forWritingAtPath: "/dev/null")
        }

        do {
            try p.run()
            daemon = p
            weSpawned = true
        } catch {
            weSpawned = false
        }
        updateStatusMenuText()
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

    private func waitForDaemon(timeout: TimeInterval = 10.0) {
        let start = Date()
        while Date().timeIntervalSince(start) < timeout {
            if isPortOpen() { return }
            Thread.sleep(forTimeInterval: 0.2)
        }
    }

    // MARK: - Actions

    @objc func openDashboard() {
        startDaemon()
        DispatchQueue.global().async {
            self.waitForDaemon()
            let url = self.mintDashboardURL() ?? URL(string: "http://127.0.0.1:7741/")!
            DispatchQueue.main.async {
                self.showDashboardWindow(with: url)
                self.updateStatusMenuText()
            }
        }
    }

    @objc func openInBrowser() {
        startDaemon()
        DispatchQueue.global().async {
            self.waitForDaemon()
            let url = self.mintDashboardURL() ?? URL(string: "http://127.0.0.1:7741/")!
            DispatchQueue.main.async {
                NSWorkspace.shared.open(url)
            }
        }
    }

    @objc func reloadDashboard() {
        if let url = webView?.url ?? URL(string: "http://127.0.0.1:7741/") {
            webView?.load(URLRequest(url: url))
        }
    }

    private func showDashboardWindow(with url: URL) {
        if dashboardWindow == nil {
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1380, height: 880),
                             styleMask: [.titled, .closable, .miniaturizable, .resizable],
                             backing: .buffered, defer: false)
            w.title = "Mandate Dashboard"
            w.isReleasedWhenClosed = false
            w.center()

            let webConfiguration = WKWebViewConfiguration()
            let v = WKWebView(frame: w.contentView!.bounds, configuration: webConfiguration)
            v.autoresizingMask = [.width, .height]
            v.navigationDelegate = self
            if #available(macOS 13.3, *) {
                v.isInspectable = true
            }
            w.contentView = v
            dashboardWindow = w
            webView = v
        }

        webView?.load(URLRequest(url: url))
        dashboardWindow?.setIsVisible(true)
        dashboardWindow?.makeKeyAndOrderFront(nil)
        dashboardWindow?.orderFrontRegardless()
        NSApp.activate(ignoringOtherApps: true)
    }

    // MARK: - WKNavigationDelegate
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("Mandate WKWebView load failed: \(error.localizedDescription)")
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("Mandate WKWebView provisional load failed: \(error.localizedDescription)")
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

    @objc func openDaemonLog() {
        if FileManager.default.fileExists(atPath: logURL.path) {
            NSWorkspace.shared.open(logURL)
        } else {
            let alert = NSAlert()
            alert.messageText = "Daemon Log Not Found"
            alert.informativeText = "No log file exists at \(logURL.path) yet."
            alert.runModal()
        }
    }

    @objc func openDataDir() {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let dir = home.appendingPathComponent(".mandate")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: dir.path)
    }

    @objc func showAbout() {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0"
        let a = NSAlert()
        a.messageText = "Mandate"
        a.informativeText = "One economy. Any provider.\nVersion \(v)\nLocal economic operating system."
        a.alertStyle = .informational
        a.addButton(withTitle: "OK")
        a.runModal()
    }

    @objc func quit() {
        shutdownDaemon()
        NSApplication.shared.terminate(self)
    }

    @objc func restartApp() {
        shutdownDaemon()
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        p.arguments = ["-n", bundleURL.path]
        do {
            try p.run()
            NSApplication.shared.terminate(self)
        } catch {
            let alert = NSAlert()
            alert.messageText = "Restart Failed"
            alert.informativeText = "Could not restart Mandate: \(error.localizedDescription)"
            alert.runModal()
            startDaemon()
        }
    }

    // MARK: - Self-update (local releases)

    // The app is hosted locally: newer builds are published as `Mandate-<semver>.dmg`
    // into ~/.mandate/releases/ (see scripts/build-dmg.sh). The menu surfaces an
    // "Update Available" item and a system notification when a newer DMG is found;
    // clicking either replaces /Applications/Mandate.app and relaunches.
    private var releasesDirURL: URL {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".mandate/releases")
    }
    private var stagingDirURL: URL {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".mandate/staging")
    }

    private func currentVersion() -> String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    }

    private func parseSemver(_ s: String) -> (Int, Int, Int)? {
        let parts = s.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return (parts[0], parts[1], parts[2])
    }

    /// Newest local DMG whose version is greater than the running app's version, if any.
    private func latestLocalUpdate() -> (version: String, dmg: URL)? {
        let fm = FileManager.default
        guard let items = try? fm.contentsOfDirectory(at: releasesDirURL, includingPropertiesForKeys: nil) else { return nil }
        let cur = parseSemver(currentVersion())
        var best: (Int, Int, Int)? = nil
        var bestVersion: String? = nil
        var bestURL: URL? = nil
        for item in items {
            let name = item.lastPathComponent
            guard name.hasPrefix("Mandate-"), name.hasSuffix(".dmg") else { continue }
            let v = String(name.dropFirst("Mandate-".count).dropLast(".dmg".count))
            guard let pv = parseSemver(v) else { continue }
            if let c = cur, pv <= c { continue }
            if best == nil || pv > best! {
                best = pv
                bestVersion = v
                bestURL = item
            }
        }
        guard let v = bestVersion, let u = bestURL else { return nil }
        return (v, u)
    }

    @objc func checkForUpdates() {
        DispatchQueue.global().async {
            let update = self.latestLocalUpdate()
            DispatchQueue.main.async { self.applyUpdateAvailability(update) }
        }
    }

    private func applyUpdateAvailability(_ update: (version: String, dmg: URL)?) {
        if let u = update {
            updateMenuItem?.title = "● Update Available — \(u.version)"
            updateMenuItem?.action = #selector(performUpdate)
            updateMenuItem?.target = self
            updateMenuItem?.isEnabled = true
            mainUpdateMenuItem?.title = "Update Available (\(u.version))…"
            mainUpdateMenuItem?.action = #selector(performUpdate)
            mainUpdateMenuItem?.target = self
            mainUpdateMenuItem?.isEnabled = true
            postUpdateNotification(version: u.version)
        } else {
            let v = currentVersion()
            updateMenuItem?.title = "Mandate is up to date (\(v))"
            updateMenuItem?.action = nil
            updateMenuItem?.isEnabled = false
            mainUpdateMenuItem?.title = "Mandate is up to date (\(v))"
            mainUpdateMenuItem?.action = nil
            mainUpdateMenuItem?.isEnabled = false
        }
    }

    private func postUpdateNotification(version: String) {
        let last = UserDefaults.standard.string(forKey: "mandate.lastNotifiedUpdate") ?? ""
        guard last != version else { return }
        UserDefaults.standard.set(version, forKey: "mandate.lastNotifiedUpdate")
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }
            let content = UNMutableNotificationContent()
            content.title = "Mandate \(version) is available"
            content.body = "Click to update Mandate to the latest version."
            content.userInfo = ["mandate.update.version": version]
            let req = UNNotificationRequest(identifier: "mandate.update", content: content, trigger: nil)
            center.add(req, withCompletionHandler: nil)
        }
    }

    @objc func performUpdate() {
        guard let update = latestLocalUpdate() else {
            let a = NSAlert()
            a.messageText = "Mandate is up to date"
            a.informativeText = "No newer local release was found in ~/.mandate/releases/."
            a.runModal()
            return
        }
        let cur = currentVersion()
        let a = NSAlert()
        a.messageText = "Update Mandate to \(update.version)?"
        a.informativeText = "Mandate will quit, install version \(update.version) from \(update.dmg.lastPathComponent), and relaunch. Current version is \(cur)."
        a.addButton(withTitle: "Update")
        a.addButton(withTitle: "Cancel")
        if a.runModal() != .alertFirstButtonReturn { return }

        DispatchQueue.global().async {
            let ok = self.stageUpdate(from: update.dmg)
            DispatchQueue.main.async {
                if ok {
                    self.runUpdateHelper()
                } else {
                    let err = NSAlert()
                    err.messageText = "Update Failed"
                    err.informativeText = "Could not prepare the update from \(update.dmg.lastPathComponent). See ~/.mandate/mandated.log and ~/.mandate/staging/."
                    err.runModal()
                }
            }
        }
    }

    /// Mount the DMG and copy its Mandate.app into the staging directory.
    private func stageUpdate(from dmg: URL) -> Bool {
        let fm = FileManager.default
        try? fm.removeItem(at: stagingDirURL)
        try? fm.createDirectory(at: stagingDirURL, withIntermediateDirectories: true)
        let mountPoint = stagingDirURL.appendingPathComponent("mount")
        try? fm.removeItem(at: mountPoint)
        try? fm.createDirectory(at: mountPoint, withIntermediateDirectories: true)

        let attach = Process()
        attach.executableURL = URL(fileURLWithPath: "/usr/bin/hdiutil")
        attach.arguments = ["attach", "-nobrowse", "-mountpoint", mountPoint.path, dmg.path]
        do { try attach.run() } catch { return false }
        attach.waitUntilExit()
        guard attach.terminationStatus == 0 else { return false }

        let srcApp = mountPoint.appendingPathComponent("Mandate.app")
        let stagedApp = stagingDirURL.appendingPathComponent("Mandate.app")
        let ditto = Process()
        ditto.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
        ditto.arguments = [srcApp.path, stagedApp.path]
        do { try ditto.run() } catch { _ = detachDmg(at: mountPoint); return false }
        ditto.waitUntilExit()
        _ = detachDmg(at: mountPoint)
        return ditto.terminationStatus == 0 && fm.fileExists(atPath: stagedApp.path)
    }

    private func detachDmg(at mount: URL) -> Bool {
        let d = Process()
        d.executableURL = URL(fileURLWithPath: "/usr/bin/hdiutil")
        d.arguments = ["detach", mount.path]
        do { try d.run() } catch { return false }
        d.waitUntilExit()
        return d.terminationStatus == 0
    }

    /// Write a detached helper that swaps in the staged app and relaunches after this app quits.
    private func runUpdateHelper() {
        let fm = FileManager.default
        let helper = stagingDirURL.appendingPathComponent("update.sh")
        let script = "#!/bin/sh\n# Mandate self-update helper (generated). Replaces /Applications/Mandate.app and relaunches.\nsleep 1.5\nTRASH=\"$HOME/.mandate/trash\"\nmkdir -p \"$TRASH\"\nif [ -d \"/Applications/Mandate.app\" ]; then\n  mv \"/Applications/Mandate.app\" \"$TRASH/Mandate.app.$(date +%s)\" 2>/dev/null\nfi\nditto \"\(stagingDirURL.path)/Mandate.app\" \"/Applications/Mandate.app\"\nif [ -d \"/Applications/Mandate.app\" ]; then\n  open \"/Applications/Mandate.app\"\nfi\nrm -f \"$0\"\n"
        do {
            try script.write(to: helper, atomically: true, encoding: .utf8)
            try? fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: helper.path)
        } catch {
            let a = NSAlert()
            a.messageText = "Update Failed"
            a.informativeText = "Could not write the update helper: \(error.localizedDescription)"
            a.runModal()
            return
        }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/sh")
        p.arguments = [helper.path]
        p.standardOutput = FileHandle(forWritingAtPath: "/dev/null")
        p.standardError = FileHandle(forWritingAtPath: "/dev/null")
        do { try p.run() } catch {
            let a = NSAlert()
            a.messageText = "Update Failed"
            a.informativeText = "Could not start the update helper: \(error.localizedDescription)"
            a.runModal()
            return
        }
        // Quit; the detached helper finishes the swap and relaunches the new version.
        NSApplication.shared.terminate(self)
    }

    // MARK: - UNUserNotificationCenterDelegate
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if response.actionIdentifier == UNNotificationDefaultActionIdentifier {
            DispatchQueue.main.async { self.performUpdate() }
        }
        completionHandler()
    }

    // MARK: - Menu bar icon (canonical Mandate mark: three angled bars)
    private func makeMenuIcon() -> NSImage {
        let size = NSSize(width: 25, height: 25)
        let image = NSImage(size: size)
        image.isTemplate = true
        image.lockFocus()
        guard let ctx = NSGraphicsContext.current?.cgContext else { image.unlockFocus(); return image }
        ctx.saveGState()
        ctx.translateBy(x: 0, y: size.height)
        ctx.scaleBy(x: 1, y: -1)
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
