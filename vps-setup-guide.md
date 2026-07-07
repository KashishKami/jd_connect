# Hostinger VPS Production Setup Guide
### A Beginner-Friendly Guide to Deploying JD Connect Self-Hosted

This guide will walk you through setting up your Hostinger VPS (Virtual Private Server) from scratch. We will match the folder structure of your local machine exactly: your project root will live at `/opt/jd-connect/` and your Supabase stack will live at `/opt/jd-connect/docker-infra/`.

---

## Table of Contents
0. [Concept: How the Deployment Flow Works](#concept-how-the-deployment-flow-works-code-vs-database)
1. [Step 1: Generate SSH Keys on Windows](#step-1-generate-ssh-keys-on-windows)
2. [Step 2: Add your SSH Key to Hostinger Panel](#step-2-add-your-ssh-key-to-hostinger-panel)
3. [Step 3: Connect to your VPS via SSH & Install Docker](#step-3-connect-to-your-vps-via-ssh--install-docker)
4. [Step 4: Create the Project Directory on the VPS](#step-4-create-the-project-directory-on-the-vps)
5. [Step 5: Identify Traefik Network & Create App Network](#step-5-identify-traefik-network--create-app-network)
6. [Step 6: Configure GitHub Secrets & Push Code](#step-6-configure-github-secrets--push-code)
7. [Step 7: Start your Supabase Database Stack](#step-7-start-your-supabase-database-stack)
8. [Step 8: Upload and Restore Database Backup](#step-8-upload-and-restore-database-backup)
9. [Phase 3: DNS Cutover & Traefik SSL](#phase-3-dns-cutover--traefik-ssl)

---

## Concept: How the Deployment Flow Works (Code vs. Database)

Before setting up your VPS, it is important to understand how your self-hosted backend, frontend web application, and the deployment pipeline interact:

### 1. Two Independent Docker Stacks on the VPS
Your server will run two separate, isolated Docker Compose setups:
* **The Supabase Backend (`docker-infra/docker-compose.yml`)**: This starts the database, auth, and storage services. You will configure and start this **manually, once** on the VPS via SSH. Pushing code updates will **never** touch or restart your database containers, keeping your data safe and online.
* **The App Service (`docker-compose.prod.yml`)**: This runs your actual frontend/SSR web application. It is managed **automatically** by your GitHub Actions deployment pipeline on every code push.

### 2. How Code and Container Images get to the VPS
When you run a `git push` to your GitHub repository:
1. **GitHub Actions (The Builder)**: Downloads your code on a GitHub server runner, runs `bun install` and `vite build` (doing the heavy CPU/RAM compilation work), packages the finished app into a **Docker Image**, and uploads it to GitHub Container Registry (GHCR).
2. **Your VPS (The Host)**: GitHub Actions SSHs into your VPS and:
   * Runs `git clone` or `git pull` on the VPS to download your code repository files (which gives the VPS access to your `.yml` compose files, scripts, and SQL configuration).
   * Pulls the pre-built **Docker Image** from GHCR.
   * Restarts **only the app container**, resulting in a fast deployment with near-zero downtime.

### 3. How Traefik Routes Traffic
Your VPS already runs a **Traefik** reverse proxy that handles all incoming HTTPS traffic for your other applications. You do **not** need to install it again. The JD Connect app container registers itself with Traefik automatically through **Docker labels** in `docker-compose.prod.yml`. When Traefik sees those labels it:
* Creates a router rule for your domain (e.g. `jdconnect.yourdomain.com`)
* Automatically issues a free Let's Encrypt SSL certificate
* Forwards HTTPS traffic from port 443 to the container's internal port `19003` — through the Docker network, not a public host port

### 4. The Two Distinct Environment Files
It is critical to distinguish between the two separate `.env` files in this project:

*   **Database Infrastructure Env File (`docker-infra/.env`)**:
    *   **Location on VPS:** `/opt/jd-connect/docker-infra/.env`
    *   **Management:** **Manual (Configured once).** You will create and configure this file directly on the VPS via SSH in Step 7.
    *   **Contents:** Postgres passwords, JWT secret keys, auth URL configuration, and SMTP credentials.
*   **Frontend App Service Env File (Root `.env`)**:
    *   **Location on VPS:** `/opt/jd-connect/.env`
    *   **Management:** **Automatic (Managed by CI/CD).** You should **never** manually create or edit this file on the VPS. The GitHub Actions pipeline generates and overwrites it during every deployment using your GitHub Repository Secrets.
    *   **Contents:** Server-side connection URL to Supabase and API access keys.

---

## Step 1: Generate SSH Keys on Windows

SSH keys are a secure way to log into your VPS without typing a password every time. This is also required for the GitHub CI/CD pipeline to deploy code to your server.

1. Open **PowerShell** on your Windows PC.
2. Run the following command to generate a new key pair (press **Enter** to accept the default file path and skip the passphrase):
   ```powershell
   ssh-keygen -t ed25519 -C "admin@jdconnect.com"
   ```
3. Your keys are generated in your user profile folder under `C:\Users\Administrator\.ssh\`.
4. Run this command to view and copy your **Public Key**:
   ```powershell
   Get-Content ~\.ssh\id_ed25519.pub
   ```
   *It should look like:* `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... admin@jdconnect.com`
5. Highlight and **copy** this entire line.

---

## Step 2: Add your SSH Key to Hostinger Panel

1. Log into your **Hostinger Account Dashboard**.
2. Go to **VPS** → select your VPS server.
3. In the left sidebar, click on **Settings** → **SSH Keys**.
4. Click **Add SSH Key**.
5. Give it a name (e.g., `My-Windows-PC`) and **paste** the public key you copied in Step 1.
6. Save the settings. Hostinger will automatically append this key to the root user's authorized keys on the server.

---

## Step 3: Connect to your VPS via SSH & Install Docker

1. Open **PowerShell** on your Windows PC.
2. Log into your server (replace `<YOUR_VPS_IP>` with your Hostinger VPS IP):
   ```powershell
   ssh root@<YOUR_VPS_IP>
   ```
3. Once logged into the VPS SSH terminal, update packages and install Docker:
   ```bash
   apt-get update && apt-get upgrade -y
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   ```
4. Verify both are installed:
   ```bash
   docker --version
   docker compose version
   ```

---

## Step 4: Create the Project Directory on the VPS

Create the directory where your repository will live on the VPS. Run this inside the VPS SSH terminal:

```bash
mkdir -p /opt/jd-connect
```

*(You don't need to manually clone or copy your project files here. The GitHub Actions deployment workflow will clone your files into this directory automatically on your first code push.)*

---

## Step 5: Identify Traefik Network & Create App Network

> **Why this step is critical.** Your `docker-compose.prod.yml` and `docker-infra/docker-compose.yml` reference two external Docker networks. Docker will refuse to start **any** container if an external network it depends on does not already exist.
> * `traefik_proxy` — the network your existing Traefik proxy uses to discover containers (must already exist)
> * `jdconnect_net` — the internal network that groups your JD Connect app containers together (you create this once below)

### 5.1 — Find Your Traefik Network Name

Since Traefik is already running on your VPS, run these commands to discover its exact configuration:

```bash
# 1. Find the Traefik container name
docker ps --filter "name=traefik" --format "table {{.Names}}\t{{.Status}}"

# 2. List every network Traefik is currently connected to
docker inspect $(docker ps --filter "name=traefik" --format "{{.Names}}" | head -1) \
  --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'

# 3. Find the certresolver name configured in Traefik
#    (you will need this when filling in the Traefik labels in the compose files)
docker inspect $(docker ps --filter "name=traefik" --format "{{.Names}}" | head -1) \
  --format '{{join .Config.Cmd "\n"}}' | grep -i "certresolver\|acme"
```

**Note down the following from the output above:**
| What | Where to look | Your VPS value |
|---|---|---|
| **Traefik network name** | Output of command 2 | ✅ `root_default` |
| **Certresolver name** | Output of command 3 (after `certresolver.`) | ✅ `mytlschallenge` |
| **Challenge type** | Output of command 3 (`httpchallenge` or `tlschallenge`) | ✅ HTTP-01 (port 80) |

> **Your files are already configured with these values.** The `docker-compose.prod.yml` and `docker-infra/docker-compose.yml` already use `root_default` and `mytlschallenge`. No manual changes needed.

### 5.2 — Create the JD Connect App Network

```bash
docker network create jdconnect_net
```

*(This is a one-time command. The `root_default` Traefik network already exists — never recreate that one. Only `jdconnect_net` needs to be created manually.)*

---

## Step 6: Configure GitHub Secrets & Push Code

To enable automatic deployments, we need to save your keys and VPS credentials as secrets in your GitHub repository.

1. Go to your repository on **GitHub** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** and add these secrets:

| Secret Name | Value Description | Example Value |
|---|---|---|
| `VPS_HOST` | Your VPS IP Address | `103.163.224.78` |
| `VPS_USER` | Server username | `root` |
| `VPS_SSH_KEY` | Content of your private SSH key from Windows PC | Run `Get-Content ~\.ssh\id_ed25519` in PowerShell and copy all lines. |
| `GHCR_TOKEN` | A GitHub Personal Access Token (PAT) with `write:packages` and `repo` scope | Generated from GitHub Developer settings. |
| `PROD_SUPABASE_URL` | Your production Supabase URL (pointing to your domain) | `https://supabase.yourdomain.com` |
| `PROD_SUPABASE_ANON_KEY` | Your production anon API key | `eyJhbGciOiJIUzI1Ni...` |
| `PROD_SUPABASE_SERVICE_ROLE_KEY` | Your production service_role API key | `eyJhbGciOiJIUzI1Ni...` |

### How to Generate your `GHCR_TOKEN` (GitHub Personal Access Token)
1. In your **GitHub account**, go to **Settings** → **Developer settings**.
2. Click **Personal Access Tokens** → **Tokens (classic)**.
3. Click **Generate new token (classic)**.
4. Give it a name (Note: `JD-Connect-VPS-Access`), set the expiration (e.g. `No expiration`), and select the scopes:
   * `[x] repo` (so the VPS can download your code configs)
   * `[x] write:packages` (so GitHub can push/pull container packages)
5. Click **Generate token** and copy the code immediately (starts with `ghp_...`).

### Trigger the First Deploy
Open a local PowerShell terminal on your Windows machine, commit the config changes, and push to GitHub:
```powershell
git add .
git commit -m "deploy: add Docker configurations and deploy pipeline"
git push origin main
```
*This starts the GitHub Actions job. Wait 2-3 minutes for the pipeline to finish. Once complete, it will have cloned the project into `/opt/jd-connect` on the VPS and set up the app container!*

---

## Step 7: Start your Supabase Database Stack

Now that the deployment pipeline has cloned the codebase to the VPS at `/opt/jd-connect/`:

1. In your **VPS SSH terminal**, navigate to the Supabase directory:
   ```bash
   cd /opt/jd-connect/docker-infra
   ```
2. Create and edit your production environment secrets file:
   ```bash
   nano .env
   ```
3. Generate your secrets by copying the long `node -e "..."` command from the comments at the top of your `docker-infra/.env.example` file and running it. Paste the output keys into this `.env` file.
4. **Configure your URLs:** Inside this `.env` file, change the default `localhost` addresses to match your VPS IP. You will find these variables at lines 53 and 69–71:

   **If testing via IP temporarily (before pointing domains):**
   ```env
   SUPABASE_PUBLIC_URL=http://<YOUR_VPS_IP>:19000
   SITE_URL=http://<YOUR_VPS_IP>:19003
   ADDITIONAL_REDIRECT_URLS=http://<YOUR_VPS_IP>:19003/**
   API_EXTERNAL_URL=http://<YOUR_VPS_IP>:19000
   ```

   **If pointing your domain directly now (highly recommended):**
   ```env
   SUPABASE_PUBLIC_URL=https://supabase.yourdomain.com
   SITE_URL=https://jdconnect.yourdomain.com
   ADDITIONAL_REDIRECT_URLS=https://jdconnect.yourdomain.com/**
   API_EXTERNAL_URL=https://supabase.yourdomain.com
   ```

   *Save the file by pressing `Ctrl+O` then `Enter`, and exit with `Ctrl+X`.*

5. Spin up the Supabase backend containers:
   ```bash
   docker compose up -d
   ```
6. Verify everything is running:
   ```bash
   docker compose ps
   ```

### ⚠️ IMPORTANT: Write Keys back to GitHub Secrets
Now that you have initialized the Supabase `.env` file on your VPS, you have generated your production JWT keys. You must copy these keys back into your **GitHub Repository Secrets** so that the frontend app container can communicate with Supabase.

Open GitHub, go to **Settings** → **Secrets and variables** → **Actions**, and update or add the following secrets:

1. **`PROD_SUPABASE_ANON_KEY`**: Paste the value of `ANON_KEY` from your newly created `/opt/jd-connect/docker-infra/.env` file.
2. **`PROD_SUPABASE_SERVICE_ROLE_KEY`**: Paste the value of `SERVICE_ROLE_KEY` from your `/opt/jd-connect/docker-infra/.env` file.
3. **`PROD_SUPABASE_URL`**: Set this to:
   * `http://<YOUR_VPS_IP>:19000` (if testing via IP) OR
   * `https://supabase.yourdomain.com` (if using your domain)

*(Once you save these secrets, push any minor git commit to trigger a redeploy. The frontend container will rebuild and connect to the newly created Supabase database automatically!)*

---

## Step 8: Upload and Restore Database Backup

Now we copy your database backup to the VPS and restore it.

1. Open a **new PowerShell window** on your Windows PC (do not use the SSH window).
2. Run the `scp` command to upload the backup file to the VPS (replace `<YOUR_VPS_IP>` with your VPS IP):
   ```powershell
   scp "c:\Users\Administrator\Desktop\JD Connect\jd-connect-backup\jd-connect-core_260706.backup" root@<YOUR_VPS_IP>:/tmp/restore.backup
   ```
3. Switch back to your **VPS SSH terminal window**.
4. Copy the backup file into the running database container:
   ```bash
   docker cp /tmp/restore.backup supabase-db:/tmp/restore.backup
   ```
5. Run the restore utility:
   ```bash
   docker exec -it supabase-db pg_restore \
     --host=localhost \
     --port=5432 \
     --username=postgres \
     --dbname=postgres \
     --no-owner \
     --no-privileges \
     --verbose \
     /tmp/restore.backup
   ```
6. Verify the restore succeeded:
   ```bash
   docker exec -it supabase-db psql -U postgres -d postgres -c "\dt public.*"
   ```

---

## Phase 3: DNS Cutover & Traefik SSL

This phase points your real domain name at the VPS and activates HTTPS via your existing Traefik. Complete Phases 1 (local Docker testing) and 2 (VPS deploy via CI/CD) before this step.

### What DNS Records You Need

Choose **one** of the options below depending on your domain structure:

#### Option A: Subdomain Setup (e.g., jdconnect.yourdomain.com)
Use this if you are deploying to a subdomain of an existing website.

| Subdomain | Points To | Purpose |
|---|---|---|
| `jdconnect.yourdomain.com` | VPS IP | The main JD Connect app |
| `supabase.yourdomain.com` | VPS IP | Supabase API (Kong gateway) |
| `studio.yourdomain.com` | VPS IP | Supabase Studio admin dashboard |

#### Option B: Apex / Root Domain Setup (e.g., jdconnect.in)
Use this if you bought a brand new domain specifically for this application.

| Domain/Subdomain | Points To | Purpose |
|---|---|---|
| `jdconnect.in` (Root / `@`) | VPS IP | The main JD Connect app |
| `supabase.jdconnect.in` | VPS IP | Supabase API (Kong gateway) |
| `studio.jdconnect.in` | VPS IP | Supabase Studio admin dashboard |

---

### Add DNS Records in Hostinger

Log into Hostinger hPanel, go to **Domains** → your domain → **DNS / Nameservers**, and add your A records:

**For Option A:**
```
Type: A    Name: jdconnect    Value: YOUR_VPS_IP    TTL: 300
Type: A    Name: supabase     Value: YOUR_VPS_IP    TTL: 300
Type: A    Name: studio       Value: YOUR_VPS_IP    TTL: 300
```

**For Option B (`jdconnect.in`):**
```
Type: A    Name: @            Value: YOUR_VPS_IP    TTL: 300
Type: A    Name: supabase     Value: YOUR_VPS_IP    TTL: 300
Type: A    Name: studio       Value: YOUR_VPS_IP    TTL: 300
```

*Set TTL to `300` (5 minutes) while testing. Raise it to `3600` after everything is confirmed working.*

---

### Update Domain Placeholders in Config Files

Before DNS propagates, replace the placeholder domains with your real domains in these locations:

#### 1. In `docker-compose.prod.yml`
Update the Traefik host routing rule:
*   **Option A:** `Host(\`jdconnect.yourdomain.com\` )`
*   **Option B:** `Host(\`jdconnect.in\` )`

#### 2. In `docker-infra/docker-compose.yml`
Update the Traefik host routing rules for both `studio` and `kong`:
*   **Option A:**
    *   Studio: `Host(\`studio.yourdomain.com\` )`
    *   Kong: `Host(\`supabase.yourdomain.com\` )`
*   **Option B:**
    *   Studio: `Host(\`studio.jdconnect.in\` )`
    *   Kong: `Host(\`supabase.jdconnect.in\` )`

Then commit and push (triggers app redeploy), and restart the Supabase stack on the VPS:
```bash
cd /opt/jd-connect/docker-infra
docker compose down && docker compose up -d
```

---

### Verify DNS Propagation

Run from your Windows PC or the VPS — repeat until you see your VPS IP in the answer:

**For Option A:**
```powershell
nslookup jdconnect.yourdomain.com
nslookup supabase.yourdomain.com
nslookup studio.yourdomain.com
```

**For Option B:**
```powershell
nslookup jdconnect.in
nslookup supabase.jdconnect.in
nslookup studio.jdconnect.in
```

---

### Verify Traefik Is Issuing SSL Certs

After DNS propagates, Traefik will automatically request Let's Encrypt certificates the first time each domain receives an HTTPS request. Run on the VPS to confirm:

```bash
# Check Traefik logs for certificate activity (your Traefik container is root-traefik-1)
docker logs root-traefik-1 2>&1 | grep -i "certificate\|acme\|jdconnect"

# Verify HTTPS is responding correctly (Option B example)
curl -I https://jdconnect.in
curl -I https://supabase.jdconnect.in
```

---

### Update Supabase `.env` With Real Domain URLs

SSH into your VPS and edit `/opt/jd-connect/docker-infra/.env` — confirm or update these four values:

**For Option A:**
```env
SITE_URL=https://jdconnect.yourdomain.com
ADDITIONAL_REDIRECT_URLS=https://jdconnect.yourdomain.com/**
API_EXTERNAL_URL=https://supabase.yourdomain.com
SUPABASE_PUBLIC_URL=https://supabase.yourdomain.com
```

**For Option B (`jdconnect.in`):**
```env
SITE_URL=https://jdconnect.in
ADDITIONAL_REDIRECT_URLS=https://jdconnect.in/**
API_EXTERNAL_URL=https://supabase.jdconnect.in
SUPABASE_PUBLIC_URL=https://supabase.jdconnect.in
```

Restart the Supabase stack to apply the changes:
```bash
cd /opt/jd-connect/docker-infra
docker compose down && docker compose up -d
```

---

### Update GitHub Secrets

Update `PROD_SUPABASE_URL` in your GitHub secrets to your real domain instead of the IP-based URL, then trigger a redeploy by pushing any commit.
*   **Option A:** `https://supabase.yourdomain.com`
*   **Option B:** `https://supabase.jdconnect.in`

---

## Frequently Asked Questions (FAQ)

### 1. Why do we need the `GHCR_TOKEN` secret in GitHub?
Although GitHub Actions has a built-in temporary token (`GITHUB_TOKEN`), this token is deleted the second your deployment job finishes.
Your VPS (Hostinger) needs to pull private images from GitHub Container Registry. If you ever SSH into your VPS and want to pull the latest image or restart containers manually, your VPS needs a permanent password. The Personal Access Token (`GHCR_TOKEN`) acts as this permanent password.

### 2. What exactly is the `PROD_SUPABASE_URL`?
This is the URL where your application contacts the Supabase API.
* **If you have pointed your domain name to the VPS:** It will be your domain (e.g., `https://supabase.yourdomain.com`).
* **If you are testing on your VPS without a domain name yet:** It will be your VPS IP address and Kong port (e.g., `http://<YOUR_VPS_IP>:19000`).

### 3. Why build the Docker image on GitHub and pull it on the VPS, instead of compiling the code directly on the VPS?
* **Resource Conservation:** Compiling a modern web application (running `bun install` and `vite build`) is highly CPU and RAM intensive. Low-end VPS instances (1GB to 4GB RAM) will frequently crash with **Out Of Memory (OOM)** errors during builds, taking your entire website offline. Building on GitHub's free runners saves your VPS's memory and CPU.
* **Instant Deployments:** Compiling code takes 2 to 3 minutes, during which your VPS would be heavily loaded. Pulling a pre-built image takes 5 to 10 seconds, meaning near zero downtime.
* **Build Consistency:** Building once on GitHub guarantees that the container running on production is identical to the one tested, avoiding any "works on my machine but fails on production" environment bugs.

### 4. Should my GitHub repository be public or private?
* **Recommendation:** Since this is an internal business/employee portal containing custom company policies, security groups, and settings, it is **highly recommended to keep the repository private** so your code and commit history are secure.
* **Compatibility:** Our setup is fully compatible with both public and private repositories. If you make it private, the `GHCR_TOKEN` with `repo` scope will allow the VPS to clone/pull code securely.

### 5. What if my GitHub Actions or Package storage gets filled up?
* **If Public:** GitHub Actions and Package Registry storage are **100% free and unlimited** for public repositories.
* **If Private:** GitHub provides 500MB of free storage for private package registries. Each time a new build runs, the tag `latest` is moved to the new image, leaving the old image untagged (orphaned).
* **Cleaning up old images:**
  1. **On GitHub:** You can configure a periodic workflow or use the GitHub Packages UI to delete older, untagged images.
  2. **On the VPS:** Docker keeps older images on your disk when new ones are pulled, which can fill up your VPS hard drive. You can clear them from your VPS by running a prune command periodically (e.g. `docker image prune -a -f`).
