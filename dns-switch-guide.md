# DNS Switch Guide — Cloudflare (1.1.1.1) ↔ Default

Use this when DNS propagation is slow and you want to verify your site works
by temporarily switching your system DNS to Cloudflare's `1.1.1.1`.

---

## Windows (PowerShell as Administrator)

### Step 1 — Find your adapter name
```powershell
Get-NetAdapter | Where-Object { $_.Status -eq "Up" }
```
Note the `Name` column (usually `Ethernet` or `Wi-Fi`).

### Step 2 — Switch to Cloudflare DNS
```powershell
# Replace "Ethernet" with your adapter name if different
Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ServerAddresses ("1.1.1.1", "1.0.0.1")
ipconfig /flushdns
```

### Step 3 — Verify it worked
```powershell
nslookup jdconnect.in 1.1.1.1
# Should return: Address: 82.29.165.21
```

### Step 4 — Revert back to default (automatic DNS)
```powershell
Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ResetServerAddresses
ipconfig /flushdns
```

---

## Mac (Terminal)

### Step 1 — Find your active network service
```bash
networksetup -listallnetworkservices
```
Note the name (usually `Wi-Fi` or `Ethernet`).

### Step 2 — Switch to Cloudflare DNS
```bash
# For Wi-Fi
sudo networksetup -setdnsservers "Wi-Fi" 1.1.1.1 1.0.0.1

# For Ethernet (if wired)
sudo networksetup -setdnsservers "Ethernet" 1.1.1.1 1.0.0.1

# Flush DNS cache
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
```

### Step 3 — Verify it worked
```bash
nslookup jdconnect.in 1.1.1.1
# Should return: Address: 82.29.165.21
```

### Step 4 — Revert back to default (automatic DNS)
```bash
# For Wi-Fi
sudo networksetup -setdnsservers "Wi-Fi" "Empty"

# For Ethernet
sudo networksetup -setdnsservers "Ethernet" "Empty"

# Flush DNS cache
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
```

### Mac GUI Alternative (no Terminal needed)
1. **System Settings** → **Network** → **Wi-Fi** → **Details**
2. Click the **DNS** tab
3. Add `1.1.1.1` and `1.0.0.1`
4. Click **OK** → **Apply**
5. To revert: remove those entries and click **Apply** again

---

## Quick Reference

| Action | Windows | Mac |
|--------|---------|-----|
| Switch to Cloudflare | `Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ServerAddresses ("1.1.1.1","1.0.0.1")` | `sudo networksetup -setdnsservers "Wi-Fi" 1.1.1.1 1.0.0.1` |
| Flush cache | `ipconfig /flushdns` | `sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder` |
| Revert to default | `Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ResetServerAddresses` | `sudo networksetup -setdnsservers "Wi-Fi" "Empty"` |

---

> **Why Cloudflare?** Cloudflare's `1.1.1.1` is one of the fastest-propagating DNS resolvers.
> When DNS records are updated, Cloudflare picks them up much faster than Google's `8.8.8.8`,
> making it ideal for testing during DNS propagation delays.
