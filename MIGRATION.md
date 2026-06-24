To migrate your application out of Lovable and host it on **Hostinger (specifically a VPS)**, you will need to host two things: **the application server (Node.js)** and **the database (Supabase)**.

Here is the step-by-step architectural guide on how to set this up:

---

### Step 1: Determine Where the Database Lives
You have two choices for your Supabase database:

1. **(Easiest & Recommended)**: Keep using a cloud-hosted Supabase database (like the free tier on Supabase.com). You just point your Hostinger VPS application to the Supabase Cloud API URLs. This saves you from having to manage database backups, security, and scaling yourself.
2. **(Fully Self-Hosted)**: Run Supabase directly on your Hostinger VPS using Docker.
   * *How*: You install Docker on your VPS, clone the official [Supabase Docker Self-Hosting repository](https://github.com/supabase/supabase/tree/master/docker), configure the API keys/passwords, and run `docker compose up -d`.

---

### Step 2: Build the Application for Node.js
Currently, the app builds for Cloudflare in Lovable. To run it on a normal Hostinger VPS, we need to build it as a standalone Node.js server.

1. **Configure build target**: TanStack Start uses **Nitro** under the hood. To build it for a Node.js VPS, you would run the build command. By default, running `npm run build` generates a standalone Node.js server package (usually placed in a folder named `.output/` or `.nitro/`).
2. **Build package**: The output contains a file like `.output/server/index.mjs` which acts as your production web server.

---

### Step 3: Set Up the Hostinger VPS
Buy an Ubuntu VPS on Hostinger and perform the following steps via SSH:

1. **Install Node.js & Git**:
   ```bash
   sudo apt update
   sudo apt install nodejs npm git -y
   ```
2. **Clone your repository**:
   Clone your project onto the VPS and install dependencies:
   ```bash
   git clone <your-github-repo-url>
   cd <repo-name>
   npm install
   ```
3. **Configure Environment Variables**:
   Create a `.env` file in the root of the project on the VPS containing your secrets:
   ```env
   PORT=3000
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_PUBLISHABLE_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   # Add any other keys needed (like LOVABLE_API_KEY if using AI gateways)
   ```
4. **Build the production bundle**:
   ```bash
   npm run build
   ```

---

### Step 4: Run the Server continuously (PM2)
On a VPS, if you just run `node server.js` and close the terminal, the app stops. You use **PM2** (Process Manager) to keep it running forever:

1. **Install PM2**:
   ```bash
   sudo npm install -g pm2
   ```
2. **Start the application**:
   ```bash
   pm2 start .output/server/index.mjs --name "jd-connect"
   ```
3. **Ensure it starts on VPS reboot**:
   ```bash
   pm2 startup
   pm2 save
   ```

---

### Step 5: Route Traffic & Configure SSL (Nginx & Certbot)
To map your domain name (e.g., `jdconnect.yourcompany.com`) to the port `3000` where the Node.js app is running:

1. **Install Nginx**:
   ```bash
   sudo apt install nginx -y
   ```
2. **Configure Reverse Proxy**:
   Edit the Nginx configuration to point traffic from port `80` (HTTP) to port `3000` internally:
   ```nginx
   server {
       listen 80;
       server_name jdconnect.yourcompany.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
3. **Install Free SSL (HTTPS)**:
   Use **Certbot** to get a free SSL certificate from Let's Encrypt:
   ```bash
   sudo apt install certbot python3-certbot-nginx -y
   sudo certbot --nginx -d jdconnect.yourcompany.com
   ```

Once completed, Nginx will handle secure `HTTPS` traffic and forward it to your running TanStack Start application server!