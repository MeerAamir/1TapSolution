# Administrator setup

There is no public registration. Administrators are created by the project owner in two steps: create the login, then grant administrator rights in the database. A user can never grant themselves rights. The `admin_users` table cannot be written through the API.

## Create the first administrator

1. **Create the login.** In Supabase: **Authentication → Users → Add user → Create new user**.
   - Email: the administrator's address
   - Password: a long, unique password (12+ characters)
   - Turn on **Auto confirm user**
2. **Grant administrator rights.** In **SQL Editor**, run (replace the email):

   ```sql
   insert into public.admin_users (user_id, role, display_name)
   select id, 'owner', 'Owner'
   from auth.users
   where email = 'owner@yourbrand.com';
   ```

3. Sign in at `https://<your-domain>/login`.

## Add more administrators

Repeat the same two steps, using role `'admin'` instead of `'owner'`. Roles are recorded for future use. Today, every role has full dashboard access.

## Remove an administrator

```sql
delete from public.admin_users
where user_id = (select id from auth.users where email = 'person@yourbrand.com');
```

Their login stops working for the dashboard at once (every request checks the table). To remove the login entirely, also delete the user under **Authentication → Users**.

## Password reset

Administrators can use **Forgot your password?** on the login page. This needs the Site URL and Redirect URLs configured (Deployment step 4). For dependable delivery, configure custom SMTP in Supabase.

You can also send a reset from **Authentication → Users → … → Send password recovery**.

## Who did what

Every create, update, archive, restore and delete of businesses, QR codes, files, categories and administrators is written to `audit_logs` with the acting user's id. It appears under **Settings → Audit log** in the dashboard.
