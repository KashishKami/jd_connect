# Hostinger VPS Production Setup Guide
### A Beginner-Friendly Guide to Deploying JD Connect Self-Hosted

This guide will walk you through setting up your Hostinger VPS (Virtual Private Server) from scratch. We will match the folder structure of your local machine exactly: your project root will live at `/opt/jd-connect/` and your Supabase stack will live at `/opt/jd-connect/docker-infra/`.

---

## Table of Contents
1. [Step 1: Generate SSH Keys on Windows](#step-1-generate-ssh-keys-on-windows)
2. [Step 2: Add your SSH Key to Hostinger Panel](#step-2-add-your-ssh-key-to-hostinger-panel)
3. [Step 3: Connect to your VPS via SSH](#step-3-connect-to-your-vps-via-ssh)
4. [Step 4: Install Docker on the VPS](#step-4-install-docker-on-the-vps)
5. [Step 5: Create folder structure on the VPS](#step-5-create-folder-structure-on-the-vps)
6. [Step 6: Copy and Restore your Database Backup](#step-6-copy-and-restore-your-database-backup)
7. [Step 7: Configure GitHub Actions Secrets](#step-7-configure-github-actions-secrets)

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
2. Go to **VPS** -> select your VPS server.
3. In the left sidebar, click on **Settings** -> **SSH Keys**.
4. Click **Add SSH Key**.
5. Give it a name (e.g., `My-Windows-PC`) and **paste** the public key you copied in Step 1.
6. Save the settings. Hostinger will automatically append this key to the root user's authorized keys on the server.

---

## Step 3: Connect to your VPS via SSH

Now you can log into your server directly from PowerShell without typing a password.

1. Open **PowerShell** on your Windows PC.
2. Run this command (replace `<YOUR_VPS_IP>` with your actual Hostinger VPS IP address):
   ```powershell
   ssh root@<YOUR_VPS_IP>
   ```
3. If it asks you if you want to continue connecting (authenticity warning), type `yes` and press **Enter**.
4. You should now see the welcome banner of your Ubuntu server, ending with `root@hsvp...:~#`.

---

## Step 4: Install Docker on the VPS

Your Hostinger VPS needs Docker and Docker Compose to run the containers. Run these commands sequentially inside your SSH terminal:

1. **Update the system package index:**
   ```bash
   apt-get update && apt-get upgrade -y
   ```
2. **Install Docker using the official automated script:**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   ```
3. **Verify Docker is installed successfully:**
   ```bash
   docker --version
   docker compose version
   ```
   *(You should see Docker version 24+ and Docker Compose v2+).*

---

## Step 5: Create folder structure on the VPS

To match your local machine exactly, we will create the folder `/opt/jd-connect/`. Run this inside your SSH terminal:

```bash
mkdir -p /opt/jd-connect
```

Your VPS folders will align like this:
* **`/opt/jd-connect/`** — Project root (managed by Git/GitHub Actions).
* **`/opt/jd-connect/docker-infra/`** — Contains the Supabase Docker Compose files.
* **`/opt/jd-connect/docker-infra/.env`** — Contains production DB passwords and JWT keys.

---

## Step 6: Copy and Restore your Database Backup

We will copy the backup file from your Windows desktop to the VPS, then restore it into the database container.

1. Open a **new PowerShell window** on your Windows PC (do not use the SSH window).
2. Run the `scp` command to upload the backup file to the VPS (replace `<YOUR_VPS_IP>` with your VPS IP):
   ```powershell
   scp "c:\Users\Administrator\Desktop\JD Connect\jd-connect-backup\jd-connect-core_260706.backup" root@<YOUR_VPS_IP>:/tmp/restore.backup
   ```
3. Once the upload completes, switch back to your **SSH terminal window**.
4. Check that the file arrived in `/tmp/`:
   ```bash
   ls -la /tmp/restore.backup
   ```
5. Once your Supabase Docker containers are started on the VPS, copy the backup file into the running Postgres container:
   ```bash
   docker cp /tmp/restore.backup supabase-db:/tmp/restore.backup
   ```
6. Run the restore utility:
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
7. Verify the restore succeeded:
   ```bash
   docker exec -it supabase-db psql -U postgres -d postgres -c "\dt public.*"
   ```

---

## Step 7: Configure GitHub Actions Secrets

To enable automatic deployment, go to your repository on **GitHub** -> **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret** and add these values:

| Secret Name | Value Description | Example Value |
|---|---|---|
| `VPS_HOST` | Your VPS IP Address | `103.163.224.78` |
| `VPS_USER` | Server username | `root` |
| `VPS_SSH_KEY` | Content of your private SSH key from Windows PC | Run `Get-Content ~\.ssh\id_ed25519` in PowerShell and copy all lines. |
| `GHCR_TOKEN` | A GitHub Personal Access Token (PAT) with `write:packages` scope | Generated from GitHub Settings -> Developer settings. |
| `PROD_SUPABASE_URL` | Your production Supabase URL (pointing to your domain) | `https://supabase.yourdomain.com` |
| `PROD_SUPABASE_ANON_KEY` | Your production anon API key | `eyJhbGciOiJIUzI1Ni...` |
| `PROD_SUPABASE_SERVICE_ROLE_KEY` | Your production service_role API key | `eyJhbGciOiJIUzI1Ni...` |

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

