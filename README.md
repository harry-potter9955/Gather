# Gather

Gather is a polished, responsive social media app for sharing thoughts, finding people, and starting conversations.

## Run it

Run the app from this folder:

```powershell
npm start
```

Then open `http://localhost:4173`. The backend uses Node's built-in modules only, so no install step is required.

## Included

- Responsive home feed with For you, Following, Latest, Discover, and Saved navigation
- Account registration and login with hashed passwords and token sessions
- JSON database persistence in `data/db.json` for users, posts, follows, and messages
- Composer modal with server-backed publishing
- Like, comment, share, search, and follow interactions tied to real account state
- People to follow, direct message actions, conversation history, and chat composer
- Accessible semantic HTML and mobile layout

The project is split into `frontend/` (HTML, CSS, and browser JavaScript), `server.js` (API and static-file server), and `data/` (local development data). The local JSON database is useful for development only. Render's filesystem is ephemeral, so data written there can disappear after a restart or redeploy.

## Permanent cloud storage with Supabase

1. Create a Supabase project at https://supabase.com.
2. In Supabase, open **SQL Editor**, paste `supabase-schema.sql`, and run it.
3. In **Project Settings > API**, copy the project URL and the `service_role` secret.
4. In Render, open the web service, then **Environment > Add Environment Variable**. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
5. Redeploy and confirm `https://YOUR-SERVICE.onrender.com/health` returns `{ "status": "ok" }`.

The service-role key must stay on the server and must never be placed in `frontend/app.js` or committed to GitHub. The current JSON mode remains available locally until the Supabase adapter is enabled.

Important: `supabase-schema.sql` creates the hosted database, but this version of the server still reads `data/db.json`. Adding the variables alone does not migrate or activate Supabase. The next backend task is to replace the JSON repository with Supabase queries, then import existing users/posts if they should be retained.

## Free hosting

1. Create a GitHub repository and upload this folder.
2. Create an account at Render and choose **New > Blueprint**.
3. Select the GitHub repository. Render will use `render.yaml` automatically.
4. Deploy and open the generated `onrender.com` URL.

The free Render service can sleep when unused. Use the hosted database before treating the deployment as production-ready.
