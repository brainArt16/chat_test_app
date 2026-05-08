# chat_test_app

Minimal Next.js client to test realtime DM messaging against `ck_chat`.

## Run

```bash
cd chat_test_app
npm install
npm run dev
```

App runs on `http://127.0.0.1:3010`.

## Deployed backend/chat defaults

Set these before `npm run dev` if you want prefilled deployed endpoints:

```bash
export NEXT_PUBLIC_TEST_API_BASE_URL="https://your-api.example.com"
export NEXT_PUBLIC_TEST_CHAT_URL="https://your-chat.example.com"
```

The UI fields can still be edited manually at runtime.

## Use

### Option A: quick auth (dev backend)

1. Set API base URL (default `http://127.0.0.1:8080`).
2. Enter user email (e.g. `seed.user001@cookingclass.local`).
3. Click **Quick Login (tmp-login)**.
4. JWT and local user id are auto-filled.

> Requires backend running with `dev` profile because it calls `/api/auth/tmp-login`.

### Option B: manual token

1. Paste a valid user JWT.
2. Set your user id and peer user id.
3. Click **Connect + Join Room**.
4. Send messages.

## Media message testing

The tester supports metadata-based media messages:

- `image`, `video`, `file` types
- required: `mediaUrl`
- optional: caption (`message` input), `mediaMimeType`, `mediaFileName`, `mediaFileSize`
- optional UI upload flow: select a file and click **Upload via /api/auth/asset**
  (uses Bearer token + API base URL, then auto-fills `mediaUrl`)

The app sends media as chat payload metadata (URL reference), not raw binary over socket.

Room id is auto-built as `min(userA,userB)_max(userA,userB)`.

Message emit payload:

```json
{
  "room": "2_3",
  "message": {
    "type": "text",
    "message": "hello",
    "userId": 3
  }
}
```

`message.userId` is the recipient (peer) id.
