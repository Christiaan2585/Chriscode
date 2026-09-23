# Setting up "Sign in with Google"

The app already has the whole Google sign-in flow built and wired up - it's
just switched off until you give it a Client ID and secret from Google. Until
then, the "Continue with Google" button simply stays hidden and everyone
signs in with email + password instead. Nothing else changes.

This takes about 5 minutes and is free.

## 1. Create a Google Cloud project (skip if you already have one)

1. Go to [console.cloud.google.com](https://console.cloud.google.com/).
2. Sign in with any Google account.
3. Top-left project dropdown -> **New Project**. Name it something like
   "Sandveld Vee Dienste" -> **Create**.

## 2. Configure the consent screen

1. In the left sidebar: **APIs & Services -> OAuth consent screen**.
2. User type: **External** (this just controls who *can* sign in, not who
   actually has an account in the app - your own login screen still checks
   that against the accounts an admin has added).
3. Fill in the app name ("Sandveld Vee Dienste"), your email as support
   contact, and your email again as developer contact. Save through the
   remaining steps with defaults.
4. Under **Audience** / **Test users** (while the app is in "Testing" mode),
   add the Gmail addresses of everyone who should be able to sign in with
   Google. You can add more later. (Publishing the app to "Production" removes
   this limit, but isn't required for internal/staff use.)

## 3. Create the OAuth Client ID

1. **APIs & Services -> Credentials -> + Create Credentials -> OAuth client ID**.
2. Application type: **Desktop app**.
3. Name it anything, e.g. "Sandveld Vee Dienste Desktop".
4. Click **Create**. Google shows you a **Client ID** and **Client secret** -
   keep this popup open (or download the JSON).

## 4. Add them to the app

Where this file goes depends on how you're running the app:

- **Running from source with `launch.bat`** (this project folder): open
  [config/google_oauth.json](config/google_oauth.json) in the project folder.
- **Running an installed copy** (built via `desktop-app\build_and_package.bat`
  and installed on this or another PC): the installed app reads this from its
  own per-user data folder instead - `google_oauth.json` inside
  `%APPDATA%\Sandveld Vee Dienste\` (the same folder shown on the Settings
  page as where the database lives). Create the file there if it doesn't
  exist yet.

Either way, fill in the two values:

```json
{
  "client_id": "your-client-id.apps.googleusercontent.com",
  "client_secret": "your-client-secret"
}
```

Save the file, then restart the app (close and reopen it, or re-run
`launch.bat`). The "Continue with Google" button will now appear on the
sign-in screen automatically - no code changes needed.

The project-folder copy (`config/google_oauth.json`) is already excluded from
version control (see `.gitignore`), so the secret won't accidentally get
committed or shared. The `%APPDATA%` copy on an installed PC lives outside
the project entirely and is never part of git either way.

## How it works, briefly

Clicking "Continue with Google" opens Google's sign-in page in your normal
default browser (not inside the app - Google blocks its login page from
running inside embedded app windows). After you approve, it redirects back to
a temporary local address the app is listening on, and the app takes it from
there.

The **first** person to ever sign in with Google (on a brand-new install)
becomes the admin automatically. After that, an admin has to add a teammate's
email from **Settings -> Security** before that person can sign in - either
with the temporary password the admin sets, or straight away with Google if
they use the same email address there.
