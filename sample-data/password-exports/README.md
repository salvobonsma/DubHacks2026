# Password-manager sample exports (fake data)

Alex Chen's data in the formats the "Password manager" import reads (`POST /api/connectors/password-manager`,
`lib/passwordManager.ts`). Everything here is made up. Every password, PIN, CVV, note and OTP secret is a
`CANARY-…` string, so a leak is easy to grep for: none of them may appear in the sources table, the twin, an API
response or the server log.

| File | Format | What Formly keeps |
|---|---|---|
| `1password-alex-chen.1pux` | 1Password 1PUX (zip with `export.data`) | identity, card (no CVV / PIN), driver's license, passport, SSN, bank account (no PIN); the login, password and note items are skipped |
| `bitwarden-alex-chen.json` | Bitwarden unencrypted .json | identity (+ the "Date of birth" text field), card (no code); the login and note are skipped |
| `chrome-passwords-alex-chen.csv` | Google Password Manager / Chrome (`name,url,username,password,note`) | logins, encrypted in the `logins` table; the twin gets only emails, usernames and sites |
| `apple-passwords-alex-chen.csv` | Apple Passwords (`Title,URL,Username,Password,Notes,OTPAuth`) | same, OTP secrets encrypted too |
