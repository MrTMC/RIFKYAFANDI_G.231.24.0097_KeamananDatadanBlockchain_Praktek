<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Data lives in Postgres (Supabase), accessed ONLY by server code in src/backend/* through server functions (src/backend/fns.ts). Never import src/backend/db.ts, env.ts or service.ts from browser code.
- Schema: supabase/schema.sql (RLS on, no policies — public Supabase API has no access).
- Auth: wallet signs a login message (src/lib/loginMessage.ts); server verifies ed25519 + nonce and sets an HMAC session cookie (src/backend/session.ts). Roles come from the database.
- Writes that reference chain data (distribution record / confirmation) are accepted only after the server reads the transaction from Solana (src/backend/solanaRpc.ts) and checks memo + signer.
- Solana libraries must stay out of the SSR bundle (guarded with import.meta.env.SSR).
- Tests: src/test/*.test.ts; server integration tests need TEST_DATABASE_URL.
