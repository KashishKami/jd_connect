# JD Connect — Local Self-Hosted Supabase Stack

This folder contains the complete, pre-configured self-hosted Supabase stack (PostgreSQL, GoTrue Auth, PostgREST API, Realtime WebSockets, Storage, and Studio Dashboard) for local development of JD Connect.

---

## Prerequisites
* **Docker Desktop** installed and running on your machine.
* **Node.js** (or Bun) installed to run the key generation and migration tools.

---

## Getting Started (Quick Setup)

Follow these steps to spin up your local database:

### 1. Create the Environment File
Copy the example environment template to create your active configuration file:
```bash
cp .env.example .env
```

### 2. Generate Secrets & API Keys
Run the following command in your PowerShell terminal to generate secure random passwords, encryption keys, and properly signed JWT keys (`anon` and `service_role` tokens). 

Copy the printed block and paste it directly into your `docker-infra/.env` file:

```powershell
node -e "const crypto = require('crypto'); const gen = (len) => crypto.randomBytes(len).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); const pg = gen(20); const jwt = gen(64); const db = gen(12); const b64 = (buf) => buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); const sign = (p, s) => { const h = b64(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))); const d = h + '.' + b64(Buffer.from(JSON.stringify(p))); const sig = b64(crypto.createHmac('sha256', s).update(d).digest()); return d + '.' + sig; }; const iat = Math.floor(Date.now() / 1000); const exp = iat + 315360000; const anon = sign({ role: 'anon', iss: 'supabase', iat, exp }, jwt); const service = sign({ role: 'service_role', iss: 'supabase', iat, exp }, jwt); console.log('=================================================================='); console.log('COPY AND PASTE THESE VALUES INTO YOUR .env FILE:'); console.log('==================================================================\n'); console.log('POSTGRES_PASSWORD=' + pg); console.log('JWT_SECRET=' + jwt); console.log('ANON_KEY=' + anon); console.log('SERVICE_ROLE_KEY=' + service); console.log('DASHBOARD_PASSWORD=' + db); console.log('SECRET_KEY_BASE=' + gen(64)); console.log('VAULT_ENC_KEY=' + gen(24).substring(0, 32)); console.log('PG_META_CRYPTO_KEY=' + gen(32)); console.log('\n==================================================================');"
```

### 3. Configure SMTP (For Email Signups & Password Resets)
Open `docker-infra/.env` and configure your SMTP credentials under the Auth section. If using a Gmail App Password, specify:
* `SMTP_HOST=smtp.gmail.com`
* `SMTP_USER=youraddress@gmail.com`
* `SMTP_PASS=your-16-char-gmail-app-password`

### 4. Start the Stack
Run Docker Compose from this folder to build and start the containers(from inside the docker-infra folder):
```bash
docker compose up -d
```
All services are healthy when `docker compose ps` shows `healthy` status for all 8 containers.

### 5. Access the Admin Dashboard
Open `http://localhost:19001` in your browser.
* **Username:** `admin`
* **Password:** The `DASHBOARD_PASSWORD` value in your `.env`

---

## Database & Auth Restore (First Time Run)

If you are restoring from a database backup (`.backup` file) on a fresh setup:

### 1. Copy and Restore the Schema & Data
Copy your `.backup` file into the database container:
```powershell
docker cp "path/to/your/backup.backup" supabase-db:/tmp/restore.backup
```

Run `pg_restore` to rebuild the schema and populate tables:
```powershell
docker exec -it supabase-db pg_restore --host=localhost --port=5432 --username=postgres --dbname=postgres --no-owner --no-privileges --verbose /tmp/restore.backup
```

### 2. Create Storage Buckets
Create the storage buckets for document and chat attachments by running this SQL in the Supabase Studio SQL Editor:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('documents', 'documents', false),
  ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;
```

### 3. Recreate Auth logins
Since auth logins are not stored in public schema backups, run the user recreation script to hook the public employees back up to GoTrue logins:
```powershell
$env:SUPABASE_URL="http://localhost:19000"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
npx tsx scripts/recreate-auth-users.ts
```

---

## CLI Management Cheat Sheet

* **Stop the stack (saving data):**
  `docker compose stop`
* **Stop and remove containers (saving data volumes):**
  `docker compose down`
* **Stop and WIPE all local database data (fresh start):**
  `docker compose down -v`
* **View running container statuses:**
  `docker compose ps`
* **View real-time logs:**
  `docker compose logs -f`
