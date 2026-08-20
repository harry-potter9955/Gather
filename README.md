# Gather

Gather is a polished, responsive social media app for sharing thoughts, finding people, and starting conversations.

## Run it

Run the backend from this folder:

```powershell
node server.js
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

The local fallback stores data in `data/db.json`. For permanent cloud users, posts, messages, and images, use the Supabase setup below.

## Permanent cloud storage with Supabase

1. Create a free Supabase project.
2. Open the Supabase SQL editor and run `supabase-schema.sql`.
3. Copy `.env.example` to `.env`.
4. Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Supabase project settings.
5. Deploy those environment variables in Render.

The service-role key must stay on the server and must never be placed in `app.js` or committed to GitHub. The current JSON mode remains available locally until the Supabase adapter is enabled.

## Free hosting

1. Create a GitHub repository and upload this folder.
2. Create an account at Render and choose **New > Blueprint**.
3. Select the GitHub repository. Render will use `render.yaml` automatically.
4. Deploy and open the generated `onrender.com` URL.

The free Render service can sleep when unused, and its local JSON file is not durable across all restarts/redeploys. For permanent accounts, posts, images, and messages, move the data layer to Supabase or another hosted database before production use.
