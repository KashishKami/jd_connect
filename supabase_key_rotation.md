# Rotating Supabase API Keys

Here is the guide on how to rotate your Supabase API keys if they have been mistakenly committed.

---

### Step 1: Generate the New Key in Supabase
Since your keys start with `sb_publishable_`, you are using Supabase's new API key management system:
1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **Project Settings** (the gear icon at the bottom of the left sidebar).
3. Select **API** from the settings menu.
4. Under the **Publishable and Secret API keys** section, click **Create key** (choose a Publishable key type).
5. Copy the newly generated key.

### Step 2: Update Your Local `.env`
Update the publishable keys in your local `.env` file:
```env
SUPABASE_PUBLISHABLE_KEY="<your_new_sb_publishable_key>"
VITE_SUPABASE_PUBLISHABLE_KEY="<your_new_sb_publishable_key>"
```

### Step 3: Test and Delete the Old Key
1. Start your local dev server and verify that your application connects and functions properly with the new key.
2. Once you are sure the app works, go back to the **API Settings** page on the Supabase dashboard.
3. Find the old compromised key and click **Delete** (or revoke) next to it.

---

### 💡 Is a Publishable Key a Security Risk?
* **Publishable Keys** (like your `sb_publishable_` / `anon` keys) are designed to be exposed to the client-side browser, meaning anyone who visits your site can see them. 
* They are safe to leak as long as you have **Row Level Security (RLS)** enabled and configured on your database tables (so that unauthorized users cannot read/write data).
* However, it is still best practice to rotate them to maintain clean git hygiene.

> [!WARNING]
> **Check for Secret Keys / Database Passwords**
> If you have ever committed a **`service_role` key** (which bypasses RLS) or your **Database Password** in any previous commits, those are highly critical and **must** be rotated immediately. The service role key can also be rotated in the same Supabase API settings dashboard.